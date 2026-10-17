'use client';

import { RERABadge, RatingStars, TierBadge } from '@/components/common/Badges';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatArea, formatINR, formatPossession, formatRate, priceBreakdown } from '@/lib/price';
import { Separator } from '@/components/ui/separator';
import type { FlatDetail, PriceBreakdown as Breakdown } from '@/lib/types';

/**
 * The full price breakdown.
 *
 * Mirrors the server's `flatDetailPayload.priceBreakdown` exactly so a buyer can
 * verify the arithmetic themselves. Commission is deliberately absent here and
 * called out separately in the booking flow — RULE 4.
 */
export const PriceBreakdownCard = ({
  flat,
  className,
}: {
  flat: Pick<
    FlatDetail,
    'sizeSqft' | 'pricePerSqft' | 'floorRise' | 'parkingCharges' | 'totalPrice' | 'tier' | 'tokenAmount' | 'commissionPercent' | 'priceBreakdown'
  >;
  className?: string;
}) => {
  const server: Breakdown | undefined = flat.priceBreakdown;
  const client = priceBreakdown({
    sizeSqft: flat.sizeSqft,
    pricePerSqft: flat.pricePerSqft,
    floorRise: flat.floorRise,
    parkingCharges: flat.parkingCharges,
  });

  const baseTotal = server?.baseTotal ?? client.baseTotal;
  const floorRise = server?.floorRise ?? client.floorRise;
  const parkingCharges = server?.parkingCharges ?? client.parkingCharges;
  const total = server?.totalPrice ?? flat.totalPrice;
  const tier = server?.tier ?? flat.tier;
  const thresholds = server?.tierThresholds;

  const rows: Array<{ label: string; value: string; hint?: string }> = [
    { label: 'Carpet area', value: formatArea(flat.sizeSqft) },
    { label: 'Price per sq ft', value: formatINR(flat.pricePerSqft) },
    { label: 'Base total', value: formatINR(baseTotal), hint: `${flat.sizeSqft} × ${formatINR(flat.pricePerSqft)}` },
  ];

  if (floorRise > 0) rows.push({ label: 'Floor rise', value: formatINR(floorRise), hint: 'Higher floors cost more' });
  if (parkingCharges > 0) rows.push({ label: 'Parking charges', value: formatINR(parkingCharges) });

  return (
    <Card className={className}>
      <CardContent className="space-y-4 p-4 pt-4 sm:p-5 sm:pt-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">Price breakdown</h2>
          <TierBadge tier={tier} showRange />
        </div>

        <dl className="space-y-2.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-3 text-sm">
              <dt className="text-slate-600">
                {row.label}
                {row.hint ? <span className="block text-[11px] text-slate-400">{row.hint}</span> : null}
              </dt>
              <dd className="shrink-0 font-medium tabular-nums text-slate-900">{row.value}</dd>
            </div>
          ))}
        </dl>

        <Separator />

        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-slate-900">Total price</span>
          <span className="text-2xl font-bold tabular-nums text-slate-900">{formatINR(total)}</span>
        </div>
        <p className="-mt-2 text-right text-[11px] text-slate-500">{formatRate(flat.pricePerSqft)} all-in</p>

        {thresholds ? (
          <p className="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
            Tier is calculated by the platform from the total price: Budget below {formatINR(thresholds.budget)}, Mid up
            to {formatINR(thresholds.mid)}, Luxury above that. You cannot set your own tier.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};

/** Compact tier + trust strip shown above the gallery. */
export const FlatTrustStrip = ({
  reraVerified,
  reraNumber,
  tier,
  rating,
  possessionDate,
  className,
}: {
  reraVerified?: boolean;
  reraNumber?: string | null;
  tier: string;
  rating?: { avg: number; count: number } | null;
  possessionDate?: string | null;
  className?: string;
}) => (
  <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
    <TierBadge tier={tier} showRange />
    <RERABadge verified={reraVerified} reraNumber={reraNumber} />
    {rating ? <RatingStars value={rating.avg} count={rating.count} size="sm" /> : null}
    <Badge variant="outline">{formatPossession(possessionDate)}</Badge>
  </div>
);