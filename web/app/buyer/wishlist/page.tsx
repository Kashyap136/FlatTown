import { DashboardShell, RequireRole } from '@/components/layout/DashboardShell';
import { WishlistGrid } from '@/components/dashboards/WishlistGrid';

/**
 * Authenticated, per-user surface: never prerendered or cached.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Saved flats | FLAT TOWN', robots: { index: false, follow: false } };

export default function BuyerWishlistPage() {
  return (
    <RequireRole allow={['buyer']}>
      <DashboardShell
        title="Saved flats"
        subtitle="Flats you have hearted. Wishlists are private to your account."
        nav={[
          { href: '/buyer', label: 'Overview', exact: true },
          { href: '/buyer/bookings', label: 'Bookings & escrow' },
          { href: '/buyer/visits', label: 'Site visits' },
          { href: '/buyer/wishlist', label: 'Saved flats' },
          { href: '/buyer/requirements', label: 'Requirements' },
          { href: '/buyer/loan', label: 'Loan assistance' },
          { href: '/buyer/profile', label: 'Profile' },
        ]}
      >
        {/*
          * No `icon` prop: a Lucide icon is a function, and this page is a
          * server component. Passing it into the client `WishlistGrid` made
          * Next throw "Functions cannot be passed directly to Client
          * Components" on every request, so /buyer/wishlist hung instead of
          * rendering. The `wishlist` preset picks the Heart icon instead.
          */}
        <WishlistGrid />
      </DashboardShell>
    </RequireRole>
  );
}