"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const queue_1 = require("../../../../lib/queue");
// SSE endpoint para receber atualizações em tempo real
async function GET(req) {
    const url = new URL(req.url);
    const taskId = url.searchParams.get('taskId');
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const redis = (0, queue_1.connectRedis)();
            const resultsStream = 'agent-results';
            let lastId = '$'; // Começa do mais recente
            const sendEvent = (data) => {
                const event = `data: ${JSON.stringify(data)}\n\n`;
                controller.enqueue(encoder.encode(event));
            };
            sendEvent({ type: 'connected', message: 'Conectado ao stream de resultados' });
            // Poll por novos resultados
            const pollInterval = setInterval(async () => {
                try {
                    const results = await redis.xread('BLOCK', 1000, 'STREAMS', resultsStream, lastId);
                    if (results) {
                        for (const [, messages] of results) {
                            for (const [id, fields] of messages) {
                                lastId = id;
                                const data = {};
                                for (let i = 0; i < fields.length; i += 2) {
                                    const key = fields[i];
                                    const val = fields[i + 1];
                                    try {
                                        data[key] = JSON.parse(val);
                                    }
                                    catch {
                                        data[key] = val;
                                    }
                                }
                                // Filtrar por taskId se especificado
                                if (taskId && data.taskId !== taskId)
                                    continue;
                                sendEvent({
                                    type: 'result',
                                    id,
                                    ...data,
                                });
                            }
                        }
                    }
                }
                catch (err) {
                    console.error('Erro ao ler stream de resultados:', err);
                }
            }, 500);
            // Cleanup quando cliente desconecta
            req.signal.addEventListener('abort', () => {
                clearInterval(pollInterval);
                controller.close();
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
