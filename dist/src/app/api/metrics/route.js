"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const server_1 = require("next/server");
const metrics_1 = require("@/lib/metrics");
async function GET() {
    const metrics = (0, metrics_1.getMetricsSummary)();
    return server_1.NextResponse.json({ metrics });
}
