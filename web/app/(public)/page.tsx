import { Search, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { Suspense } from 'react';
import type { Metadata } from 'next';

import { MarketplaceBrowser } from '@/components/marketplace/MarketplaceBrowser';
import { FlatCardGridSkeleton } from '@/components/ui/skeleton';
import { prefetchMarketplace } from '@/lib/prefetch';
import { QueryBoundary } from './query-boundary';

export const metadata: Metadata = {
  title: 'New Builder Flats in Pune — Budget, Mid & Luxury',
  description:
    'Browse RERA-verified new-builder flats in Pune by budget, mid and luxury tier, BHK, possession and amenities. Transparent price per sq ft, builder ratings and site visits you can book online.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'New Builder Flats in Pune',
    description: 'Verified flats direct from builders. Filter by tier, BHK, possession and amenities.',
    url: '/',
  },
};

const VALUE_PROPS = [
  {
    icon: Sparkles,
    title: 'New builder flats only',
    body: 'Every listing is a first sale from a developer. Zero resale, zero inflated markups.',
  },
  {
    icon: ShieldCheck,
    title: 'Admin-verified RERA',
    body: 'Only the platform admin can mark a project RERA verified — builders never self-certify.',
  },
  {
    icon: Star,
    title: 'Real builder ratings',
    body: 'Scored on on-time possession, construction quality and verified buyer reviews.',
  },
  {
    icon: Search,
    title: 'Transparent pricing',
    body: 'Price per square foot and the full breakdown are shown on every flat, computed server-side.',
  },
];

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // Prefetched on the server so the first HTML already contains real listings
  // (and the amenity/tier/city masters the filter drawer needs) instead of a
  // loading skeleton. Failures degrade to the normal client-side fetch.
  let dehydratedState;
  try {
    dehydratedState = await prefetchMarketplace(searchParams);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[prefetch] marketplace prefetch failed:', error);
    }
    dehydratedState = undefined;
  }

  const browser = <MarketplaceBrowser />;

  return (
    <>
      <section className="border-b border-slate-200 bg-slate-900 text-white">
        <div className="ft-container py-10 sm:py-14 lg:py-16">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Verified new flats, direct from builders
          </p>
          <h1 className="mt-4 max-w-3xl text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Find your next home, direct from trusted builders.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Budget, mid and luxury apartments across Pune and Mumbai — every price calculated from size × rate, with
            the tier, RERA status and builder rating shown up front. Book a site visit, then reserve with a token held
            in escrow until your documents are verified.
          </p>
        </div>
      </section>

      <section aria-labelledby="why-flattown" className="ft-container py-8 sm:py-10">
        <h2 id="why-flattown" className="sr-only">
          Why book a new builder flat on FLAT TOWN
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {VALUE_PROPS.map((prop) => (
            <li key={prop.title} className="rounded-xl border border-slate-200 bg-white p-4">
              <prop.icon className="size-5 text-emerald-700" aria-hidden="true" />
              <h3 className="mt-2.5 text-sm font-semibold text-slate-900">{prop.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{prop.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/*
        `MarketplaceBrowser` reads the URL query with `useSearchParams`, which
        needs a Suspense boundary so the page can still be prerendered.
      */}
      <Suspense fallback={<FlatCardGridSkeleton count={9} />}>
        {dehydratedState ? <QueryBoundary state={dehydratedState}>{browser}</QueryBoundary> : browser}
      </Suspense>
    </>
  );
}