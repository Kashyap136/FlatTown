'use client';

import { Building2, LogOut, User as UserIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Logo } from '@/components/layout/SiteHeader';

const COLUMNS = [
  {
    title: 'Buy',
    links: [
      { href: '/', label: 'Marketplace' },
      { href: '/compare', label: 'Compare flats' },
      { href: '/buyer/requirements', label: 'Post a requirement' },
      { href: '/buyer/wishlist', label: 'Saved flats' },
    ],
  },
  {
    title: 'For builders',
    links: [
      { href: '/builder', label: 'Builder dashboard' },
      { href: '/builder/projects/new', label: 'Add a project' },
      { href: '/builder/flats/new', label: 'List a flat' },
      { href: '/auth/register', label: 'Create a builder account' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { href: '/buyer/loan', label: 'Loan assistance' },
      { href: '/buyer/bookings', label: 'Track your booking' },
      { href: '/buyer/visits', label: 'Your site visits' },
      { href: '/agent', label: 'Agent dashboard' },
    ],
  },
];

export const SiteFooter = () => {
  const [year] = useState(() => new Date().getFullYear());

  return (
    <footer className="mt-auto border-t border-slate-200 bg-slate-50">
      <div className="ft-container py-10 sm:py-14">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Find your next home, direct from trusted builders. Verified flats, real prices — no resale, no
              inflated markups.
            </p>
            <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
              <Building2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              RERA verification and builder ratings are reviewed by the Flat Town admin team.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">{column.title}</h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-slate-600 transition-colors hover:text-emerald-700">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} FLAT TOWN. New-builder flats only — this is not a resale marketplace.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <UserIcon className="size-3" aria-hidden="true" />
              Buyers, builders, agents and admins
            </span>
            <span className="inline-flex items-center gap-1.5">
              <LogOut className="size-3" aria-hidden="true" />
              Booking tokens held in escrow until admin release
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};