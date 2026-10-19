'use client';

import { Building2, Menu, ShieldCheck, Store, User as UserIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CompareTray } from '@/components/marketplace/CompareTray';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { Sheet, SheetContent, SheetClose, SheetTrigger } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { useCities } from '@/hooks/useFlats';
import { useCompareStore } from '@/store/useCompareStore';
import { homeRouteFor, navForRole, useAuthStore } from '@/store/useAuthStore';
import { cn, initials } from '@/lib/utils';

/* --------------------------------- brand ---------------------------------- */

/**
 * Brand mark.
 *
 * The wordmark must stay a child (not an `aria-label` on the link): splitting
 * "FLAT" + "TOWN" across two spans makes axe join the visible text as
 * "FLAT TOWN", and any hand-written label that spelled it differently tripped
 * label-content-name-mismatch. Letting the content name the link guarantees the
 * accessible name and the visible label can never drift apart.
 *
 * `compact` renders only the aria-hidden monogram, so it carries an sr-only
 * wordmark to stay named. sr-only text is not "visible", so it cannot itself
 * trip the same rule.
 */
export const Logo = ({ compact = false, className }: { compact?: boolean; className?: string }) => (
  <span className={cn('inline-flex items-center gap-2', className)}>
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-700 text-sm font-black text-white"
    >
      FT
    </span>
    {compact ? (
      <span className="sr-only">FLATTOWN home</span>
    ) : (
      <span className="text-base font-black tracking-tight text-slate-900 sm:text-lg">
        FLAT<span className="text-emerald-700">TOWN</span>
      </span>
    )}
  </span>
);

/* ------------------------------ city selector ----------------------------- */

const DEFAULT_CITIES = ['Pune', 'Mumbai'];

const CitySelector = ({ className }: { className?: string }) => {
  const { data: cities } = useCities();
  const options = cities?.length ? cities.map((c) => c.name) : DEFAULT_CITIES;
  const [city, setCity] = useState('Pune');

  // `localStorage` keeps the selected city across sessions; the marketplace
  // reads it from the same key on first paint.
  useEffect(() => {
    const stored = window.localStorage.getItem('flattown.city');
    if (stored && options.includes(stored)) setCity(stored);
  }, [options]);

  const onChange = (next: string) => {
    setCity(next);
    window.localStorage.setItem('flattown.city', next);
    const params = new URLSearchParams(window.location.search);
    params.set('city', next);
    params.delete('page');
    window.location.href = `/?${params.toString()}`;
  };

  return (
    <label className={cn('relative inline-flex items-center', className)}>
      <span className="sr-only">Select city</span>
      <Building2 className="pointer-events-none absolute left-2.5 size-4 text-slate-500" aria-hidden="true" />
      <select
        value={city}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 cursor-pointer appearance-none rounded-lg border border-slate-300 bg-white py-1 pl-8 pr-7 text-sm font-medium text-slate-800 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2.5 text-[10px] text-slate-500" aria-hidden="true">
        ▼
      </span>
    </label>
  );
};

/* ------------------------------ compare count ----------------------------- */

const CompareCount = () => {
  const ids = useCompareStore((s) => s.ids);

  // Re-hydrate the persisted tray once the app mounts.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('flattown.compare');
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed) && parsed.length) {
        useCompareStore.setState({ ids: (parsed as string[]).slice(0, 3) });
      }
    } catch {
      /* ignore a malformed tray */
    }
  }, []);

  if (ids.length === 0) return null;
  return (
    <Link
      href="/compare"
      className="hidden items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 md:inline-flex"
    >
      Compare
      <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[11px] text-white">{ids.length}</span>
    </Link>
  );
};

/* -------------------------------- user menu ------------------------------- */

const UserMenu = () => {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        {/* Full CTAs only from `sm` up — at 320px the header row cannot fit them
            alongside the city selector, the notification bell and the menu
            button. Both live in the mobile navigation drawer instead. */}
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link href="/auth/login">Sign in</Link>
        </Button>
        <Button asChild size="sm" className="hidden sm:inline-flex">
          <Link href="/auth/register">List your project</Link>
        </Button>
        <Button asChild size="icon-sm" className="sm:hidden" aria-label="Sign in to Flat Town">
          <Link href="/auth/login">
            <UserIcon aria-hidden="true" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        <span className="grid size-7 place-items-center rounded-full bg-emerald-700 text-[11px] font-bold text-white">
          {initials(user.name)}
        </span>
        <span className="hidden max-w-[7rem] truncate sm:inline">{user.name.split(' ')[0]}</span>
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
          >
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                {user.role === 'builder' ? <Building2 className="size-3" /> : user.role === 'agent' ? <Store className="size-3" /> : null}
                {user.role}
              </span>
            </div>
            <div className="p-1.5">
              <Link
                href={homeRouteFor(user.role)}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Dashboard
              </Link>
              <Link
                href={user.role === 'buyer' ? '/buyer/profile' : user.role === 'builder' ? '/builder/settings' : '/'}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Profile & verification
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  setOpen(false);
                  await signOut();
                  router.push('/');
                }}
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
              >
                Sign out
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

/* ------------------------------- role links ------------------------------- */

const RoleNav = () => {
  const user = useAuthStore((s) => s.user);
  const links = navForRole(user?.role);

  return (
    <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
};

/* --------------------------------- header --------------------------------- */

export const SiteHeader = () => {
  const user = useAuthStore((s) => s.user);
  const roleNav = <RoleNav />;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="ft-container">
        <div className="flex h-14 items-center gap-2 sm:h-16 sm:gap-3">
          {/* No aria-label: the Logo's own text names this link (see Logo). */}
          <Link href="/" className="shrink-0">
            {/* The wordmark is dropped below `sm` so a 320px row still fits the
                city selector, notification bell, sign-in and menu controls. */}
            <span className="hidden sm:inline">
              <Logo />
            </span>
            <span className="sm:hidden">
              <Logo compact />
            </span>
          </Link>

          <div className="ml-1 hidden sm:block">
            <CitySelector />
          </div>

          <div className="hidden min-w-0 flex-1 md:flex md:justify-center">{roleNav}</div>

          <div className="ml-auto flex items-center gap-2">
            <div className="sm:hidden">
              <CitySelector />
            </div>
            <CompareCount />
            {user ? <NotificationBell /> : null}
            <UserMenu />

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon-sm" className="lg:hidden" aria-label="Open navigation menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" title="Menu" description="Navigate FLAT TOWN">
                <nav aria-label="Mobile" className="space-y-1">
                  {navForRole(user?.role).map((link) => (
                    <SheetClose asChild key={link.href}>
                      <Link
                        href={link.href}
                        className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100"
                      >
                        {link.label}
                      </Link>
                    </SheetClose>
                  ))}
                </nav>
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <Link
                    href="/compare"
                    className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100"
                  >
                    Compare flats
                  </Link>
                  <Link
                    href="/auth/register"
                    className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                  >
                    Are you a builder? List your project
                  </Link>
                </div>
                {user?.role === 'admin' ? (
                  <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    Admin actions are audited. Every escrow release is recorded.
                  </p>
                ) : null}
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      <CompareTray />
    </header>
  );
};