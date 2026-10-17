'use client';

import { ArrowRight, Building2, CalendarDays, ClipboardList, Eye, IndianRupee, Inbox, Layers } from 'lucide-react';
import Link from 'next/link';

import { PossessionBadge, RERABadge, RatingStars, VerificationBadge } from '@/components/common/Badges';
import { EmptyState } from '@/components/common/States';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { ListSkeleton } from '@/components/ui/skeleton';
import { useBuilderDashboard, useBuilderInquiries } from '@/hooks/useFlats';
import { formatCompactINR, formatDateTime, formatINR } from '@/lib/price';
import { useAuthStore } from '@/store/useAuthStore';

export const BuilderDashboard = () => {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useBuilderDashboard();
  const { data: inquiries } = useBuilderInquiries({ limit: 8 });

  if (isLoading) return <ListSkeleton rows={4} />;

  if (!data) {
    return (
      <EmptyState
        preset="flatsToList"
        title="No dashboard data yet"
        body="Add your first project and a flat to start receiving inquiries and site-visit requests."
        actionLabel="Add a project"
        actionHref="/builder/projects/new"
      />
    );
  }

  const { stats, projects, escrow } = data;

  return (
    <div className="space-y-6">
      {/* ---------------------------- verification ------------------------ */}
      {user && user.role === 'builder' && (!user.isAdminVerified || !user.isRERAVerified) ? (
        <Alert
          tone="warning"
          title="Complete your verification to publish listings"
          action={
            <Button asChild size="sm">
              <Link href="/builder/settings">Open verification</Link>
            </Button>
          }
        >
          {!user.isAdminVerified
            ? 'Your KYC has not been approved yet — an admin reviews it from the verification queue.'
            : `Your RERA number ${user.reraNumber ?? ''} is awaiting admin verification. Until then you cannot add new inventory.`}
        </Alert>
      ) : null}

      {/* ------------------------------- stats ----------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Views" value={stats.views} icon={<Eye className="size-5" />} hint="Across all your flats" />
        <StatCard label="Inquiries" value={stats.inquiries} icon={<Inbox className="size-5" />} tone="brand" />
        <StatCard label="Site visits" value={stats.visits} icon={<CalendarDays className="size-5" />} />
        <StatCard label="Bookings" value={stats.bookings} icon={<ClipboardList className="size-5" />} />
      </div>

      {/* ------------------------------ escrow ----------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IndianRupee className="size-4 text-emerald-700" aria-hidden="true" />
            Escrow & payouts
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-emerald-50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-emerald-700">Held in escrow</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-900">{formatINR(escrow.held)}</p>
            <p className="mt-0.5 text-[11px] text-emerald-800">Released only by an admin</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Released to you</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatINR(escrow.released)}</p>
            <p className="mt-0.5 text-[11px] text-slate-600">90% of each released token</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Platform commission</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatINR(escrow.commission)}</p>
            <p className="mt-0.5 text-[11px] text-slate-600">10% of the booking token only</p>
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------- projects ---------------------------- */}
      <section aria-labelledby="bd-projects" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="bd-projects" className="text-base font-bold text-slate-900">
            My projects
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/builder/projects/new">
              Add project
              <ArrowRight />
            </Link>
          </Button>
        </div>

        {projects.length === 0 ? (
          <EmptyState preset="projects" compact actionLabel="Add your first project" actionHref="/builder/projects/new" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {projects.map((project) => {
              const total = (project.tierStats?.budget ?? 0) + (project.tierStats?.mid ?? 0) + (project.tierStats?.luxury ?? 0);
              return (
                <li key={project.id}>
                  <Card>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/project/${project.id}`}
                            className="ft-line-2 text-sm font-semibold text-slate-900 hover:text-emerald-700"
                          >
                            {project.projectName}
                          </Link>
                          <p className="truncate text-xs text-slate-500">
                            {project.locality}, {project.city}
                          </p>
                        </div>
                        <RERABadge verified={project.isRERAVerified} reraNumber={project.reraNumber} size="sm" />
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={project.isApproved ? 'success' : 'warning'} className="capitalize">
                          {project.isApproved ? 'Live' : 'Awaiting approval'}
                        </Badge>
                        <PossessionBadge status={project.status} />
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[11px] text-slate-500">Flats</p>
                          <p className="text-sm font-semibold tabular-nums text-slate-900">{project.totalFlats}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-500">Available</p>
                          <p className="text-sm font-semibold tabular-nums text-emerald-700">
                            {project.availableFlats}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-500">From</p>
                          <p className="text-sm font-semibold tabular-nums text-slate-900">
                            {formatCompactINR(project.minPrice)}
                          </p>
                        </div>
                      </div>

                      {total > 0 ? (
                        <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                          <span
                            className="bg-emerald-500"
                            style={{ width: `${((project.tierStats?.budget ?? 0) / total) * 100}%` }}
                            title={`Budget: ${project.tierStats?.budget ?? 0}`}
                          />
                          <span
                            className="bg-sky-500"
                            style={{ width: `${((project.tierStats?.mid ?? 0) / total) * 100}%` }}
                            title={`Mid: ${project.tierStats?.mid ?? 0}`}
                          />
                          <span
                            className="bg-amber-500"
                            style={{ width: `${((project.tierStats?.luxury ?? 0) / total) * 100}%` }}
                            title={`Luxury: ${project.tierStats?.luxury ?? 0}`}
                          />
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ----------------------------- inquiries --------------------------- */}
      <section aria-labelledby="bd-inquiries" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="bd-inquiries" className="text-base font-bold text-slate-900">
            Recent inquiries
          </h2>
        </div>
        {!inquiries || inquiries.length === 0 ? (
          <EmptyState compact title="No inquiries yet" body="Buyers who send an inquiry on one of your flats appear here." />
        ) : (
          <ul className="space-y-2">
            {inquiries.map((inquiry) => (
              <li key={inquiry._id ?? inquiry.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {(inquiry.buyer?.name ?? 'A buyer')?.trim() || 'Buyer'}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {inquiry.message || 'Sent an inquiry'} · {formatDateTime(inquiry.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {inquiry.loanAssistanceRequired ? <Badge variant="info">Loan needed</Badge> : null}
                      <Badge variant="neutral" className="capitalize">
                        {inquiry.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------ flats ------------------------------ */}
      <section aria-labelledby="bd-flats" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="bd-flats" className="text-base font-bold text-slate-900">
            Recently listed flats
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/builder/flats/new">
              List a flat
              <ArrowRight />
            </Link>
          </Button>
        </div>

        {!data.recentFlats || data.recentFlats.length === 0 ? (
          <EmptyState preset="flatsToList" compact actionLabel="List your first flat" actionHref="/builder/flats/new" />
        ) : (
          <ul className="space-y-2">
            {data.recentFlats.slice(0, 6).map((flat) => (
              <li key={flat.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <Layers className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <div className="min-w-0">
                        <Link href={`/flat/${flat.id}`} className="truncate text-sm font-medium text-slate-900 hover:text-emerald-700">
                          {flat.title}
                        </Link>
                        <p className="truncate text-xs text-slate-500">
                          {flat.bhk} BHK · {flat.sizeSqft} sq ft · {formatINR(flat.totalPrice)} ·{' '}
                          {formatINR(flat.pricePerSqft)}/sq ft
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={flat.isAvailable ? 'success' : 'neutral'}>
                        {flat.isAvailable ? 'Available' : 'Sold'}
                      </Badge>
                      <span className="text-xs capitalize text-slate-500">{flat.tier}</span>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------------------- builder card ------------------------- */}
      {user ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-emerald-700" aria-hidden="true" />
              Your public profile
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{user.companyName ?? user.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <RERABadge verified={user.isRERAVerified} reraNumber={user.reraNumber} />
                <VerificationBadge status={user.kycStatus} />
                <RatingStars value={user.rating.avg} count={user.rating.count} size="sm" />
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/builder/settings">Manage verification</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};