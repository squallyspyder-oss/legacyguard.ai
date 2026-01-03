import { connectRedis } from '../../../../lib/queue';
import { subscribeToOrchestration, subscribeToAllOrchestrations, OrchestrationEvent } from '../../../../lib/pubsub';

/**
 * SSE endpoint para receber atualizações em tempo real
 * 
 * Usa duas fontes de eventos:
 * 1. Redis Pub/Sub - para eventos de orquestração em tempo real (preferido)
 * 2. Redis Streams (agent-results) - para compatibilidade com sistema legado
 * 
 * Se taskId é fornecido, subscreve apenas a eventos dessa task.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const taskId = url.searchParams.get('taskId');
  const usePubSubOnly = url.searchParams.get('pubsub') === 'true';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        try {
          const event = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(event));
        } catch {
          // Stream pode ter sido fechado
        }
      };

      // Variável para rastrear se stream ainda está ativo
      let isActive = true;
      
      // Cleanup handlers
      const cleanupFns: Array<() => Promise<void>> = [];
      
      // 1. Setup Pub/Sub subscription
      if (taskId) {
        // Subscrever a uma task específica
        const { unsubscribe } = subscribeToOrchestration(
          taskId,
          (event: OrchestrationEvent) => {
            if (!isActive) return;
            sendEvent({
              source: 'pubsub',
              eventType: event.type,
              taskId: event.taskId,
              timestamp: event.timestamp,
              data: event.data,
            });
          },
          (error) => {
            console.error('[Stream] Pub/Sub error:', error);
            sendEvent({ type: 'pubsub-error', message: error.message });
          }
        );
        cleanupFns.push(unsubscribe);
        sendEvent({ type: 'subscribed', taskId, source: 'pubsub' });
      } else {
        // Subscrever a todas as orquestrações (admin/debug)
        const { unsubscribe } = subscribeToAllOrchestrations(
          (event: OrchestrationEvent) => {
            if (!isActive) return;
            sendEvent({
              source: 'pubsub-all',
              eventType: event.type,
              taskId: event.taskId,
              timestamp: event.timestamp,
              data: event.data,
            });
          },
          (error) => {
            console.error('[Stream] Pub/Sub all error:', error);
          }
        );
        cleanupFns.push(unsubscribe);
        sendEvent({ type: 'subscribed', source: 'pubsub-all' });
      }
      
      // 2. Setup Redis Streams polling (legacy, skip if pubsub-only mode)
      let pollInterval: NodeJS.Timeout | null = null;
      
      if (!usePubSubOnly) {
        const redis = connectRedis();
        if (redis) {
          const resultsStream = 'agent-results';
          let lastId = '$';
          
          sendEvent({ type: 'connected', message: 'Conectado ao stream de resultados', source: 'redis-stream' });

          pollInterval = setInterval(async () => {
            if (!isActive) return;
            
            try {
              const results = await redis.xread('BLOCK', 1000, 'STREAMS', resultsStream, lastId);

              if (results) {
                for (const [, messages] of results) {
                  for (const [id, fields] of messages) {
                    lastId = id;

                    const data: Record<string, unknown> = {};
                    for (let i = 0; i < fields.length; i += 2) {
                      const key = fields[i];
                      const val = fields[i + 1];
                      try {
                        data[key] = JSON.parse(val);
                      } catch {
                        data[key] = val;
                      }
                    }

                    // Filtrar por taskId se especificado
                    if (taskId && data.taskId !== taskId) continue;

                    sendEvent({
                      type: 'result',
                      source: 'redis-stream',
                      id,
                      ...data,
                    });
                  }
                }
              }
            } catch (err) {
              console.error('Erro ao ler stream de resultados:', err);
            }
          }, 500);
        } else {
          sendEvent({ type: 'warning', message: 'Redis Streams não disponível, usando apenas Pub/Sub' });
        }
      }

      // Cleanup quando cliente desconecta
      req.signal.addEventListener('abort', async () => {
        isActive = false;
        
        if (pollInterval) {
          clearInterval(pollInterval);
        }
        
        // Executar cleanup de subscriptions
        for (const cleanup of cleanupFns) {
          try {
            await cleanup();
          } catch {
            // Ignorar erros de cleanup
          }
        }
        
        try {
          controller.close();
        } catch {
          // Stream já pode estar fechado
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
