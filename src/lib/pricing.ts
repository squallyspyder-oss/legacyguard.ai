// Pricing and quota scaffolding for future token-based plans.
// Note: values are placeholders; adjust with real OpenAI billing rates.

export type PlanId = 'free' | 'pro' | 'enterprise';

export type PlanLimits = {
  monthlyTokens: number; // total tokens (prompt + completion) allowed per billing month
  hardCap: boolean; // if true, block when quota exhausted; otherwise allow overage billing
  overageUsdPer1k?: number; // optional overage price per 1k tokens
};

export type UsageRecord = {
  userId: string;
  month: string; // YYYY-MM
  tokensUsed: number;
  usdEstimated: number;
};

// Placeholder pricing table (per 1k tokens). Update with actual contract rates.
const MODEL_PRICES_USD_PER_1K = {
  'gpt-5.1-codex-max': { prompt: 0.006, completion: 0.018 },
  'gpt-4o': { prompt: 0.005, completion: 0.015 },
  'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: { monthlyTokens: 200_000, hardCap: true },
  pro: { monthlyTokens: 5_000_000, hardCap: false, overageUsdPer1k: 0.02 },
  enterprise: { monthlyTokens: 50_000_000, hardCap: false, overageUsdPer1k: 0.015 },
};

export function estimateCostUSD(params: {
  model: string;
  promptTokens: number;
  completionTokens: number;
}): { usd: number; per1kPrompt: number; per1kCompletion: number } {
  const price = MODEL_PRICES_USD_PER_1K[params.model as keyof typeof MODEL_PRICES_USD_PER_1K];
  if (!price) {
    return { usd: 0, per1kPrompt: 0, per1kCompletion: 0 };
  }
  const usd = (params.promptTokens / 1000) * price.prompt + (params.completionTokens / 1000) * price.completion;
  return { usd, per1kPrompt: price.prompt, per1kCompletion: price.completion };
}

// Simple in-memory tracker (placeholder). Replace with persistent store when wiring billing.
export class InMemoryUsageTracker {
  private usage: Map<string, UsageRecord> = new Map();

  constructor(private planLimits: Record<PlanId, PlanLimits> = PLAN_LIMITS) {}

  private key(userId: string, month: string) {
    return `${userId}:${month}`;
  }

  record(userId: string, month: string, tokens: number, usd: number) {
    const k = this.key(userId, month);
    const prev = this.usage.get(k);
    const next: UsageRecord = {
      userId,
      month,
      tokensUsed: (prev?.tokensUsed || 0) + tokens,
      usdEstimated: (prev?.usdEstimated || 0) + usd,
    };
    this.usage.set(k, next);
    return next;
  }

  get(userId: string, month: string) {
    return this.usage.get(this.key(userId, month));
  }

  isOverLimit(plan: PlanId, tokensUsed: number) {
    const limits = this.planLimits[plan];
    return tokensUsed >= limits.monthlyTokens;
  }
}
