"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const sandbox_logs_1 = require("../../../../lib/sandbox-logs");
async function GET(req) {
    const url = new URL(req.url);
    const taskIdFilter = url.searchParams.get('taskId');
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            const send = (data) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };
            const listener = (event) => {
                if (taskIdFilter && event.taskId !== taskIdFilter)
                    return;
                send({ type: 'sandbox-log', ...event });
            };
            sandbox_logs_1.sandboxLogEmitter.on('log', listener);
            const heartbeat = setInterval(() => {
                controller.enqueue(encoder.encode(':\n\n'));
            }, 15000);
            req.signal.addEventListener('abort', () => {
                sandbox_logs_1.sandboxLogEmitter.off('log', listener);
                clearInterval(heartbeat);
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
