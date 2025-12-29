import { ensureGroup, readGroup, ack, enqueueTask } from '../lib/queue';
import { buildIncidentTwin } from '../agents/twin-builder';
import { emitSandboxLog } from '../lib/sandbox-logs';

const STREAM = 'agents';
const GROUP = 'agents-consumers';
const CONSUMER = `consumer-${process.pid}`;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function info(msg: string) {
  console.log(`[worker] ${msg}`);
}

async function processMessage(message: any) {
  const fields = message[1];
  const data: Record<string, any> = {};
  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i];
    const val = fields[i + 1];
    try {
      data[key] = JSON.parse(val);
    } catch {
      data[key] = val;
    }
  }

  const role = data.role;
  const taskId = data.taskId || 'unknown';

  switch (role) {
    case 'twin-builder': {
      info(`Processando twin-builder ${taskId}`);
      const result = await buildIncidentTwin({
        taskId,
        incident: data.incident,
        repoPath: data.repoPath || process.cwd(),
        sandbox: data.sandbox,
      });

      await enqueueTask('agent-results', {
        taskId,
        role,
        type: 'twin-built',
        result,
      });
      break;
    }
    default:
      info(`Role não suportado: ${role}`);
  }
}

export async function startAgentsConsumer() {
  await ensureGroup(STREAM, GROUP);
  info('Iniciando consumer de agents...');

  // Loop simples; em produção, considerar graceful shutdown e backoff
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await readGroup(STREAM, GROUP, CONSUMER, 10, 5000);
    if (!res) continue;

    for (const [, messages] of res as [string, [string, string[]][]][]) {
      for (const msg of messages) {
        const id = msg[0];
        const fields = msg[1];
        // Parse taskId from fields array (key-value pairs)
        const taskIdIndex = fields.indexOf('taskId');
        const taskId = taskIdIndex >= 0 ? fields[taskIdIndex + 1] : 'unknown';
        const roleIndex = fields.indexOf('role');
        const role = roleIndex >= 0 ? fields[roleIndex + 1] : 'unknown';
        
        let attempts = 0;
        // retry simples em memória
        while (attempts < MAX_RETRIES) {
          try {
            await processMessage(msg);
            break;
          } catch (err: any) {
            attempts += 1;
            emitSandboxLog({ taskId, message: `[worker] erro (tentativa ${attempts}): ${err?.message || err}` });
            console.error('Erro ao processar mensagem', err);
            if (attempts >= MAX_RETRIES) {
              await enqueueTask('agent-results', {
                taskId,
                role,
                type: 'error',
                error: err?.message || String(err),
              });
              break;
            }
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempts));
          }
        }
        await ack(STREAM, GROUP, id);
      }
    }
  }
}

// Permite rodar standalone via ts-node / node -r ts-node/register
if (require.main === module) {
  startAgentsConsumer().catch((err) => {
    console.error('Fatal no consumer', err);
    process.exit(1);
  });
}
