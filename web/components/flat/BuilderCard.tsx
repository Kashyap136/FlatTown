'use client';

import { BadgeCheck, Building2, MapPin, Phone } from 'lucide-react';
import Link from 'next/link';

import { RERABadge, RatingStars, VerificationBadge } from '@/components/common/Badges';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCompactINR } from '@/lib/price';
import type { BuilderSummary, ProjectSummary } from '@/lib/types';
import { initials } from '@/lib/utils';

/** Builder identity card shown on the flat and project detail pages. */
export const BuilderCard = ({
  builder,
  projectCount,
  className,
}: {
  builder: BuilderSummary | null;
  projectCount?: number;
  className?: string;
}) => {
  if (!builder) {
    return (
      <Card className={className}>
        <CardContent className="p-4 text-sm text-slate-600">Builder details are not available.</CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-700 text-sm font-bold text-white">
            {initials(builder.companyName ?? builder.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="ft-line-2 text-sm font-semibold text-slate-900">{builder.companyName ?? builder.name}</p>
            <p className="truncate text-xs text-slate-500">{builder.name}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <RERABadge verified={builder.isRERAVerified} reraNumber={builder.reraNumber} size="sm" />
              {builder.isVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  <BadgeCheck className="size-3" aria-hidden="true" />
                  Verified
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Builder rating</p>
            <RatingStars value={builder.rating?.avg ?? 0} count={builder.rating?.count ?? 0} size="sm" />
          </div>
          {typeof projectCount === 'number' ? (
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Projects</p>
              <p className="text-sm font-semibold tabular-nums text-slate-900">{projectCount}</p>
            </div>
          ) : null}
        </div>

        <p className="text-[11px] leading-relaxed text-slate-500">
          RERA verification is granted only by the Flat Town admin team after checking the registration against the
          state RERA registry.
        </p>
      </CardContent>
    </Card>
  );
};

/** Condensed builder row used in lists. */
export const BuilderRow = ({ builder, city }: { builder: BuilderSummary; city?: string }) => (
  <div className="flex items-center gap-3">
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">
      {initials(builder.companyName ?? builder.name)}
    </span>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold text-slate-900">{builder.companyName ?? builder.name}</p>
      {city ? (
        <p className="flex items-center gap-1 truncate text-xs text-slate-500">
          <MapPin className="size-3" aria-hidden="true" />
          {city}
        </p>
      ) : null}
    </div>
    <div className="shrink-0 text-right">
      <RatingStars value={builder.rating?.avg ?? 0} count={builder.rating?.count ?? 0} size="sm" />
    </div>
  </div>
);

/** Project summary card used on the project list and in sidebars. */
export const ProjectCard = ({ project }: { project: ProjectSummary }) => (
  <Link
    href={`/project/${project.id}`}
    className="group flex flex-col rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md"
  >
    <div className="border-b border-slate-100 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="ft-line-2 text-sm font-semibold text-slate-900 group-hover:text-emerald-700">{project.projectName}</h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-600">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {project.locality}, {project.city}
            </span>
          </p>
        </div>
        <RERABadge verified={project.isRERAVerified} reraNumber={project.reraNumber} size="sm" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium capitalize text-slate-700">
          {project.status.replace(/_/g, ' ')}
        </span>
        <span className="inline-flex items-center gap-1 text-slate-600">
          <Building2 className="size-3" aria-hidden="true" />
          {project.availableFlats} available
        </span>
      </div>
    </div>

    <div className="flex items-center justify-between gap-2 p-4 pt-3">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Starting at</p>
        <p className="text-base font-bold tabular-nums text-slate-900">{formatCompactINR(project.minPrice)}</p>
      </div>
      {project.rating ? <RatingStars value={project.rating.avg} count={project.rating.count} size="sm" /> : null}
    </div>
  </Link>
);

/** Contact strip with a tel: link — used inside inquiry success states. */
export const BuilderContact = ({ phone }: { phone?: string }) => (
  <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm">
    <Phone className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
    {phone ? (
      <a href={`tel:${phone}`} className="font-medium text-slate-800 hover:text-emerald-700">
        {phone}
      </a>
    ) : (
      <span className="text-slate-600">Your inquiry has been sent to the builder.</span>
    )}
  </div>
);

export { VerificationBadge };
export const BuilderDashboardLink = BuilderCard;

export const InquiryButton = ({ children }: { children: React.ReactNode }) => (
  <Button variant="primary" block>
    {children}
  </Button>
);