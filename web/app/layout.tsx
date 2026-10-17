import type { Metadata, Viewport } from 'next';

import './globals.css';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Providers } from './providers';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'FLAT TOWN — Verified New Flats, Direct From Builders',
    template: '%s | FLAT TOWN',
  },
  description:
    'FLAT TOWN is a new-builder-flat marketplace. Discover RERA-verified apartments and penthouses by price tier, location, BHK, possession and amenities — with transparent price per sq ft and a token escrow flow.',
  applicationName: 'FLAT TOWN',
  keywords: [
    'new flats',
    'builder flats',
    'RERA verified flats',
    'budget flats Pune',
    'mid segment flats',
    'luxury flats',
    'site visit',
    'booking token escrow',
  ],
  authors: [{ name: 'FLAT TOWN' }],
  creator: 'FLAT TOWN',
  openGraph: {
    type: 'website',
    siteName: 'FLAT TOWN',
    title: 'FLAT TOWN — Verified New Flats, Direct From Builders',
    description:
      'Find your next home direct from RERA-verified builders. Budget, Mid and Luxury tiers with transparent pricing.',
    url: SITE_URL,
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FLAT TOWN — Verified New Flats, Direct From Builders',
    description: 'Find your next home direct from RERA-verified builders.',
  },
  robots: { index: true, follow: true },
  icons: { icon: '/favicon.ico' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#047857',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <Providers>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
          >
            Skip to main content
          </a>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}