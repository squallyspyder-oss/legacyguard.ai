import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ensureGroup, readGroup, ack, requeueForRetry, DEFAULT_RETRY_CONFIG, getRetryInfo, sendToDLQ } from '../src/lib/queue';
import { indexRepo, isVectorIndexingEnabled } from '../src/lib/indexer-pgvector';
import { logEvent } from '../src/lib/audit';
import { logBootDiagnostics } from '../src/lib/boot';

const envLocal = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
dotenv.config();

const STREAM = 'indexing';
const GROUP = 'indexing-consumers';
const CONSUMER = `indexer-${process.pid}`;
const MAX_CONCURRENCY = Number(process.env.INDEXER_MAX_CONCURRENCY || 2);

let activeJobs = 0;
let shuttingDown = false;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMessage(pairs: string[]): Record<string, any> {
  const data: Record<string, any> = {};
  for (let i = 0; i < pairs.length; i += 2) {
    const key = pairs[i];
    const val = pairs[i + 1];
    try {
      data[key] = JSON.parse(val);
    } catch {
      data[key] = val;
    }
  }
  return data;
}

async function handleIndexing(id: string, pairs: string[]) {
  const data = parseMessage(pairs);
  const owner = data.owner as string | undefined;
  const repo = data.repo as string | undefined;
  const commit = data.commit as string | undefined;
  const eventType = data.eventType as string | undefined;
  const deliveryId = data.deliveryId as string | undefined;

  const metadata = { owner, repo, commit, eventType, deliveryId, attempt: getRetryInfo(data).attempt };

  if (!owner || !repo) {
    await logEvent({
      action: 'indexing.invalid_payload',
      severity: 'error',
      message: 'Payload de indexação sem owner/repo',
      metadata,
    });
    await ack(STREAM, GROUP, id);
    return;
  }

  if (!isVectorIndexingEnabled()) {
    await logEvent({
      action: 'indexing.prereq.missing',
      severity: 'error',
      message: 'PGVECTOR_URL/OPENAI_API_KEY ausentes - não é possível indexar',
      metadata,
      repo: { owner, repo },
    });
    await sendToDLQ({ ...data, owner, repo }, 'Vector indexing prerequisites missing', getRetryInfo(data).attempt + 1);
    await ack(STREAM, GROUP, id);
    return;
  }

  try {
    await logEvent({
      action: 'indexing.started',
      severity: 'info',
      message: `Iniciando indexação para ${owner}/${repo}`,
      metadata,
      repo: { owner, repo },
    });

    const token = process.env.GITHUB_TOKEN;
    const result = await indexRepo(owner, repo, token);

    await logEvent({
      action: 'indexing.completed',
      severity: 'info',
      message: `Indexação concluída para ${owner}/${repo}`,
      metadata: { ...metadata, filesIndexed: result.filesIndexed, chunksCreated: result.chunksCreated },
      repo: { owner, repo },
    });
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    await logEvent({
      action: 'indexing.failed',
      severity: 'error',
      message: `Indexação falhou para ${owner}/${repo}: ${errorMsg}`,
      metadata: { ...metadata, error: errorMsg },
      repo: { owner, repo },
    });

    const retryResult = await requeueForRetry(STREAM, data, errorMsg, DEFAULT_RETRY_CONFIG);
    if (!retryResult.requeued) {
      await logEvent({
        action: 'indexing.dlq',
        severity: 'error',
        message: `Indexação enviada para DLQ após ${retryResult.attempt} tentativas`,
        metadata: { ...metadata, finalAttempt: retryResult.attempt },
        repo: { owner, repo },
      });
    }
  } finally {
    await ack(STREAM, GROUP, id);
  }
}

async function main() {
  logBootDiagnostics('indexing-worker');
  await ensureGroup(STREAM, GROUP).catch(() => {});
  console.log('🚀 Indexing Worker iniciado');
  console.log(`   Consumer: ${CONSUMER}`);
  console.log(`   Stream: ${STREAM}`);
  console.log(`   Concurrency limit: ${MAX_CONCURRENCY}`);

  process.on('SIGTERM', () => {
    console.log('🛑 Recebido SIGTERM - parando novas leituras');
    shuttingDown = true;
  });

  while (true) {
    try {
      if (shuttingDown) {
        if (activeJobs === 0) break;
        await delay(200);
        continue;
      }

      if (activeJobs >= MAX_CONCURRENCY) {
        await delay(100);
        continue;
      }

      const batchSize = Math.max(1, MAX_CONCURRENCY - activeJobs);
      const res = await readGroup(STREAM, GROUP, CONSUMER, batchSize, 2000);
      if (!res || !Array.isArray(res)) continue;

      for (const [, items] of res as Array<[string, Array<[string, string[]]>]>) {
        for (const [id, pairs] of items) {
          activeJobs += 1;
          handleIndexing(id, pairs)
            .catch((err) => console.error('[indexer] erro ao processar', err))
            .finally(() => {
              activeJobs -= 1;
            });
        }
      }
    } catch (err) {
      console.error('[indexer] Erro no loop:', err);
      await delay(2000);
    }
  }

  console.log('Indexing worker finalizado');
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Indexing worker crashed:', e);
    process.exit(1);
  });
}
