/**
 * Pricing / tier / commission engine — the single source of truth on the server.
 *
 * Business rules enforced here (never trusted from the client):
 *  1. totalPrice = sizeSqft * pricePerSqft (+ optional floorRise + parkingCharges)
 *  2. tier is derived from totalPrice using admin-configurable thresholds
 *  3. platform commission = 10% of the BOOKING TOKEN ONLY (never of totalPrice)
 *  4. when an agent is involved, the commission is split by the configured ratio
 *     (default 70% platform / 30% agent)
 */

export type Tier = 'budget' | 'mid' | 'luxury';

export interface TierThresholds {
  /** Upper bound (exclusive) of the budget band. */
  budget: number;
  /** Upper bound (exclusive) of the mid band. */
  mid: number;
}

export const DEFAULT_TIER_THRESHOLDS: TierThresholds = {
  budget: 5_000_000,
  mid: 15_000_000,
};

export interface PriceBreakdownInput {
  sizeSqft: number;
  pricePerSqft: number;
  floorRise?: number;
  parkingCharges?: number;
}

export interface PriceBreakdown {
  sizeSqft: number;
  pricePerSqft: number;
  baseTotal: number;
  floorRise: number;
  parkingCharges: number;
  totalPrice: number;
  tier: Tier;
}

/** ₹50,00,000 etc. */
export const roundToRupee = (value: number): number => Math.round(value);

/**
 * totalPrice = sizeSqft * pricePerSqft + optional floorRise + parkingCharges
 */
export const calcTotal = (
  sizeSqft: number,
  pricePerSqft: number,
  floorRise = 0,
  parkingCharges = 0,
): number => roundToRupee(sizeSqft * pricePerSqft + (floorRise || 0) + (parkingCharges || 0));

/**
 * Tier is derived from total price only.
 *  budget : total <  budget threshold        (default ₹50,00,000)
 *  mid    : budget <= total < mid threshold  (default ₹50L – ₹1.5Cr)
 *  luxury : total >= mid threshold
 */
export const calcTier = (totalPrice: number, thresholds: TierThresholds = DEFAULT_TIER_THRESHOLDS): Tier => {
  const { budget, mid } = sanitiseThresholds(thresholds);
  if (totalPrice < budget) return 'budget';
  if (totalPrice < mid) return 'mid';
  return 'luxury';
};

export const sanitiseThresholds = (t?: Partial<TierThresholds>): TierThresholds => {
  const budget = Number.isFinite(t?.budget) && (t?.budget as number) > 0 ? (t!.budget as number) : DEFAULT_TIER_THRESHOLDS.budget;
  let mid = Number.isFinite(t?.mid) && (t?.mid as number) > 0 ? (t!.mid as number) : DEFAULT_TIER_THRESHOLDS.mid;
  if (mid <= budget) mid = DEFAULT_TIER_THRESHOLDS.mid > budget ? DEFAULT_TIER_THRESHOLDS.mid : budget * 3;
  return { budget, mid };
};

export const priceBreakdown = (
  input: PriceBreakdownInput,
  thresholds: TierThresholds = DEFAULT_TIER_THRESHOLDS,
): PriceBreakdown => {
  const sizeSqft = Number(input.sizeSqft) || 0;
  const pricePerSqft = Number(input.pricePerSqft) || 0;
  const floorRise = Number(input.floorRise) || 0;
  const parkingCharges = Number(input.parkingCharges) || 0;
  const baseTotal = roundToRupee(sizeSqft * pricePerSqft);
  const totalPrice = calcTotal(sizeSqft, pricePerSqft, floorRise, parkingCharges);
  return {
    sizeSqft,
    pricePerSqft,
    baseTotal,
    floorRise,
    parkingCharges,
    totalPrice,
    tier: calcTier(totalPrice, thresholds),
  };
};

/**
 * Platform commission is charged on the booking token only.
 *  commissionAmount = tokenAmount * commissionPercent / 100
 */
export const calcCommission = (tokenAmount: number, commissionPercent = 10): number =>
  roundToRupee((Number(tokenAmount) || 0) * (Number(commissionPercent) || 0) / 100);

export interface CommissionSplit {
  commissionPercent: number;
  commissionAmount: number;
  /** Amount routed to the builder from the token (token − commission). */
  builderAmount: number;
  platformAmount: number;
  agentAmount: number;
  agentSharePercent: number;
  /** True when a broker/agent is attached to the booking. */
  hasAgent: boolean;
}

/**
 * Splits the commission on the token.
 * Without an agent: platform = full commission, builder = token − commission.
 * With an agent:    platform = commission * platformPct%, agent = remainder.
 */
export const splitCommission = (
  tokenAmount: number,
  commissionPercent: number,
  hasAgent: boolean,
  agentPlatformPercent = 70,
): CommissionSplit => {
  const token = Number(tokenAmount) || 0;
  const pct = Number(commissionPercent) || 0;
  const commissionAmount = calcCommission(token, pct);
  const builderAmount = roundToRupee(token - commissionAmount);

  if (!hasAgent) {
    return {
      commissionPercent: pct,
      commissionAmount,
      builderAmount,
      platformAmount: commissionAmount,
      agentAmount: 0,
      agentSharePercent: 0,
      hasAgent: false,
    };
  }

  const platformPct = Math.min(Math.max(Number(agentPlatformPercent) || 0, 0), 100);
  const platformAmount = roundToRupee((commissionAmount * platformPct) / 100);
  const agentAmount = roundToRupee(commissionAmount - platformAmount);
  return {
    commissionPercent: pct,
    commissionAmount,
    builderAmount,
    platformAmount,
    agentAmount,
    agentSharePercent: roundToRupee(100 - platformPct),
    hasAgent: true,
  };
};

/** Valid allowed visit charges (₹0 / ₹199 / ₹499). */
export const VISIT_CHARGE_OPTIONS = [0, 199, 499] as const;
export const normaliseVisitCharge = (value: number | undefined | null): number => {
  const n = Number(value ?? 0);
  const match = VISIT_CHARGE_OPTIONS.find((c) => c === n);
  return match ?? 0;
};