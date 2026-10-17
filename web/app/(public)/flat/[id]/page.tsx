import { ArrowLeft, Bath, BedDouble, CalendarCheck2, Compass, Eye, Layers } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AmenitiesPanel } from '@/components/flat/AmenitiesPanel';
import { BuilderCard } from '@/components/flat/BuilderCard';
import { FlatActionPanel } from '@/components/flat/FlatActionPanel';
import { ImageCarousel } from '@/components/flat/ImageCarousel';
import { MapView } from '@/components/flat/MapView';
import { PossessionTimeline } from '@/components/flat/PossessionTimeline';
import { PriceBreakdownCard, FlatTrustStrip } from '@/components/flat/PriceBreakdownCard';
import { ReviewsSection } from '@/components/flat/ReviewsSection';
import { ShareButton } from '@/components/flat/ShareButton';
import { FlatSimilarRail } from '@/components/flat/SimilarFlats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { flatsApi } from '@/lib/api';
import { formatArea, formatINR, formatNumber, formatPossession } from '@/lib/price';
import { absoluteUrl } from '@/lib/utils';
import type { FlatDetail } from '@/lib/types';

/**
 * Live availability, prices and the signed-in buyer's wishlist state are all
 * per-request, so this page is never prerendered or cached. That also keeps
 * `notFound()` returning a real 404 instead of a soft 200.
 */
export const dynamic = 'force-dynamic';

/* --------------------------------- SEO ----------------------------------- */

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  let flat: FlatDetail | undefined;
  try {
    flat = (await flatsApi.get(params.id)).data;
  } catch {
    return {
      title: 'Flat not found',
      description: 'This listing is no longer available on FLAT TOWN.',
      robots: { index: false, follow: false },
    };
  }

  const location = [flat.project?.locality, flat.project?.city].filter(Boolean).join(', ') || 'Pune';
  const builder = flat.builder?.companyName ?? flat.builder?.name ?? 'a verified builder';
  const title = `${flat.bhk} BHK ${flat.type === 'apartment' ? 'Flat' : flat.type} in ${location} — ${formatINR(
    flat.totalPrice,
  )}`;
  const description = `${flat.title} — ${formatArea(flat.sizeSqft)} at ${formatINR(
    flat.pricePerSqft,
  )}/sq ft in ${location}. Total ${formatINR(flat.totalPrice)}, ${flat.tier} tier, possession ${formatPossession(
    flat.possessionDate,
  )}.${flat.project?.isRERAVerified ? ' RERA verified.' : ''} Builder: ${builder}.`;
  const url = absoluteUrl(`/flat/${flat.id}`);
  const image = flat.images?.[0]?.url;

  return {
    title,
    description,
    alternates: { canonical: `/flat/${flat.id}` },
    openGraph: {
      type: 'article',
      title,
      description,
      url,
      siteName: 'FLAT TOWN',
      locale: 'en_IN',
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: flat.title }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
    keywords: [
      `${flat.bhk} BHK flat ${location}`,
      `${flat.title} ${flat.project?.projectName ?? ''}`.trim(),
      flat.tier === 'budget' ? 'affordable flats' : flat.tier === 'luxury' ? 'luxury flats' : 'mid segment flats',
      flat.project?.isRERAVerified ? 'RERA verified flats' : 'new builder flats',
    ],
  };
}

/* --------------------------------- page ---------------------------------- */

/**
 * Loads the flat, returning `null` instead of throwing.
 *
 * `notFound()` is then called from the normal render flow — throwing it from
 * inside a `catch` makes Next.js commit a 200 before the not-found boundary
 * takes over, which would produce a soft 404.
 */
const loadFlat = async (id: string): Promise<FlatDetail | null> => {
  try {
    return (await flatsApi.get(id)).data;
  } catch {
    return null;
  }
};

export default async function FlatDetailPage({ params }: { params: { id: string } }) {
  const flat = await loadFlat(params.id);
  if (!flat) notFound();

  const project = flat.project;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: flat.title,
    description: `${flat.bhk} BHK new builder flat in ${[project?.locality, project?.city].filter(Boolean).join(', ')}`,
    sku: flat.id,
    category: 'New builder flat',
    brand: { '@type': 'Organization', name: flat.builder?.companyName ?? flat.builder?.name ?? 'FLAT TOWN' },
    offers: {
      '@type': 'Offer',
      price: flat.totalPrice,
      priceCurrency: 'INR',
      availability: flat.isAvailable ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Carpet area', value: `${flat.sizeSqft} sq ft` },
      { '@type': 'PropertyValue', name: 'Price per sq ft', value: flat.pricePerSqft, unitText: 'INR' },
      { '@type': 'PropertyValue', name: 'Tier', value: flat.tier },
      { '@type': 'PropertyValue', name: 'Possession', value: formatPossession(flat.possessionDate) },
      ...(project?.isRERAVerified
        ? [{ '@type': 'PropertyValue', name: 'RERA number', value: project.reraNumber ?? 'Verified' }]
        : []),
    ],
  };

  return (
    <div className="ft-container pb-16 pt-4 sm:pt-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-emerald-700"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to marketplace
        </Link>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {typeof flat.views === 'number' ? (
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3.5" aria-hidden="true" />
              {formatNumber(flat.views)} views
            </span>
          ) : null}
          <ShareButton title={flat.title} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:gap-8">
        {/* ------------------------------ main ----------------------------- */}
        <div className="min-w-0 space-y-6">
          <ImageCarousel
            images={flat.images}
            alt={flat.title}
            badge={
              <FlatTrustStrip
                reraVerified={project?.isRERAVerified}
                reraNumber={project?.reraNumber}
                tier={flat.tier}
                rating={flat.builder?.rating}
                possessionDate={flat.possessionDate}
              />
            }
          />

          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-black leading-tight tracking-tight text-slate-900 sm:text-3xl">
                  {flat.title}
                </h1>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                  <Link
                    href={project?.id ? `/project/${project.id}` : '/'}
                    className="font-medium text-emerald-700 hover:underline"
                  >
                    {project?.projectName}
                  </Link>
                  <span aria-hidden="true">·</span>
                  <span>
                    {[project?.locality, project?.city].filter(Boolean).join(', ')}
                  </span>
                  {project?.fullAddress ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="hidden sm:inline">{project.fullAddress}</span>
                    </>
                  ) : null}
                </p>
              </div>
              {!flat.isAvailable ? <Badge variant="danger">Sold out</Badge> : null}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Fact icon={BedDouble} label="Configuration" value={`${flat.bhk} BHK`} />
              <Fact icon={Layers} label="Carpet area" value={formatArea(flat.sizeSqft)} />
              <Fact
                icon={Compass}
                label="Floor"
                value={flat.floor === 0 ? 'Ground floor' : `Floor ${flat.floor}`}
                hint={flat.tower ? `Tower ${flat.tower}` : flat.facing ? `${flat.facing} facing` : undefined}
              />
              <Fact
                icon={CalendarCheck2}
                label="Possession"
                value={formatPossession(flat.possessionDate)}
                hint={project?.status ? project.status.replace(/_/g, ' ') : undefined}
              />
            </dl>
          </div>

          {project?.tour360Url ? (
            <Card>
              <CardHeader>
                <CardTitle>360° virtual tour</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="aspect-video overflow-hidden rounded-lg bg-slate-900">
                  <iframe
                    title={`360 tour of ${flat.title}`}
                    src={project.tour360Url}
                    loading="lazy"
                    allowFullScreen
                    className="size-full border-0"
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}

          <AmenitiesPanel amenities={flat.amenities ?? []} />

          <Card>
            <CardHeader>
              <CardTitle>Location</CardTitle>
              <p className="text-[13px] text-slate-600">
                {[project?.locality, project?.city].filter(Boolean).join(', ')}
                {project?.fullAddress ? ` — ${project.fullAddress}` : ''}
              </p>
            </CardHeader>
            <CardContent>
              <MapView
                marker={
                  project?.geo
                    ? {
                        lat: project.geo.lat,
                        lng: project.geo.lng,
                        label: project.projectName,
                        address: project.fullAddress,
                      }
                    : null
                }
              />
            </CardContent>
          </Card>

          {flat.floorPlan ? (
            <Card>
              <CardHeader>
                <CardTitle>Floor plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {flat.floorPlan.kind === 'document' || /\.pdf($|\?)/i.test(flat.floorPlan.url) ? (
                  <a
                    href={flat.floorPlan.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <Layers className="size-4" aria-hidden="true" />
                    Open floor plan PDF
                  </a>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={flat.floorPlan.url}
                    alt={`Floor plan for ${flat.title}`}
                    className="w-full rounded-lg border border-slate-200"
                    loading="lazy"
                  />
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Possession timeline</CardTitle>
              <p className="text-[13px] text-slate-600">
                How the platform tracks this flat from first interest to handover.
              </p>
            </CardHeader>
            <CardContent>
              <PossessionTimeline reached="inquiry" possessionDate={flat.possessionDate} />
            </CardContent>
          </Card>

          <ReviewsSection flatId={flat.id} />

          <FlatSimilarRail flats={flat.similar ?? []} />
        </div>

        {/* ----------------------------- sidebar ---------------------------- */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="space-y-4">
            <FlatActionPanel flat={flat} />
            <PriceBreakdownCard flat={flat} />
            <BuilderCard builder={flat.builder} />
            {project?.id ? (
              <Card>
                <CardContent className="p-4">
                  <h2 className="text-sm font-bold text-slate-900">About this project</h2>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{project.projectName}</p>
                  <dl className="mt-3 space-y-1.5 text-xs">
                    {project.reraNumber ? (
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">RERA number</dt>
                        <dd className="font-medium text-slate-800">{project.reraNumber}</dd>
                      </div>
                    ) : null}
                    {project.status ? (
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Status</dt>
                        <dd className="font-medium capitalize text-slate-800">{project.status.replace(/_/g, ' ')}</dd>
                      </div>
                    ) : null}
                    {project.rating ? (
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Project rating</dt>
                        <dd className="font-medium text-slate-800">
                          {project.rating.avg.toFixed(1)} ({project.rating.count})
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <Button asChild variant="outline" size="sm" block className="mt-3">
                    <Link href={`/project/${project.id}`}>View full project</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : null}
            <BathroomFact hasBathrooms={flat.amenities?.some((a) => /bath|washroom/i.test(a.name))} />
          </div>
        </aside>
      </div>
    </div>
  );
}

/* -------------------------------- helpers --------------------------------- */

const Fact = ({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof BedDouble;
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="rounded-lg border border-slate-200 bg-white p-3">
    <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </dt>
    <dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd>
    {hint ? <p className="mt-0.5 text-[11px] capitalize text-slate-500">{hint}</p> : null}
  </div>
);

const BathroomFact = ({ hasBathrooms }: { hasBathrooms?: boolean }) =>
  hasBathrooms ? null : (
    <Card>
      <CardContent className="flex items-start gap-2 p-4 text-[13px] text-slate-600">
        <Bath className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
        <p>Bathroom configuration is listed in the project brochure — ask the builder for the detailed plan.</p>
      </CardContent>
    </Card>
  );


