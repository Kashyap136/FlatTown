/**
 * Money and tier helpers.
 *
 * IMPORTANT: the server is the single source of truth for `totalPrice`, `tier`,
 * `commission` and every escrow amount (RULE 3). These functions exist to
 * *display* the server's numbers consistently and to power instant client-side
 * feedback while a builder is still typing — they are never sent back as
 * authoritative values.
 */

export type Tier = 'budget' | 'mid' | 'luxury';

export const LAKH = 100_000;
export const CRORE = 10_000_000;

/** Default internal thresholds (RULE 1). Overridable by an admin at runtime. */
export const DEFAULT_TIER_THRESHOLDS = { budget: 5_000_000, mid: 15_000_000 };

/** The published token commission, in percent of the token only (RULE 4). */
export const DEFAULT_COMMISSION_PERCENT = 10;

/** Default platform/agent split of the commission (RULE 4). */
export const DEFAULT_AGENT_PLATFORM_PERCENT = 70;

/** The published site-visit charges. */
export const VISIT_CHARGE_OPTIONS = [0, 199, 499] as const;

export const TIERS: Array<{
  key: Tier;
  label: string;
  short: string;
  description: string;
  tone: 'emerald' | 'sky' | 'amber';
}> = [
  { key: 'budget', label: 'Budget', short: 'Under ₹50L', description: 'Total price below ₹50 lakh', tone: 'emerald' },
  { key: 'mid', label: 'Mid', short: '₹50L – ₹1.5Cr', description: '₹50 lakh to ₹1.5 crore', tone: 'sky' },
  { key: 'luxury', label: 'Luxury', short: '₹1.5Cr+', description: '₹1.5 crore and above', tone: 'amber' },
];

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

/**
 * totalPrice = sizeSqft * pricePerSqft + optional floorRise + optional parking.
 * Mirrors `server/src/utils/tierCalculator.ts#calcTotal`.
 */
export const calcTotal = (
  sizeSqft: number,
  pricePerSqft: number,
  floorRise = 0,
  parkingCharges = 0,
): number => Math.round(Number(sizeSqft) * Number(pricePerSqft) + (floorRise || 0) + (parkingCharges || 0));

/**
 * Tier is derived from the total price only.
 *  budget : total <  budget threshold   (default ₹50,00,000)
 *  mid    : budget <= total < mid threshold (default ₹1,50,00,000)
 *  luxury : total >= mid threshold
 */
export const calcTier = (totalPrice: number, thresholds = DEFAULT_TIER_THRESHOLDS): Tier => {
  const budget = thresholds?.budget ?? DEFAULT_TIER_THRESHOLDS.budget;
  const mid = thresholds?.mid ?? DEFAULT_TIER_THRESHOLDS.mid;
  if (totalPrice < budget) return 'budget';
  if (totalPrice < mid) return 'mid';
  return 'luxury';
};

export const priceBreakdown = (
  input: PriceBreakdownInput,
  thresholds = DEFAULT_TIER_THRESHOLDS,
): PriceBreakdown => {
  const sizeSqft = Number(input.sizeSqft) || 0;
  const pricePerSqft = Number(input.pricePerSqft) || 0;
  const floorRise = Number(input.floorRise) || 0;
  const parkingCharges = Number(input.parkingCharges) || 0;
  const baseTotal = Math.round(sizeSqft * pricePerSqft);
  const totalPrice = baseTotal + floorRise + parkingCharges;
  return { sizeSqft, pricePerSqft, baseTotal, floorRise, parkingCharges, totalPrice, tier: calcTier(totalPrice, thresholds) };
};

/**
 * Commission is a percentage of the BOOKING TOKEN ONLY (RULE 4).
 * It is never derived from the property price.
 */
export const calcCommission = (tokenAmount: number, percent = DEFAULT_COMMISSION_PERCENT): number =>
  Math.round((Number(tokenAmount) || 0) * (Number(percent) || 0)) / 100;

/** Splits a token into builder / platform / agent shares, conserving the total. */
export const splitCommission = (
  tokenAmount: number,
  commissionPercent = DEFAULT_COMMISSION_PERCENT,
  hasAgent = false,
  agentPlatformPercent = DEFAULT_AGENT_PLATFORM_PERCENT,
): {
  commissionAmount: number;
  platformAmount: number;
  agentAmount: number;
  agentSharePercent: number;
  builderAmount: number;
  hasAgent: boolean;
} => {
  const token = Math.round(Number(tokenAmount) || 0);
  const commissionAmount = calcCommission(token, commissionPercent);
  const agentSharePercent = 100 - agentPlatformPercent;
  const platformAmount = hasAgent
    ? Math.round((commissionAmount * Math.min(100, Math.max(0, agentPlatformPercent))) / 100)
    : commissionAmount;
  const agentAmount = hasAgent ? commissionAmount - platformAmount : 0;
  return {
    commissionAmount,
    platformAmount,
    agentAmount,
    agentSharePercent,
    builderAmount: token - commissionAmount,
    hasAgent,
  };
};

/* ------------------------------- formatting ------------------------------- */

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** `₹70,00,000` — Indian digit grouping. */
export const formatINR = (value: number | undefined | null): string => {
  const amount = Number(value);
  return Number.isFinite(amount) ? inrFormatter.format(Math.round(amount)) : '₹0';
};

/** `₹7,000` /sqft. */
export const formatRate = (value: number | undefined | null): string =>
  `${inrFormatter.format(Math.round(Number(value) || 0))}/sq ft`;

/** Compact Indian notation: `₹70 L`, `₹1.5 Cr`, `₹28 L`. */
export const formatCompactINR = (value: number | undefined | null): string => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '₹0';
  const abs = Math.abs(amount);
  if (abs >= CRORE) {
    const crores = amount / CRORE;
    return `₹${trimNumber(crores)} Cr`;
  }
  if (abs >= LAKH) {
    const lakhs = amount / LAKH;
    return `₹${trimNumber(lakhs)} L`;
  }
  if (abs >= 1000) return `₹${inrFormatter.format(Math.round(amount / 1000) * 1000).replace(/000$/, 'k')}`;
  return formatINR(amount);
};

const trimNumber = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
};

/** `1,450 sq ft`. */
export const formatArea = (sqft: number | undefined | null): string =>
  `${new Intl.NumberFormat('en-IN').format(Math.round(Number(sqft) || 0))} sq ft`;

/** `Mar 2027` — possession month and year. */
export const formatPossession = (value: string | Date | undefined | null): string => {
  if (!value) return 'Possession on request';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Possession on request';
  const now = new Date();
  if (date.getTime() <= now.getTime()) return 'Ready to move';
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

export const formatDate = (value: string | Date | undefined | null): string => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatDateTime = (value: string | Date | undefined | null): string => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatNumber = (value: number | undefined | null): string =>
  new Intl.NumberFormat('en-IN').format(Math.round(Number(value) || 0));

/** Possession status derived from the date when the project status is not set. */
export const possessionLabel = (possessionDate: string | Date | undefined | null): string =>
  formatPossession(possessionDate);