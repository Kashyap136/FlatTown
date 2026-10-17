import type { TierThresholds } from './tierCalculator';
import { DEFAULT_TIER_THRESHOLDS } from './tierCalculator';
import { env } from '../config/env';

export interface PricingContext {
  thresholds: TierThresholds;
  commissionPercent: number;
  agentPlatformPercent: number;
  agentPercent: number;
  defaultTokenAmount: number;
  defaultVisitCharge: number;
  maxVisitCharge: number;
  updatedAt: Date;
}

/**
 * In-memory mirror of the admin-managed PlatformConfig document.
 *
 * Mongoose validators run synchronously and the tier/commission engine is used
 * inside them, so the authoritative config is cached here and refreshed from
 * MongoDB on boot and after every admin configuration change.
 */
let context: PricingContext = {
  thresholds: {
    budget: env.defaultTierBudget ?? DEFAULT_TIER_THRESHOLDS.budget,
    mid: env.defaultTierMid ?? DEFAULT_TIER_THRESHOLDS.mid,
  },
  commissionPercent: env.defaultCommissionPercent,
  agentPlatformPercent: env.defaultAgentSplitPlatformPercent,
  agentPercent: env.defaultAgentSplitAgentPercent,
  defaultTokenAmount: env.defaultTokenAmount,
  defaultVisitCharge: env.defaultVisitCharge,
  maxVisitCharge: 499,
  updatedAt: new Date(),
};

export const getPricingContext = (): PricingContext => context;

export const setPricingContext = (next: Partial<PricingContext>): PricingContext => {
  context = { ...context, ...next, updatedAt: new Date() };
  return context;
};