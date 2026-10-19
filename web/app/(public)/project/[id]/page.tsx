import { ArrowLeft, Building2, CalendarClock, Download, FileText, MapPin, Percent } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PossessionBadge, RERABadge, RatingStars } from '@/components/common/Badges';
import { AmenitiesPanel } from '@/components/flat/AmenitiesPanel';
import { BuilderCard } from '@/components/flat/BuilderCard';
import { ImageCarousel } from '@/components/flat/ImageCarousel';
import { MapView } from '@/components/flat/MapView';
import { FlatCard } from '@/components/marketplace/FlatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { projectsApi } from '@/lib/api';
import { formatCompactINR, formatDate, formatINR, formatPossession } from '@/lib/price';
import { absoluteUrl } from '@/lib/utils';
import type { ProjectDetail } from '@/lib/types';

/** Availability, pricing and tier distribution are live, so never cache this page. */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  let project: ProjectDetail | undefined;
  try {
    project = (await projectsApi.get(params.id)).data;
  } catch {
    return { title: 'Project not found', robots: { index: false, follow: false } };
  }

  const location = `${project.locality}, ${project.city}`;
  const title = `${project.projectName} — ${project.availableFlats} new flats in ${location}`;
  const description = `${project.projectName} by ${project.builder?.companyName ?? project.builder?.name ?? 'a verified builder'} in ${location}. ${project.rating.avg.toFixed(1)} builder rating, possession ${formatPossession(project.possessionDate)}, flats from ${formatCompactINR(project.minPrice)}.${project.isRERAVerified ? ' RERA verified.' : ''}`;
  const url = absoluteUrl(`/project/${project.id}`);
  const image = project.images?.[0]?.url;

  return {
    title,
    description,
    alternates: { canonical: `/project/${project.id}` },
    openGraph: {
      type: 'website',
      title,
      description,
      url,
      siteName: 'FLAT TOWN',
      locale: 'en_IN',
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: project.projectName }] } : {}),
    },
    keywords: [`${project.projectName} ${location}`, `flats in ${project.locality}`, 'new builder flats'],
  };
}

/** See the flat page: `notFound()` is called from the render flow, not a catch. */
const loadProject = async (id: string): Promise<ProjectDetail | null> => {
  try {
    return (await projectsApi.get(id)).data;
  } catch {
    return null;
  }
};

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const project = await loadProject(params.id);
  if (!project) notFound();

  const location = `${project.locality}, ${project.city}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Residence',
    name: project.projectName,
    description: project.description ?? `${project.projectName} in ${location}`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: project.fullAddress,
      addressLocality: project.city,
      addressRegion: project.city,
      addressCountry: 'IN',
    },
    ...(project.geo
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: project.geo.lat,
            longitude: project.geo.lng,
          },
        }
      : {}),
    numberOfAccommodationUnits: project.flatCount,
  };

  const tierTotal = project.tierDistribution.reduce((sum, entry) => sum + entry.count, 0) || 1;

  return (
    <div className="ft-container pb-16 pt-4 sm:pt-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-emerald-700"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to marketplace
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:gap-8">
        <div className="min-w-0 space-y-6">
          <ImageCarousel images={project.images} alt={project.projectName} />

          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-black leading-tight tracking-tight text-slate-900 sm:text-3xl">
                  {project.projectName}
                </h1>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                  <MapPin className="size-4 shrink-0" aria-hidden="true" />
                  {project.fullAddress}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <RERABadge verified={project.isRERAVerified} reraNumber={project.reraNumber} />
                <PossessionBadge status={project.status} />
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Fact icon={Building2} label="Available flats" value={String(project.availableFlats)} hint={`${project.flatCount} in total`} />
              <Fact
                icon={Percent}
                label="Price range"
                value={`${formatCompactINR(project.minPrice)} – ${formatCompactINR(project.maxPrice)}`}
              />
              <Fact icon={CalendarClock} label="Possession" value={formatPossession(project.possessionDate)} />
              <Fact
                icon={FileText}
                label="RERA"
                value={project.reraNumber ?? 'Not published'}
                hint={project.isRERAVerified ? 'Admin verified' : 'Verification pending'}
              />
            </dl>
          </div>

          {project.description ? (
            <Card>
              <CardHeader>
                <CardTitle as="h2">About this project</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[13px] leading-relaxed text-slate-700">{project.description}</p>
              </CardContent>
            </Card>
          ) : null}

          {/* -------------------------- tier distribution --------------------- */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Tier distribution</CardTitle>
              <p className="text-[13px] text-slate-600">
                Every tier is calculated by the platform from the total price, not chosen by the builder.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {(['budget', 'mid', 'luxury'] as const).map((tier) => {
                const entry = project.tierDistribution.find((item) => item.tier === tier);
                const count = entry?.count ?? 0;
                const percent = Math.round((count / tierTotal) * 100);
                return (
                  <div key={tier}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium capitalize text-slate-800">{tier}</span>
                      <span className="tabular-nums text-slate-500">
                        {count} flats ({percent}%)
                      </span>
                    </div>
                    <Progress value={percent} aria-label={`${tier}: ${count} flats`} />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <AmenitiesPanel amenities={project.amenities ?? []} />

          <Card>
            <CardHeader>
              <CardTitle as="h2">Location</CardTitle>
            </CardHeader>
            <CardContent>
              <MapView
                marker={
                  project.geo
                    ? { lat: project.geo.lat, lng: project.geo.lng, label: project.projectName, address: project.fullAddress }
                    : null
                }
              />
            </CardContent>
          </Card>

          {/* -------------------------- project flats ------------------------ */}
          <section aria-labelledby="ft-project-flats" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="ft-project-flats" className="text-base font-bold text-slate-900">
                Available flats in this project
              </h2>
              <Button asChild size="sm" variant="outline">
                <Link href={`/?projectId=${project.id}`}>Filter the marketplace</Link>
              </Button>
            </div>

            {project.flats.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
                Every flat in this project is currently sold out. Check back soon — builders release new inventory
                regularly.
              </p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {project.flats.map((flat) => (
                  <li key={flat.id} className="flex">
                    <FlatCard flat={flat} className="w-full" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ----------------------------- sidebar ---------------------------- */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Starting at</p>
                <p className="text-3xl font-black tabular-nums text-slate-900">
                  {formatINR(project.minPrice)}
                </p>
                {project.brochureUrl ? (
                  <Button asChild variant="outline" block size="sm">
                    <a href={project.brochureUrl} target="_blank" rel="noopener noreferrer">
                      <Download />
                      Download brochure
                    </a>
                  </Button>
                ) : null}
                <Button asChild block>
                  <Link href={`/?locality=${encodeURIComponent(project.locality)}`}>
                    See all flats in {project.locality}
                  </Link>
                </Button>
                <p className="text-[11px] text-slate-500">
                  Listed by {project.builder?.companyName ?? project.builderName ?? 'a Flat Town builder'} ·{' '}
                  {formatDate(project.createdAt)}
                </p>
              </CardContent>
            </Card>

            {project.builder ? (
              <BuilderCard builder={project.builder} projectCount={project.tierStats ? 1 : undefined} />
            ) : null}

            {project.rating ? (
              <Card>
                <CardContent className="p-4">
                  <h2 className="text-sm font-bold text-slate-900">Project rating</h2>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-3xl font-black tabular-nums text-slate-900">
                      {project.rating.avg.toFixed(1)}
                    </span>
                    <div>
                      <RatingStars value={project.rating.avg} count={project.rating.count} showValue={false} />
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {project.rating.count} verified {project.rating.count === 1 ? 'review' : 'reviews'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

const Fact = ({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="rounded-lg border border-slate-200 bg-white p-3">
    <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-600">
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </dt>
    <dd className="mt-1 text-sm font-semibold text-slate-900">
      {value}
      {/* The hint belongs inside the <dd>: a <dl> may only contain dt/dd (or a
          wrapper holding only those), so a sibling <p> was invalid markup. */}
      {hint ? <span className="mt-0.5 block text-[11px] font-normal text-slate-600">{hint}</span> : null}
    </dd>
  </div>
);

