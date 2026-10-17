import { IndianRupee } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

import { BookingWizard } from '@/components/booking/BookingWizard';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { flatsApi, metaApi } from '@/lib/api';
import { formatINR } from '@/lib/price';
import type { FlatDetail, TierConfig } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Reserve a flat with a token',
  description:
    'Raise a booking token, book a site visit and upload your documents. Your token is held in escrow until an admin verifies the paperwork.',
  robots: { index: false, follow: false },
};


export default async function BookingPage({ params }: { params: { flatId: string } }) {
  let flat: FlatDetail;
  let config: TierConfig | undefined;
  let configError: string | null = null;

  try {
    flat = (await flatsApi.get(params.flatId)).data;
  } catch {
    notFound();
  }
  if (!flat) notFound();

  try {
    config = (await metaApi.tierConfig()).data;
  } catch (error) {
    config = undefined;
    configError = error instanceof Error ? error.message : String(error);
  }

  // Only offer amounts the API will accept. The fallback matches the shipped
  // PlatformConfig default so the funnel still works if this fetch fails.
  const allowedTokens =
    config?.booking.allowedTokenAmounts?.length
      ? config.booking.allowedTokenAmounts
      : [50_000, 100_000, 200_000, 500_000];

  return (
    <div className="ft-container max-w-3xl pb-16 pt-6">
      <header className="mb-5">
        <Link href={`/flat/${flat.id}`} className="text-sm font-medium text-slate-600 hover:text-emerald-700">
          ← Back to the flat
        </Link>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          Reserve {flat.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {[flat.project?.locality, flat.project?.city].filter(Boolean).join(', ')} ·{' '}
          <span className="font-semibold text-slate-900">{formatINR(flat.totalPrice)}</span> · booking token{' '}
          {formatINR(flat.tokenAmount)}
        </p>
      </header>

      {!flat.isAvailable ? (
        <Alert tone="warning" title="This flat is sold out" className="mb-5">
          It remains visible for reference, but new bookings are closed.
        </Alert>
      ) : null}

      <BookingWizard flat={flat} allowedTokens={allowedTokens} />

      <section className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <IndianRupee className="size-4 text-emerald-700" aria-hidden="true" />
          What happens to your money
        </h2>
        <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-slate-600">
          <li>
            <strong className="text-slate-800">Site visit charges</strong> go to the platform and are 100% refundable
            when you book the flat.
          </li>
          <li>
            <strong className="text-slate-800">The booking token</strong> is held in escrow. 90% is released to the
            builder once an admin verifies your documents; the platform retains a 10% commission on the token only.
          </li>
          <li>
            <strong className="text-slate-800">When an agent is involved</strong>, their share comes out of that 10%
            commission (70/30 by default) — never from the builder&rsquo;s 90%.
          </li>
        </ul>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href={`/flat/${flat.id}`}>Back to the listing</Link>
        </Button>
      </section>

      {configError ? (
        <Alert tone="warning" title="Live token amounts unavailable" className="mt-4">
          The platform&rsquo;s published token amounts could not be read
          {configError ? <> ({configError})</> : null}, so the defaults are offered instead. If a booking is
          rejected for its token amount, contact support before retrying.
        </Alert>
      ) : null}
    </div>
  );
}