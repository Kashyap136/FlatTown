'use client';

import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Heart,
  IndianRupee,
  Plus,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';

import { VerificationBadge } from '@/components/common/Badges';
import { EmptyState } from '@/components/common/States';
import { BookingStatusTimeline, EscrowBreakdown } from '@/components/dashboards/EscrowBreakdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { ListSkeleton } from '@/components/ui/skeleton';
import {
  useBookings,
  useLoanApplications,
  useRequirementMatches,
  useRequirements,
  useVisitList,
  useWishlist,
} from '@/hooks/useFlats';
import { formatDate, formatINR } from '@/lib/price';
import { useAuthStore } from '@/store/useAuthStore';
import type { Booking, SiteVisit } from '@/lib/types';

export const BuyerDashboard = () => {
  const user = useAuthStore((s) => s.user);
  const { data: bookings, isLoading: bookingsLoading } = useBookings({ scope: 'mine', limit: 20 });
  const { data: visits, isLoading: visitsLoading } = useVisitList({ scope: 'mine', limit: 20 });
  const { data: wishlist } = useWishlist();
  const { data: requirements } = useRequirements();
  const { data: matches } = useRequirementMatches();
  const { data: loans } = useLoanApplications();

  const list = (bookings ?? []) as Booking[];
  const visitList = (visits ?? []) as SiteVisit[];

  const stats = {
    activeBookings: list.filter((b) => !['completed', 'refunded'].includes(b.escrowStatus)).length,
    escrowHeld: list.reduce((sum, b) => sum + (b.escrow?.heldAmount ?? 0), 0),
    upcomingVisits: visitList.filter((v) => ['requested', 'confirmed'].includes(v.status)).length,
    matches: matches?.matches?.length ?? 0,
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------ profile ---------------------------- */}
      {user ? (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{user.name}</h2>
                <VerificationBadge status={user.kycStatus} />
              </div>
              <p className="mt-0.5 text-sm text-slate-600">
                {user.email} · {user.phone}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Buyer since {formatDate(user.createdAt)}
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href="/buyer/profile">Account & documents</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* ------------------------------- stats ----------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active bookings" value={stats.activeBookings} icon={<ClipboardList className="size-5" />} />
        <StatCard
          label="Held in escrow"
          value={formatINR(stats.escrowHeld)}
          hint="Released only by an admin"
          icon={<ShieldCheck className="size-5" />}
          tone="brand"
        />
        <StatCard label="Upcoming visits" value={stats.upcomingVisits} icon={<CalendarDays className="size-5" />} />
        <StatCard label="Saved flats" value={wishlist?.length ?? 0} icon={<Heart className="size-5" />} />
      </div>

      {/* ------------------------------ bookings --------------------------- */}
      <section aria-labelledby="bd-bookings" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="bd-bookings" className="text-base font-bold text-slate-900">
            Recent bookings
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/buyer/bookings">
              View all
              <ArrowRight />
            </Link>
          </Button>
        </div>

        {bookingsLoading ? (
          <ListSkeleton rows={2} />
        ) : list.length === 0 ? (
          <EmptyState
            preset="bookings"
            compact
            actionLabel="Browse new flats"
            actionHref="/"
          />
        ) : (
          <ul className="space-y-3">
            {list.slice(0, 3).map((booking) => (
              <li key={booking.id}>
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {booking.flat?.title ?? 'Flat'} · {booking.project?.projectName ?? 'Project'}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {booking.reference} · booked {formatDate(booking.createdAt)}
                        </p>
                      </div>
                      <Badge variant="brand" className="capitalize">
                        {booking.escrowStatus.replace(/_/g, ' ')}
                      </Badge>
                    </div>

                    <BookingStatusTimeline booking={booking} />
                    <EscrowBreakdown booking={booking} />

                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/buyer/bookings?booking=${booking.id}`}>Track booking</Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/flat/${booking.flat?.id ?? ''}`}>View flat</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------- visits ---------------------------- */}
      <section aria-labelledby="bd-visits" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="bd-visits" className="text-base font-bold text-slate-900">
            Site visits
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/buyer/visits">
              View all
              <ArrowRight />
            </Link>
          </Button>
        </div>

        {visitsLoading ? (
          <ListSkeleton rows={2} />
        ) : visitList.length === 0 ? (
          <EmptyState preset="visits" compact actionLabel="Find a flat to visit" actionHref="/" />
        ) : (
          <ul className="space-y-2">
            {visitList.slice(0, 4).map((visit) => (
              <li key={visit.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {visit.flat?.title ?? 'Flat'} · {visit.project?.projectName ?? 'Project'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDate(visit.slot?.date)} at {visit.slot?.time}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={visit.status === 'completed' ? 'success' : visit.status === 'cancelled' ? 'danger' : 'info'} className="capitalize">
                        {visit.status}
                      </Badge>
                      {visit.visitCharge > 0 ? (
                        <span className="text-xs font-semibold text-slate-700">{formatINR(visit.visitCharge)}</span>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-700">Free</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --------------------------- requirements -------------------------- */}
      <section aria-labelledby="bd-requirements" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="bd-requirements" className="text-base font-bold text-slate-900">
            Requirements & matches
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/buyer/requirements">
              Manage
              <ArrowRight />
            </Link>
          </Button>
        </div>

        {requirements && requirements.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {requirements.slice(0, 2).map((requirement) => (
              <Card key={requirement._id ?? requirement.id}>
                <CardContent className="space-y-2 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    {requirement.bhk?.join(', ')} BHK in {requirement.city ?? 'any city'}
                  </p>
                  <p className="text-xs text-slate-600">
                    Budget {formatINR(requirement.budgetMin)} – {formatINR(requirement.budgetMax)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {requirement.loanNeeded ? 'Loan assistance requested' : 'No loan needed'} ·{' '}
                    {requirement.isActive ? 'Active' : 'Paused'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            title="No requirements yet"
            body="Tell us your budget and BHK preference and we will match you against new inventory."
            actionLabel="Create a requirement"
            actionHref="/buyer/requirements"
          />
        )}

        {stats.matches > 0 ? (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
            <strong>{stats.matches}</strong> matching {stats.matches === 1 ? 'flat' : 'flats'} found for your
            requirements.
          </p>
        ) : null}
      </section>

      {/* -------------------------------- loans ---------------------------- */}
      {loans && loans.length > 0 ? (
        <section aria-labelledby="bd-loans" className="space-y-3">
          <h2 id="bd-loans" className="text-base font-bold text-slate-900">
            Loan assistance
          </h2>
          <ul className="space-y-2">
            {loans.slice(0, 3).map((loan) => (
              <li key={loan._id ?? loan.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3.5">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{formatINR(loan.loanAmount)} requested</p>
                      <p className="text-xs text-slate-500">{formatDate(loan.createdAt)}</p>
                    </div>
                    <Badge variant="info" className="capitalize">
                      {loan.status}
                    </Badge>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ------------------------------- savings --------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="size-4 text-emerald-700" aria-hidden="true" />
            How your money is protected
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 text-[13px] leading-relaxed text-slate-600">
          <p className="flex items-start gap-2">
            <IndianRupee className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            Site visit charges go to the platform and are <strong>100% refunded</strong> if you go on to book.
          </p>
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            Your booking token is held in escrow. 90% is released to the builder only after an admin verifies your
            documents; the platform retains a 10% commission on the token — never on the property price.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link href="/buyer/bookings">
              <Plus />
              See escrow ledger
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};