'use client';

import { Loader2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/lib/types';

/**
 * Client-side route guard for the role dashboards.
 *
 * This is a UX guard only — every dashboard API call is independently
 * authorised server-side by the role middleware (RULE 14), so a user who
 * bypasses this sees an empty screen at worst.
 */
export const RequireRole = ({
  allow,
  children,
}: {
  allow: UserRole[];
  children: ReactNode;
}) => {
  const { user, initialising } = useAuthStore();
  const pathname = usePathname();

  useEffect(() => {
    // Nothing to do — `initialising` drives the states below.
  }, [pathname]);

  if (initialising) {
    return (
      <div className="ft-container flex min-h-[60vh] items-center justify-center py-16" role="status" aria-label="Loading your dashboard">
        <span className="inline-flex items-center gap-3 text-slate-600">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          Loading your dashboard…
        </span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="ft-container py-16">
        <Alert tone="warning" title="Sign in to continue" action={<Button asChild size="sm"><Link href={`/auth/login?next=${pathname}`}>Sign in</Link></Button>}>
          This dashboard is only available to signed-in accounts.
        </Alert>
      </div>
    );
  }

  if (!allow.includes(user.role)) {
    return (
      <div className="ft-container py-16">
        <Alert tone="error" title="You do not have access to this area">
          <p className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Your account is signed in as <strong>{user.role}</strong>. This area is limited to{' '}
              <strong>{allow.join(' / ')}</strong> accounts.
            </span>
          </p>
        </Alert>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/">Back to the marketplace</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
};

export interface DashboardNavItem {
  href: string;
  label: string;
  exact?: boolean;
}

/**
 * Responsive dashboard chrome: a horizontally scrollable tab rail on mobile
 * and a sticky sidebar from `lg` up.
 */
export const DashboardShell = ({
  title,
  subtitle,
  nav,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  nav: DashboardNavItem[];
  actions?: ReactNode;
  children: ReactNode;
}) => {
  const pathname = usePathname();
  const isActive = (item: DashboardNavItem): boolean =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <div className="ft-container pb-16 pt-6">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 max-w-2xl text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </header>

      {/* Mobile: scrollable tab rail */}
      <nav aria-label="Dashboard sections" className="ft-scroll-x mb-5 lg:hidden">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item) ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors',
              isActive(item)
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex gap-6">
        {/* Desktop: sidebar */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav aria-label="Dashboard sections" className="sticky top-24 space-y-0.5">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item) ? 'page' : undefined}
                className={cn(
                  'block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive(item)
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
};