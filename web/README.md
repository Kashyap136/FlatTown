# FLAT TOWN — Web

Next.js 14 (App Router) frontend for the FLAT TOWN new-builder-flat marketplace.

Full documentation lives in the [repository README](../README.md).

---

## Setup

Requires **Node.js ≥ 18**.

```bash
npm install
cp .env.example .env.local     # then edit
npm run dev                    # http://localhost:3000
```

### Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | yes | Base URL of the API, e.g. `http://localhost:5000`. The client appends `/api/v1`. |
| `NEXT_PUBLIC_SITE_URL` | production | Absolute origin, used for canonical URLs and Open Graph tags. |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | no | Public Mapbox token. Without it the map degrades to a labelled static panel with Google Maps / OpenStreetMap deep links. |

**No secret ever lives here.** Only `NEXT_PUBLIC_*` variables reach the browser,
and all of them are public by definition. Every secret belongs to the API.

### Running without a database

The API ships a development harness that boots against a throwaway in-memory
MongoDB and seeds the demo dataset:

```bash
cd ../server
node --import tsx scripts/dev-inmemory.cjs     # API on :5000 with seeded data
```

Then point `NEXT_PUBLIC_API_URL=http://localhost:5000` here. The data is
discarded when that process stops.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint via `next lint` |
| `npm run typecheck` | `tsc --noEmit` |

---

## Structure

```
app/
  layout.tsx            shell: providers, header, footer, skip link
  providers.tsx         React Query + auth bootstrap + toaster
  (public)/             marketplace, flat/[id], project/[id], compare
  auth/                 login, register
  booking/[flatId]/     the four-step booking wizard
  buyer/ builder/ agent/ admin/
  loading.tsx  error.tsx  not-found.tsx

components/
  ui/          shadcn-style primitives on Radix (button, card, badge, dialog,
               drawer, sheet, input, select, checkbox, switch, slider, tabs,
               accordion, radio-group, progress, separator, skeleton, alert,
               toast, label)
  common/      RERABadge, TierBadge, shared trust badges, loading/empty/error
  layout/      SiteHeader, SiteFooter, DashboardShell, NotificationBell
  marketplace/ FlatCard, FilterDrawer, MarketplaceBrowser, CompareTray,
               CompareTable, Pagination
  flat/        ImageCarousel, MapView, PossessionTimeline, PriceBreakdownCard,
               BuilderCard, AmenitiesPanel, SiteVisitModal, TokenPaymentModal,
               InquiryForm, DocumentUpload, ReviewsSection, SimilarFlats
  builder/     ProjectForm, FlatForm
  dashboards/  buyer, builder, agent and admin panels
  booking/     BookingWizard

hooks/         useFlats (discovery + all data hooks), useVisit
lib/           api (axios + refresh queue), auth, price, filters, types, utils
store/         useAuthStore, useFilterStore, useBookingStore, useCompareStore
```

---

## Conventions

* **Server components fetch, client components interact.** A page that needs data
  fetches it on the server; anything with state or an event handler is
  `'use client'`.
* **Server state** goes through TanStack React Query with keys derived from the
  filter set. **Client state** goes through Zustand. **Shareable state** lives in
  the URL.
* **Never compute a financial value to submit it.** `lib/price.ts` mirrors the
  server's maths purely so a builder sees a live preview while typing; the API
  recomputes `totalPrice`, `tier`, commission and every escrow figure, and a
  posted value is ignored. The booking and escrow screens always label the
  commission as a percentage of the **booking token only**.
* **Every authenticated route is `export const dynamic = 'force-dynamic'`.** None
  of them may be prerendered or cached.
* **Accessibility is not optional**: labelled controls, `aria-invalid` plus an
  inline `role="alert"` message on invalid fields, focus-visible rings, keyboard
  operable dialogs/drawers/carousel, `sr-only` captions on rating stars and
  image counters, and a skip link to `#main`.
* **Responsive from 320px up.** No fixed widths, no horizontal page overflow.
  Chip rails and dashboards scroll horizontally on small screens; tables scroll
  inside a wrapper rather than breaking the layout; dialogs become bottom sheets
  below `sm` and the filter drawer becomes a bottom sheet below `lg`.

## SEO

* `generateMetadata` on `/flat/[id]` composes BHK, locality, city, formatted
  price, tier, possession and RERA state into the title and description, with a
  canonical URL, Open Graph and Twitter card tags, and keywords.
* `/project/[id]` does the same for a project.
* Both pages emit JSON-LD (`Product` for a flat, `Residence` for a project).
* Dashboards, booking and auth routes are `robots: { index: false }`.
