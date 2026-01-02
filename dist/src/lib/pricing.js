"use strict";
// Pricing and quota scaffolding for future token-based plans.
// Note: values are placeholders; adjust with real OpenAI billing rates.
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryUsageTracker = exports.PLAN_LIMITS = void 0;
exports.estimateCostUSD = estimateCostUSD;
// Placeholder pricing table (per 1k tokens). Update with actual contract rates.
const MODEL_PRICES_USD_PER_1K = {
    'gpt-5.1-codex-max': { prompt: 0.006, completion: 0.018 },
    'gpt-4o': { prompt: 0.005, completion: 0.015 },
    'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
};
exports.PLAN_LIMITS = {
    free: { monthlyTokens: 200000, hardCap: true },
    pro: { monthlyTokens: 5000000, hardCap: false, overageUsdPer1k: 0.02 },
    enterprise: { monthlyTokens: 50000000, hardCap: false, overageUsdPer1k: 0.015 },
};
function estimateCostUSD(params) {
    const price = MODEL_PRICES_USD_PER_1K[params.model];
    if (!price) {
        return { usd: 0, per1kPrompt: 0, per1kCompletion: 0 };
    }
    const usd = (params.promptTokens / 1000) * price.prompt + (params.completionTokens / 1000) * price.completion;
    return { usd, per1kPrompt: price.prompt, per1kCompletion: price.completion };
}
// Simple in-memory tracker (placeholder). Replace with persistent store when wiring billing.
class InMemoryUsageTracker {
    constructor(planLimits = exports.PLAN_LIMITS) {
        this.planLimits = planLimits;
        this.usage = new Map();
    }
    key(userId, month) {
        return `${userId}:${month}`;
    }
    record(userId, month, tokens, usd) {
        const k = this.key(userId, month);
        const prev = this.usage.get(k);
        const next = {
            userId,
            month,
            tokensUsed: ((prev === null || prev === void 0 ? void 0 : prev.tokensUsed) || 0) + tokens,
            usdEstimated: ((prev === null || prev === void 0 ? void 0 : prev.usdEstimated) || 0) + usd,
        };
        this.usage.set(k, next);
        return next;
    }
    get(userId, month) {
        return this.usage.get(this.key(userId, month));
    }
    isOverLimit(plan, tokensUsed) {
        const limits = this.planLimits[plan];
        return tokensUsed >= limits.monthlyTokens;
    }
}
exports.InMemoryUsageTracker = InMemoryUsageTracker;
