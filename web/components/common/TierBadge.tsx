'use client';

import { Badge } from '@/components/ui/badge';
import type { Tier } from '@/lib/price';
import { cn } from '@/lib/utils';

/** Style per band — the tier is always server-calculated, never submitted. */
const TIER_STYLES: Record<Tier, { variant: 'success' | 'info' | 'warning'; label: string; range: string }> = {
  budget: { variant: 'success', label: 'Budget', range: 'Under ₹50L' },
  mid: { variant: 'info', label: 'Mid', range: '₹50L – ₹1.5Cr' },
  luxury: { variant: 'warning', label: 'Luxury', range: '₹1.5Cr+' },
};

/** Budget / Mid / Luxury pill derived from the server-calculated tier. */
export const TierBadge = ({
  tier,
  size = 'md',
  showRange = false,
  className,
}: {
  tier?: Tier | string | null;
  size?: 'sm' | 'md' | 'lg';
  showRange?: boolean;
  className?: string;
}) => {
  const key = (TIER_STYLES[tier as Tier] ? (tier as Tier) : undefined) ?? undefined;
  if (!key) return null;
  const style = TIER_STYLES[key];
  return (
    <Badge variant={style.variant} size={size} className={cn('uppercase tracking-wide', className)}>
      {style.label}
      {showRange ? <span className="font-medium opacity-80">· {style.range}</span> : null}
    </Badge>
  );
};