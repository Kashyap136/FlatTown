# FLAT TOWN

> **Find Your Next Home, Direct From Trusted Builders. Verified Flats. Real Prices.**

A production-oriented marketplace for **new builder flats only**. No resale, no
fake listings. Builders publish projects and units; buyers discover them by
**price tier, location, BHK, possession, amenities, RERA verification and builder
rating**; the platform earns from **site-visit charges** and a **10% commission on
the booking token, held in escrow**.

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Tech stack](#3-tech-stack)
4. [Folder structure](#4-folder-structure)
5. [Environment variables](#5-environment-variables)
6. [MongoDB setup](#6-mongodb-setup)
7. [Redis setup](#7-redis-setup)
8. [Cloudinary setup](#8-cloudinary-setup)
9. [Razorpay setup](#9-razorpay-setup)
10. [Mapbox setup](#10-mapbox-setup)
11. [Frontend setup](#11-frontend-setup)
12. [Backend setup](#12-backend-setup)
13. [Seed commands](#13-seed-commands)
14. [Development commands](#14-development-commands)
15. [Production build](#15-production-build)
16. [Deploying to Vercel](#16-deploying-to-vercel)
17. [Deploying to Render](#17-deploying-to-render)
18. [MongoDB Atlas setup](#18-mongodb-atlas-setup)
19. [Security notes](#19-security-notes) — see also [`docs/SECURITY.md`](docs/SECURITY.md)
20. [Payment webhook setup](#20-payment-webhook-setup)
21. [API documentation](#21-api-documentation)
22. [Demo accounts](#22-demo-accounts)
23. [Response-envelope contract](#23-response-envelope-contract-why-hooks-must-unwrap-data)
24. [Known limitations](#24-known-limitations)
25. [Future enhancements](#25-future-enhancements)

---

## 1. Project overview

### The problem

Buying a new flat in India is opaque. Prices are quoted per square foot without
showing the arithmetic, "verified" badges are self-declared, resale listings are
mixed in with genuinely new inventory, and the booking token disappears into a
broker's pocket.

### The product

FLAT TOWN is a **first-sale marketplace with three trust mechanisms built in**:

| Mechanism | How it works |
| --- | --- |
| **Server-calculated price & tier** | `totalPrice = size × rate + floorRise + parking`. The tier (Budget < ₹50L, Mid ₹50L–₹1.5Cr, Luxury ₹1.5Cr+) is derived from that total on the server. Builders and browsers cannot set either. |
| **Admin-only RERA verification** | Only `PUT /admin/verify-rera/:builderId` can set `isRERAVerified`. Verified listings get **priority ranking** in discovery. |
| **Token escrow** | The booking token is held by the platform. An **admin** releases 90% to the builder and retains a 10% commission **on the token only**. An agent's share comes out of that commission. |

### The funnel

```
INQUIRY → SITE VISIT → TOKEN BOOKING → DOCUMENTATION → ESCROW RELEASE → POSSESSION
```

Each step is a real, persisted state — not a mock. A new builder starts at a
**3.5 / 5** rating so it is discoverable without being over-ranked.

### Roles

**Builder** · **Buyer** · **Agent** · **Admin** — see
[`docs/ROLES.md`](docs/ROLES.md) for the full permission matrix. An admin can
never self-register.

---

## 2. Architecture

```
Browser ──▶ web/ (Next.js 14, Vercel)  ──REST /api/v1──▶  server/ (Express, Render)
                                                              │
                            ┌─────────────────┬───────────────┼──────────────┐
                       MongoDB Atlas     Redis cache     Razorpay     Cloudinary
```

* Monorepo: `web/` (frontend) + `server/` (API) + `docs/`.
* One envelope for every response:
  `{ success, message, data, meta }` / `{ success: false, message, errors[] }`.
* JWT access (15 min) + refresh (7 days) with **rotation on every refresh**.
* Server state via TanStack React Query; client state via Zustand; every
  marketplace filter mirrored into the URL.
* **All money, tier and escrow figures are computed by the API.** The browser only
  renders them.

Full detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 3. Tech stack

### Frontend

| Concern | Choice |
| --- | --- |
| Framework | **Next.js 14** (App Router, RSC, dynamic metadata) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS + shadcn/ui-style primitives on Radix |
| Server state | TanStack React Query v5 |
| Client state | Zustand |
| HTTP | Axios (with transparent access-token refresh) |
| Payments | Razorpay Checkout (real or clearly-labelled simulated) |
| Forms | react-hook-form + Zod |
| Icons | lucide-react |
| Hosted on | Vercel |

### Backend

| Concern | Choice |
| --- | --- |
| Runtime | Node.js ≥ 18 |
| Framework | **Express 4** |
| Language | TypeScript (strict, CommonJS) |
| Database | **MongoDB** via Mongoose 8 |
| Auth | JWT (access + refresh), bcryptjs |
| Validation | Zod at the boundary, Mongoose on the models |
| Uploads | Multer → Cloudinary (S3-compatible fallback, local disk in dev) |
| Cache | Redis (optional; degrades cleanly) |
| Payments | Razorpay orders + signature-verified webhooks |
| Email | Nodemailer (SMTP, logged when unconfigured) |
| SMS | Provider abstraction (`registerSmsProvider()`), logged by default |
| Lint | ESLint 9 flat config + typescript-eslint |
| Tests | `node:test` + supertest against an in-memory MongoDB |
| Hosted on | Render |

### Database

MongoDB Atlas (M0 free tier is enough for development).

### Images & documents

Cloudinary. Only URLs are stored in MongoDB — never binaries.

---

## 4. Folder structure

```
.
├── README.md
├── .env.example
├── docs/
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── PAYMENTS-ESCROW.md
│   ├── ROLES.md
│   ├── SECURITY.md
│   └── DATABASE.md
├── render.yaml            # Render blueprint — must be at the repo root
├── server/
│   ├── .env.example
│   ├── scripts/
│   ├── test/
│   └── src/
│       ├── index.ts app.ts
│       ├── config/          env, db, redis
│       ├── models/          User Project Flat SiteVisit Booking Amenity
│       │                    Review Requirement Wishlist Inquiry PlatformConfig
│       │                    AuditLog Notification Dispute Chat RefreshToken
│       │                    LoanApplication LoanPartner
│       ├── middlewares/     auth roleCheck upload reraVerifiedCheck cache validate
│       ├── services/        auth flatSearch cacheInvalidation platformConfig
│       │                    notification email sms project
│       ├── controllers/     auth projects flats builders visits bookings
│       │                    requirements reviews wishlist admin amenities
│       ├── routes/          one file per resource group
│       ├── utils/           tierCalculator razorpay storage response errorHandler
│       │                    logger pricingContext ApiError
│       └── seed/            seedAmenities seedCities seedUsers seedAll images
└── web/
    ├── vercel.json
    ├── .env.example
    ├── app/
    │   ├── layout.tsx providers.tsx globals.css
    │   ├── (public)/       marketplace, flat/[id], project/[id], compare
    │   ├── auth/            login, register
    │   ├── booking/[flatId]/
    │   ├── buyer/ builder/ agent/ admin/
    │   ├── loading.tsx error.tsx not-found.tsx
    ├── components/
    │   ├── ui/              button card badge dialog drawer sheet input label
    │   │                    select checkbox switch slider tabs accordion
    │   │                    radio-group progress separator skeleton alert toast
    │   ├── common/          RERABadge TierBadge Badges States
    │   ├── layout/          SiteHeader SiteFooter DashboardShell NotificationBell
    │   ├── marketplace/     FlatCard FilterDrawer CompareTray CompareTable
    │   │                    MarketplaceBrowser Pagination
    │   ├── flat/            ImageCarousel MapView PossessionTimeline
    │   │                    PriceBreakdownCard BuilderCard AmenitiesPanel
    │   │                    SiteVisitModal TokenPaymentModal InquiryForm
    │   │                    ReviewsSection SimilarFlats FlatActionPanel
    │   ├── builder/         ProjectForm FlatForm
    │   ├── dashboards/      Buyer Builder Agent Admin panels
    │   └── booking/         BookingWizard
    ├── hooks/               useFlats useVisit
    ├── lib/                 api auth price filters types utils
    └── store/               useAuthStore useFilterStore useBookingStore useCompareStore
```

---

## 5. Environment variables

Full templates: [`server/.env.example`](server/.env.example),
[`web/.env.example`](web/.env.example) and the combined
[`.env.example`](.env.example).

### Required — API (`server/.env`)

```env
MONGO_URI=mongodb+srv://…            # MongoDB Atlas
JWT_SECRET=<48+ random bytes>        # node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_REFRESH_SECRET=<different 48+ bytes>
RAZORPAY_KEY=rzp_live_…              # blank in development → simulated gateway
RAZORPAY_SECRET=…
REDIS_URL=redis://…                  # optional
CLOUDINARY_URL=cloudinary://key:secret@cloud
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:5000
ESCROW_ACCOUNT_ID=flattown-escrow
```

### Defaults (tier / commission) — RULE 1 & 4

```env
TIER_BUDGET=5000000      # ₹50,00,000
TIER_MID=15000000        # ₹1,50,00,000
COMMISSION=0.10          # 10% of the booking TOKEN
AGENT_PLATFORM_PERCENT=70
TOKEN_AMOUNTS=50000,100000,200000,500000
```

These are **boot-time defaults only**. An admin changes tiers, commission and
the agent split at runtime from `/admin/config`, and the API recomputes existing
flats accordingly.

### Optional

```env
RAZORPAY_WEBHOOK_SECRET=…   # required for real webhook verification
SMTP_HOST/PORT/USER/PASS    # emails are logged when unset
MAIL_FROM="Flat Town <…>"
SMS_PROVIDER=log            # provider abstraction; logs until you register one
CLOUDINARY_URL=             # blank in development → ./uploads (never MongoDB)
FLAT_DISCOVERY_CACHE_TTL=300
ALLOW_MOCK_PAYMENTS=true   # development only; refused when NODE_ENV=production
```

### Frontend (`web/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_MAPBOX_TOKEN=pk.…      # optional; a labelled fallback map is used
```

> Only `NEXT_PUBLIC_*` variables reach the browser. **No secret ever lives in the
> frontend bundle.** `.env`, `.env.local`, `uploads/` and `node_modules/` are
> git-ignored — verify with `npm run check:secrets` (section 19).

---

## 6. MongoDB setup

1. Sign in at <https://cloud.mongodb.com> → **Create a cluster** (M0 free).
2. **Database Access** → add a user (e.g. `flattown`) with a strong password.
3. **Network Access** → allow your IP, or `0.0.0.0/0` for development.
4. Copy the connection string and set:

```env
MONGO_URI=mongodb+srv://flattown:<password>@cluster0.xxxxx.mongodb.net/flattown?retryWrites=true&w=majority
```

5. `autoIndex` is enabled outside production, so the declared indexes are built
   on first boot.

The API degrades cleanly: `connectDatabase()` fails fast with an 8-second server
selection timeout and a clear message.

---

## 7. Redis setup

Redis is **optional**. Discovery caching simply no-ops when it is absent.

* Local: `docker run -p 6379:6379 redis:7-alpine`
* Hosted: Upstash, Redis Cloud, or Render Key Value.

```env
REDIS_URL=redis://localhost:6379
FLAT_DISCOVERY_CACHE_TTL=300   # 5 minutes, per RULE 11
```

Cache behaviour:

* `GET /flats` is cached for 5 minutes; responses carry `X-FlatTown-Cache: HIT|MISS`.
* Invalidation is event-driven — a flat, project, RERA/KYC or configuration change
  purges exactly the affected namespaces (`services/cacheInvalidation.ts`).
* **No financial operation reads or writes the cache.** A Redis outage costs
  latency, never correctness. `initRedis()` logs a warning and continues.

---

## 8. Cloudinary setup

1. Sign up at <https://cloudinary.com> → dashboard → **API Keys**.
2. Build the connection string:

```
cloudinary://<API_KEY>:<API_SECRET>@<CLOUD_NAME>
```

3. Set it on the API only — never on the frontend:

```env
CLOUDINARY_URL=cloudinary://123456789012345:abcdef…@flattown
CLOUDINARY_FOLDER=flattown
```

Used for property images, project images, floor plans, brochures, RERA and KYC
documents, and buyer booking documents. MongoDB stores URLs only. Without a
Cloudinary URL in development, uploads land in `server/uploads` so the funnel is
still walkable; that fallback is disabled when `NODE_ENV=production`.

---

## 9. Razorpay setup

1. Razorpay dashboard → **Account & Settings → API Keys** → Generate key.
2. Set on the API:

```env
RAZORPAY_KEY=rzp_test_…      # or rzp_live_… in production
RAZORPAY_SECRET=…
RAZORPAY_WEBHOOK_SECRET=…    # Settings → Webhooks → create secret
ESCROW_ACCOUNT_ID=flattown-escrow
```

3. Turn on live mode and update the keys.

### With keys → real money

Orders are created through the Razorpay API, the browser opens Razorpay Checkout,
and the payment is **verified server-side** by fetching it back from Razorpay and
checking the order, the captured amount and the captured status. Escrow only moves
on that verification or on a signature-verified webhook.

### Without keys → simulated, and labelled as such

If `RAZORPAY_KEY` is blank **and** `ALLOW_MOCK_PAYMENTS=true` **and**
`NODE_ENV≠production`, a deterministic simulated gateway is used. It is never
passed off as real:

* `GET /health` → `payments: { gateway: "mock", live: false, mockEnabled: true }`
* API responses → `"gateway": "mock"`, `"simulated": true`
* Database → `payment.gateway = "mock"`
* UI → an amber **"Simulated payment gateway — no real money moves"** panel

`assertMockAllowed()` throws when `NODE_ENV === 'production'` or
`ALLOW_MOCK_PAYMENTS === false`, so a production misconfiguration fails loudly
rather than faking money.

---

## 10. Mapbox setup

1. <https://account.mapbox.com/access-tokens> → create a **public** token.
2. Set it on the **frontend** only:

```env
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1Ijoi…
```

With a token, property and project pages render an interactive Mapbox view with a
marker and zoom controls. Without one, the map component shows a clearly labelled
static panel with the coordinates and working Google Maps / OpenStreetMap deep
links — the address is never reachable only through a map.

---

## 11. Frontend setup

Requires **Node.js ≥ 18**.

```bash
cd web
npm install
cp .env.example .env.local     # then edit
npm run dev                    # http://localhost:3000
```

Install command that matches this repository:

```bash
npm i zustand axios @tanstack/react-query razorpay
npm i -D @types/node
```

The shadcn/ui-style components are hand-written on Radix primitives in
`components/ui/` (no CLI codegen), so every class name is ours and every component
is typed and accessible.

Scripts: `dev`, `build`, `start`, `lint`, `typecheck`.

---

## 12. Backend setup

Requires **Node.js ≥ 18** and a reachable MongoDB (Atlas or local).

```bash
cd server
npm install
cp .env.example .env           # then edit — MONGO_URI and the JWT secrets at minimum
npm run seed:all               # optional but recommended
npx nodemon src/index.ts       # http://localhost:5000
```

Verify it is alive:

```bash
curl http://localhost:5000/health
```

```jsonc
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "connected",
    "cache": { "enabled": false, "connected": false },
    "payments": { "gateway": "mock", "live": false, "mockEnabled": true },
    "storage": "local-disk"
  }
}
```

Scripts: `dev`, `build`, `start`, `typecheck`, `lint`, `check`, `test`.

---

## 13. Seed commands

All seeds are **idempotent** — re-running them updates rather than duplicates.

| Command | What it does |
| --- | --- |
| `npm run seed:amenities` | 20 amenities (Lift, Parking, Swimming Pool, Gym, Security, CCTV, Power Backup, Club House, Children's Play Area, Garden, Jogging Track, Sports Area, Indoor Games, Visitor Parking, Fire Safety, Intercom, Water Supply, Rainwater Harvesting, Community Hall, EV Charging) across 5 categories |
| `npm run seed:cities` | Pune (Pimpri, Wakad, Baner, Koregaon Park, Viman Nagar, Hinjewadi) + Mumbai (Powai, Andheri, Thane, Navi Mumbai) into `PlatformConfig` |
| `npm run seed:users` | Demo admin, builders, buyer and agent |
| `npm run seed:all` | **Everything**: amenities, cities, platform config, 5 projects, 15 flats, reviews, wishlists, a buyer requirement, and the demo users. Prints the credentials at the end |

### What the dataset guarantees

Seed data respects the business rules — no contradictory tier:

| Flat | Size | Rate | Surcharges | Total | Tier |
| --- | --- | --- | --- | --- | --- |
| 2BHK Sky View | 1 000 sq ft | ₹7 000 | — | ₹70,00 000 | **mid** |
| 2BHK Value Home | 455 sq ft | ₹4 900 | ₹90 000 + ₹1 50 000 | ₹24,69 500 | **budget** |
| 4BHK Signature | 2 650 sq ft | ₹13 400 | ₹6 00 000 + ₹6 00 000 | ₹3,67,10 000 | **luxury** |

Coverage: budget / mid / luxury, 1–4 BHK, ready-to-move / under-construction /
new-launch, RERA-verified and unverified builders, ratings from 3.5 upward,
multiple amenities, varied price per sq ft, and a few sold-out units so the
`includeUnavailable` filter has something to show.

---

## 14. Development commands

### Terminal 1 — API

```bash
cd server
npx nodemon src/index.ts       # port 5000, restarts on change
```

### Terminal 2 — web

```bash
cd web
npm run dev                    # port 3000
```

### Quality gates

```bash
cd server
npm run typecheck              # tsc --noEmit
npm run lint                   # eslint .
npm test                       # 161 tests against an in-memory MongoDB (no Redis)
npm run test:redis             # 5 cache tests against a REAL Redis server
npm run check                  # typecheck + lint

cd ../web
npm run typecheck
npm run lint
npm run build
```

The test suite runs with `--test-concurrency=1` on purpose: each test file boots
its own `mongodb-memory-server`, and running them in parallel made the suite
intermittently lose ~80 tests to process contention.

#### Testing Redis for real

The default suite deliberately sets `REDIS_URL=''` so it stays hermetic. That
alone is not enough: with the cache always disabled, the entire cache layer
could only ever be asserted as "off", which is exactly how a **silent
cache-invalidation bug** survived — `cacheDelByPrefix` scanned for
`flats:discovery*` while every key was written as
`flattown:flats:discovery:…`, so *no* prefix invalidation ever matched and a flat
being marked sold stayed listed for the full 5-minute TTL.

`npm run test:redis` runs `test/redis-cache.integration.ts` against a real
server and asserts the things that actually matter:

```bash
# any Redis (Docker, a local install, WSL, Memurai...)
redis-server --port 6399
$env:REDIS_URL = "redis://127.0.0.1:6399"     # PowerShell
npm run test:redis
```

It verifies the `X-FlatTown-Cache: MISS → HIT` transition, that the stored TTL
is ≤ 300 seconds, that a flat mutation purges the entry so a sold flat
disappears, that a cached response is identical to the uncached one, and that
per-viewer scoping keeps one buyer's `isWishlisted` out of another's response.

Every cache command is wrapped in a 750 ms timeout. node-redis v4+ does not
reject commands while reconnecting — it *queues* them — so a mid-flight Redis
outage would otherwise hang every discovery request instead of degrading to a
cache miss.

### Full verification

Beyond the unit tests, several end-to-end suites exercise the real code paths.

```bash
cd server
npm run verify                 # typecheck + lint + 161 tests + index/secret audits
npm run test:smoke             # real seed data + full booking funnel
npm run test:e2e http://localhost:5000   # 70 checks against a RUNNING server
npm run audit:ids      http://localhost:5000   # no endpoint may leak a raw _id
npm run audit:contract http://localhost:5000   # every route the web app calls
```

`test:smoke` boots an in-memory MongoDB, runs `seedAll()` exactly as
`npm run seed:all` does, then drives the whole funnel over HTTP through the
real Express app — health, discovery filters, demo-account sign-in, role
refusals, inquiry, site visit, token booking, payment verification, document
upload, escrow release, refund, reviews, admin config and seed idempotency. It
also re-derives `totalPrice` and `tier` for every seeded flat to prove the data
itself obeys the pricing rules.

`test:e2e`, `audit:ids` and `audit:contract` need a server that is already
running. The quickest way to get one is the in-memory dev harness, which also
seeds it:

```bash
cd server
node --import tsx scripts/dev-inmemory.cjs --port 5099   # terminal 1
npm run test:e2e http://localhost:5099                    # terminal 2
npm run audit:ids http://localhost:5099
npm run audit:contract http://localhost:5099
```

* `test:e2e` walks the full funnel over real HTTP including **multipart
  uploads**: booking → token payment → builder accept → Aadhaar/PAN upload →
  document verification → admin escrow release → review → refund. It asserts
  the commission is 10% of the *token* (never of the flat price), the
  90/10 split, the 70/30 agent split, and that escrow cannot be released out of
  order, twice, or without documents.
* `audit:ids` walks ~45 endpoints and fails if any response still exposes a raw
  Mongo `_id`.
* `audit:contract` probes every path the web app actually calls (taken from
  `web/lib/api.ts`) so a route rename fails here instead of silently in the
  browser.

The second suite renders the running **production** Next.js server and asserts
what it actually returns:

```bash
cd web && npm run build && npm run start    # terminal 1
cd ../server && node --import tsx scripts/verify-all.cjs   # terminal 2
```

`verify-all.cjs` boots the API against in-memory Mongo, seeds it, and runs 82
checks over the rendered HTML: marketplace, flat and project detail, compare,
the booking funnel, auth, role guards while signed out, the not-found page, and
the SEO metadata (title, description, canonical, Open Graph, Twitter, JSON-LD)
on every public route.

> The API must listen on the origin baked into the web build, because
> `NEXT_PUBLIC_*` values are inlined into both the client and server bundles at
> build time. Pass a different port as the second argument if you built with a
> different `NEXT_PUBLIC_API_URL`.

### Audits

```bash
cd server
npm run audit:secrets          # fails if a live credential looks committed
npm run audit:encoding         # fails on UTF-8/CP1252 mojibake
npm run audit:indexes          # fails on duplicate schema.index() declarations
```

---

## 15. Production build

```bash
cd server && npm run build && npm start   # tsc → dist/, node dist/index.js
cd web    && npm run build && npm start   # next build → .next/, next start
```

Both must complete with zero TypeScript errors and zero ESLint errors.

> `NEXT_PUBLIC_*` values are inlined at **build** time, so set
> `NEXT_PUBLIC_API_URL` to the API's public origin *before* `npm run build`, not
> just before `npm start`.

### Responsiveness

Verified in a real browser against every breakpoint the specification names —
320, 360, 375, 390, 414, 480, 768, 820, 1024, 1280, 1366, 1440 and 1920 —
on the marketplace, flat detail, project detail, compare, both auth pages and
the signed-in role dashboards (admin, builder, buyer, agent).

At each width the check measures, per element, whether anything extends past
the viewport and whether an overflowing element is contained by a scroll or
clip container. Results: **no horizontal page overflow and no uncontained
overflowing element at any breakpoint.** The only elements wider than the
viewport are the BHK and tier chips, which sit inside `.ft-scroll-x` — the
"horizontally scrollable chips" behaviour the specification asks for.

### Accessibility

Audited with Lighthouse (which runs axe-core against the accessibility tree)
on the six public routes and the signed-in dashboards:

| Route | Accessibility | SEO | Best practices |
| --- | --- | --- | --- |
| `/` | 1.00 | 1.00 | 1.00 |
| `/flat/[id]` | 1.00 | 1.00 | 1.00 |
| `/project/[id]` | 1.00 | 1.00 | 1.00 |
| `/compare` | 1.00 | 1.00 | 1.00 |
| `/auth/login`, `/auth/register` | 1.00 | 1.00 | 1.00 |
| `/buyer`, `/builder`, `/admin`, `/admin/escrow` | 1.00 | — | — |

Zero failing audits. The fixes that got it there are worth recording, because
several were invisible to the TypeScript compiler:

* **Colour contrast.** Body text used `text-slate-400` (2.56:1 on white). Now
  `text-slate-500` (4.76:1), or `text-slate-600` where the text sits on a
  `slate-100` surface (`MapView`, `code` chips), where `slate-500` only reaches
  4.34:1. The RERA badge moved from `emerald-600` to `emerald-700` (3.76:1 →
  5.48:1) — still unmistakably green.
* **Carousel tap targets.** The pagination pills were 8×6px. The button is now
  a fixed 24×24 target with the pill drawn inside it (WCAG 2.2 target-size),
  so the look is unchanged and adjacent dots can't shrink each other's hit area.
* **Heading order.** `EmptyState` hardcoded an `<h3>`, which produced h1→h3
  skips wherever it rendered before the page's first h2. It now renders a
  paragraph unless a caller passes `headingLevel`. `CardTitle` gained an `as`
  prop for the same reason.
* **Definition lists.** The project `<dl>` had a `<p>` as a direct child of a
  `<dt>`/`<dd>` wrapper; the hint now lives inside the `<dd>`.
* **Named controls.** Gallery thumbnails had `alt=""` images and no
  accessible name, so each tab button is labelled.
* **Logo link.** The wordmark is `FLAT`+`TOWN` in adjacent spans, so axe reads
  the visible text as "FLAT TOWN". The link previously had a hand-written
  `aria-label` spelling it differently, which failed
  label-content-name-mismatch on every audit. It now has no `aria-label` and is
  named by its own content, so the two cannot drift apart again.

The results grid is a genuine responsive grid rather than a shrunken desktop
layout:

| Width | Columns | Card width |
| --- | --- | --- |
| 320 / 375 / 480 | 1 | 164 / 219 / 324 px |
| 768 / 820 / 1024 | 2 | 290 / 316 / 313 px |
| 1280 / 1440 / 1920 | 3 | 282 / 335 / 340 px |

Navigation switches mode at the `lg` breakpoint: the drawer-style "Filters"
button and sheet navigation appear at ≤ 1024 px, and the persistent filter
sidebar replaces them above it. The only sub-32 px hit target at 320 px is the
skip-to-content link, which is intentionally `sr-only` until focused.

### SEO and server rendering

Every indexable route is server-rendered:

| Route | Rendering | Notes |
| --- | --- | --- |
| `/` marketplace | Dynamic (SSR) | The first page of listings plus the amenity/tier/city masters are prefetched on the server (`lib/prefetch.ts`) and hydrated into React Query (`app/(public)/query-boundary.tsx`), so the HTML already contains real, crawlable cards. Filter URLs such as `/?tier=budget` render the filtered result set server-side too. |
| `/flat/[id]` | Dynamic (SSR) | `generateMetadata` with price, BHK and location, canonical URL, Open Graph, Twitter card, and `schema.org/Product` JSON-LD with `offers.price`. |
| `/project/[id]` | Dynamic (SSR) | `generateMetadata` plus `schema.org/Residence` JSON-LD with address and geo coordinates. |
| `/compare`, `/auth/*` | Dynamic (SSR) | |
| Dashboards | Dynamic, `noindex` | `robots: { index: false }` — they are behind authentication. |

The server render and the client render must agree on the query key, which is
why `MarketplaceBrowser` derives its first-render filter state from the URL
rather than from the Zustand store (the store is only populated in an effect,
which never runs on the server). The web
build emits `○` for the two public pages that can be prerendered and `ƒ` for
everything authenticated (which is explicitly `force-dynamic`).

---

## 16. Deploying to Vercel

1. Push the repository to GitHub.
2. Vercel → **Add New → Project** → import the repo.
3. **Root Directory**: `web`.
4. Vercel detects Next.js 14; leave the build command `npm run build`.
5. **Environment variables**:

```
NEXT_PUBLIC_API_URL   = https://flattown-api.onrender.com
NEXT_PUBLIC_SITE_URL  = https://flattown.vercel.app
NEXT_PUBLIC_MAPBOX_TOKEN = pk.…        (optional)
```

6. Deploy, then set `FRONTEND_URL=https://<your-vercel-domain>` on the API so CORS
   and email links point at the live origin.

`web/vercel.json` pins the framework, output directory, region and security
headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy`, HSTS) plus immutable caching for fonts.

---

## 17. Deploying to Render

The API is the **`server/`** package; the web app is deployed separately to
Vercel from `web/`.

### Recommended: the blueprint

Render → **New → Blueprint** → point at the repository. The root
[`render.yaml`](./render.yaml) is picked up automatically. Fill in every
`sync: false` value as a secret: `MONGO_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`REDIS_URL`, `RAZORPAY_KEY`, `RAZORPAY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
`CLOUDINARY_URL`, `SMTP_*`, `MAIL_FROM`, `FRONTEND_URL`, `BACKEND_URL`.

### Manual configuration

If you created the service by hand, the settings must be exactly:

| Setting | Value |
| --- | --- |
| **Root Directory** | `server` |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Environment | `NODE_ENV=production` |

**Root Directory must be `server`.** There is no `src/` directory in this
repository — the TypeScript sources live in `server/src/`, and `tsc` compiles
them to `server/dist/`. Setting the Root Directory to `src/server` (or leaving it
blank while copying a `cd server` build command) produces:

```
Error: Cannot find module '/opt/render/project/src/server/dist/index.js'
    code: 'MODULE_NOT_FOUND'
```

which means Node ran `node dist/index.js` from the wrong directory. Fix it in
**Settings → Build & Deploy → Root Directory** and redeploy.

**Why `npm ci --include=dev`?** The blueprint sets `NODE_ENV=production`, and npm
omits devDependencies when that is set. `tsc` is a devDependency, so a plain
`npm ci` would install no compiler and the build would fail with
`tsc: not found`. `--include=dev` forces the toolchain to install.

**PORT is deliberately not set** — Render injects it and the app reads it from
the environment. Pinning it to `5000` breaks Render's routing.

`ALLOW_MOCK_PAYMENTS` is pinned to `false`, and the server refuses to boot in
production if it is not — a misconfigured deploy fails loudly rather than
quietly simulating money.

### Verify the deploy locally first

```bash
cd server
npm run verify:boot
```

This compiles the project and boots the **compiled** `dist/` bundle the way
Render does — `NODE_ENV=production`, a platform-injected `PORT`, mock payments
disabled — then calls `/health` and `/api/v1/flats`. It catches the class of
failure seen here (wrong Root Directory, missing build output, a pinned port)
before it reaches Render.

The production rails can be seen by deliberately breaking the config:

```
Refusing to start in production with an unsafe configuration:
  - JWT_SECRET must be set to a unique value of at least 32 characters
  - JWT_REFRESH_SECRET must be set to a unique value of at least 32 characters
  - ALLOW_MOCK_PAYMENTS must be false in production
```

### Environment variable names

The names below must match `server/src/config/env.ts`. Older docs and templates
used different names, which were silently ignored:

| Variable | Scale | Legacy alias also accepted |
| --- | --- | --- |
| `TIER_BUDGET` / `TIER_MID` | rupees | — |
| `COMMISSION` | fraction (`0.10` = 10%) | `COMMISSION_PERCENT` (percent, `10`) |
| `AGENT_PLATFORM_PERCENT` | percent | `AGENT_SPLIT_PLATFORM` |
| `MAIL_FROM` | — | `EMAIL_FROM` |

---

### Known dependency audit findings (server)

`npm audit` reports 4 high-severity findings, none of which can be resolved
with a compatible, non-breaking update at the time of writing:

| Package | Path | Issue | Resolution |
| --- | --- | --- | --- |
| `nodemailer` 6.9.x | direct runtime dep | Multiple SMTP injection / parsing DoS advisories (GHSA-*) | Fix requires `nodemailer@10.1.7+`, a major breaking change to the email API. Email sending still works on 6.9.x; the affected features are not exercised in the core booking/escrow flow. Upgrade deferred to a dedicated change with integration-test coverage. |
| `braces` 3.0.3 | transitive via `nodemon` -> `chokidar` | Stack-exhaustion DoS on deeply nested patterns (GHSA-vfj7-8cjw-p6xm) | `braces` is already at its latest (3.0.3); the advisory has no patched release. It is a **dev-only** tool (file watcher for `npm run dev`) and is never installed in production's runtime graph when `NODE_ENV=production` — but it is still pulled in by `npm ci --include=dev` on Render for the build step. No safe fix; documented. |

Running `npm audit fix --force` is **not** recommended: it downgrades
`nodemon` to 1.14.x (which breaks the dev workflow) and jumps `nodemailer`
to 10.x without code updates. Re-run `npm audit` periodically; revisit if a
patched minor is published.

## 18. MongoDB Atlas setup

Already covered in section 6; this is the deployment-specific checklist.

1. **Cluster**: M0 is fine to start; move to a paid tier for production traffic.
2. **Database user**: least privilege — `readWrite` on `flattown` only.
3. **Network access**: restrict to the Render egress IPs. `0.0.0.0/0` is
   acceptable only while developing.
4. **Connection string**: store it as the `MONGO_URI` secret in Render.
5. **Backup**: enable continuous cloud backups on M10+ before going live.
6. **Confirm indexes** were created: boot once with `NODE_ENV != production` (or
   run `db.flateModels.syncIndexes()` once) so the compound indexes from
   `docs/DATABASE.md` exist.

---

## 19. Security notes

### Authentication & authorisation

* Passwords hashed with bcryptjs; the field is `select: false` and is never
  returned by any endpoint. `publicUser()` is an explicit allow-list.
* JWT access tokens (15 min) and refresh tokens (7 days) signed with **different**
  secrets and different issuers/audiences.
* **Refresh tokens rotate on every refresh.** The old token is revoked
  immediately, so a stolen-and-replayed refresh token is detected.
* Role guards (`isBuyer`, `isBuilder`, `isAgent`, `isAdmin`) plus ownership checks
  on every resource. The whole `/admin` router is `router.use(authenticate, isAdmin)`,
  so a missing guard on one route still fails closed.

### Trust mechanisms

* **RERA verification is admin-only** — a builder cannot self-verify
  (`reraVerifiedCheck` + the single admin write route).
* **KYC approval is admin-only**, and escrow release requires an approved builder
  KYC.
* **Project approval is admin-only**; unapproved projects are invisible publicly.
* **Rating integrity** — only buyers with a **completed booking** can review, one
  review per buyer per flat (unique index), and only published reviews count
  towards a builder's average.

### Financial integrity (RULE 3)

* `totalPrice`, `tier`, `commissionAmount` and every escrow figure are computed on
  the server. Values posted by a client are ignored.
* The booking engine reads an in-memory pricing context refreshed from
  `PlatformConfig`, so the Mongoose validators and the API always agree.
* A 10% commission on a ₹50,000 token is ₹5,000 — never a percentage of the
  property price. The 70/30 agent split comes out of the commission.
* Escrow release is admin-only and blocked until the payment is verified, the
  documents are verified and the builder's KYC is approved.

### Payments

* The escrow state is **never** advanced because a client said so - the payment is
  fetched from Razorpay and checked (order, amount, captured) or a signature-
  verified webhook is received.
* `timingSafeEqual` for all signature comparisons.
* Webhooks are mounted before `express.json()` so the raw body is signed correctly.
* Webhook amounts are read in rupees exactly once - `fetchPayment()` already
  divides paise, so dividing again would make the booking branch unreachable and
  record a Rs.199 visit charge as Rs.2.
* Escrow follows a declared state machine. `token_paid -> completed` is refused,
  so builder acceptance and documentation cannot be skipped, and the release is
  claimed with a conditional atomic update so two concurrent admin requests
  cannot release the same escrow twice.
* Refunds are admin-only and go through the gateway. The refundable balance is
  derived from what is still held minus what was already returned, repeated
  partial refunds cannot exceed the captured total, and a flat is only returned
  to the market if no other live booking still holds it.
* An agent cannot raise their own commission share: the field is not in the
  self-service profile schema, and a per-agent override is only honoured when
  an admin has explicitly enabled it (default `false`).

### Data protection

* Private documents (Aadhaar, PAN, loan papers, KYC, RERA papers) - **URLs are
  stripped from every API response**. Only type, verification status and
  timestamps are exposed; the escrow ledger resolves them through authorised,
  audited admin access.
* Uploads are validated by **magic bytes**, not the client-declared MIME type,
  and the stored extension is derived from the detected content - so an HTML or
  SVG payload labelled `image/png` cannot be written to a web-served directory.
  Size limits are enforced by Multer (`MAX_UPLOAD_MB`, default 10 MB) and files
  go to Cloudinary, never into MongoDB.
* In the no-Cloudinary development fallback only the public buckets (`images`,
  `floor_plan`, `brochure`) are served statically. `documents/` is not mounted
  at all and is reachable only via an authenticated route, so a document URL is
  never a bearer token.
* Helmet, a strict CORS allow-list from `FRONTEND_URL`, `compression`, a 2 MB JSON
  body cap, and rate limiting (300/min in production, 30 per 15 min on auth
  endpoints).
* The discovery cache is principal-scoped when a request is authenticated,
  because the response embeds a per-viewer `isWishlisted` flag. `?mine=true`
  project listings are never cached.

### Production safety rails

`assertProductionEnv()` refuses to boot the API in production when
`JWT_SECRET` / `JWT_REFRESH_SECRET` are missing, shorter than 32 characters,
identical to each other, or equal to the built-in development defaults - a
deployment that forgets them would otherwise run with a publicly-known signing
key. It also requires `ALLOW_MOCK_PAYMENTS=false`, so the simulated gateway can
never be enabled in production.

Full detail: [`docs/SECURITY.md`](docs/SECURITY.md).

### Secrets

`.env`, `.env.local`, `server/uploads/` and `node_modules/` are git-ignored.
Only `.env.example` files are committed, and they contain no real values.

```bash
# Audit for committed secrets
git ls-files | Select-String -Pattern '\.env$|\.env\.local$|uploads/'
```

### Audit trail

Every financial and trust action — escrow release, refund, RERA/KYC decision,
project approval, config change — writes an `AuditLog` entry with the actor, role,
amount, metadata and IP.

---

## 20. Payment webhook setup

In the Razorpay dashboard: **Settings → Webhooks → Add New Webhook**

```
URL:      https://<api-host>/api/v1/webhooks/razorpay
Secret:   <same string as RAZORPAY_WEBHOOK_SECRET on the API>
Events:   payment.captured
          payment.failed
          refund.processed
```

Then confirm:

```bash
curl -s https://<api-host>/api/v1/webhooks/razorpay/config
# {"success":true,"data":{"gateway":"razorpay","live":true,"mockEnabled":false,...}}
```

Behaviour:

* `x-razorpay-signature` is verified as `HMAC-SHA256(rawBody, webhookSecret)` with
  a timing-safe compare. **An unsigned or wrongly-signed payload is rejected** and
  the booking state is left untouched.
* `payment.captured` runs the same authoritative verification as the checkout
  callback before moving escrow to `token_paid`.
* Webhooks are idempotent — a repeated `payment.captured` is acknowledged without a
  second state change.
* The raw body is preserved because the webhook router is mounted **before**
  `express.json()`.

Full state machine and rules: [`docs/PAYMENTS-ESCROW.md`](docs/PAYMENTS-ESCROW.md).

---

## 21. API documentation

Complete reference: [`docs/API.md`](docs/API.md).

Base URL `https://<api-host>/api/v1`. Bearer auth. One envelope:

```jsonc
{ "success": true,  "message": "Flat fetched successfully", "data": {}, "meta": {} }
{ "success": false, "message": "Validation failed", "errors": [{ "field": "tokenAmount", "message": "…" }] }
```

### Quick tour

```bash
API=http://localhost:5000/api/v1

# Discovery
curl "$API/flats?city=Pune&bhk=2,3&tier=mid&possession=ready_to_move&sortBy=pricePerSqft:asc"
curl "$API/tiers/config"
curl "$API/health"

# Auth (admin cannot self-register)
curl -X POST "$API/auth/register" -H 'Content-Type: application/json' \
  -d '{"name":"Asha Buyer","email":"asha@example.com","phone":"9876543210","password":"FlatTown@123","role":"buyer"}'

# Token booking → escrow
curl -X POST "$API/bookings/token" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"flatId":"<flatId>","tokenAmount":50000}'

# Admin escrow release (RULE 12)
curl -X PUT "$API/bookings/<id>/escrow-release" -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"note":"KYC verified"}'
```

### Key endpoints

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/{register,login,refresh,logout}`, `GET /auth/me` |
| Discovery | `GET /flats` (city, locality, bhk, tier, possession, amenities, priceMin/Max, reraVerified, builderRatingMin, sortBy, page, limit), `GET /flats/compare` (max 3) |
| Projects | `GET|POST /projects`, `GET|PUT|DELETE /projects/:id`, `PUT /projects/:id/rera-upload`, `GET /projects/:projectId/flats` |
| Flats | `GET /flats/:id`, `POST|PUT|DELETE /flats`, `POST /flats/:id/inquiry` |
| Visits | `POST /visits/request`, `POST /visits/:id/pay`, `PUT /visits/:id/status` |
| Bookings | `POST /bookings/token`, `POST /bookings/:id/verify-token-payment`, `PUT /bookings/:id/accept`, `POST /bookings/:id/documents`, `PUT /bookings/:id/escrow-release` (admin), `POST /bookings/:id/refund` (admin) |
| Requirements | `POST /requirements`, `GET /requirements/matches` |
| Loan | `POST /loan/apply`, `GET /loan/application`, `GET /loan/partners` |
| Reviews | `POST /reviews`, `PUT /reviews/:id/moderate` (admin) |
| Wishlist | `POST /wishlist/toggle/:id`, `GET /wishlist/me` |
| Admin | `PUT /admin/verify-rera/:builderId`, `PUT /admin/verify-kyc/:builderId`, `PUT /admin/approve-project/:id`, `GET /admin/escrow`, `GET /admin/revenue`, `GET|PUT /admin/commission-config`, amenity master, disputes, loan partners |
| Webhooks | `POST /webhooks/razorpay` |

---

## 22. Demo accounts

Created by `npm run seed:all` (or `npm run seed:users`). **Development only —
never use these on a real deployment.**

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@flattown.dev` | `FlatTown@123` |
| Builder (RERA verified) | `builder@flattown.dev` | `FlatTown@123` |
| Builder (RERA pending) | `builder2@flattown.dev` | `FlatTown@123` |
| Buyer | `buyer@flattown.dev` | `FlatTown@123` |
| Buyer | `buyer2@flattown.dev` | `FlatTown@123` |
| Agent | `agent@flattown.dev` | `FlatTown@123` |

The seeded admin covers **Deshmukh Group** (RERA verified, with a project and
flats). `builder2` models a builder whose RERA registration is still awaiting
verification — sign in as the admin to walk the verification queue.

Sign in at <http://localhost:3000/auth/login>. There is **no** admin
self-registration: `POST /auth/register` rejects `role: "admin"`.

---

## 23. Response-envelope contract (why hooks must unwrap `.data`)

Every endpoint responds with the envelope `{ success, message, data, meta }`, and
`lib/api.ts` turns that into `{ data, meta, message }`. A hook that returns the
whole object — instead of `queryFn: () => api.list().then((r) => r.data)` —
hands consumers an object where they expect an array.

This is invisible to `tsc`: `(bookings ?? []) as Booking[]` compiles happily and
only fails at runtime. `as` is a claim, not a check. It broke eight routes at
once, so the rule is enforced by convention and covered by
`npm run audit:contract`:

| Hook | Symptom |
| --- | --- |
| `useBookings` | `B.filter is not a function` on `/buyer`, `/buyer/bookings`, `/buyer/loan`, `/builder/bookings`, `/builder/payouts`, `/agent` |
| `useAdminLoanApplications` | `F.map is not a function` on `/admin/loan-partners` |
| `useDisputes`, `useAdminReviews`, `useProjectFlats` | Same class; caught in the same sweep |

Two related contract bugs found the same way:

* `BuilderDashboard` typed an `escrow: { held, released, commission }` block the
  endpoint never returned — the server sends `payouts` with different field
  names — so `/builder` died on `escrow.held`. The type now mirrors
  `getBuilderDashboard` exactly, including the `recentFlats` list the server was
  not sending (added there, reusing the query it already ran).
* `Requirement.bhk` is a single BHK count server-side, but was typed
  `number[]` and rendered with `.bhk?.join(', ')`. `?.` guards null, not a
  number, so `/buyer` and `/buyer/requirements` threw. The type, the renderer
  and the configuration picker (now single-select, as the API requires) agree.

Related: a **server component** must never pass a function into a client
component. `app/buyer/wishlist/page.tsx` passed `icon={Heart}` to the client
`WishlistGrid`; Next.js threw *"Functions cannot be passed directly to Client
Components"* on every request and `/buyer/wishlist` hung instead of rendering.
The icon now comes from the `wishlist` EmptyState preset.

## 24. Known limitations

* **RERA verification is manual.** An admin checks the registration against the
  state registry in the console. The spec allows a state RERA API; the interface
  is documented but no live government integration is wired up, because those
   APIs need per-state credentials and agreements.
* **Payments are India-only** (Razorpay, INR). Paise conversion happens only in the
  payment layer; the rest of the system stores whole rupees.
* **Escrow settlement is recorded, not executed.** The ledger and split are
  computed and audited correctly, but the final transfer to a builder's bank
  account and the sale-commission invoice are offline/manual operations, as the
  specification describes.
* **SMS has no vendor.** `services/sms.service.ts` defines the provider
  abstraction and a logging adapter; register a real one with
  `registerSmsProvider()` at boot. Email likewise logs until SMTP is configured.
* **Maps need a token.** Without `NEXT_PUBLIC_MAPBOX_TOKEN` the map degrades to a
  labelled static panel with Google Maps / OpenStreetMap deep links.
* **No real-time transport.** Notifications and builder chat are polled (chat
  threads refresh on focus); there is no WebSocket layer.
* **Language is English only.** No i18n framework is included.
* **Single currency, single city master.** Cities come from `PlatformConfig` and
  the seed; there is no geography autocomplete beyond the city selector.
* **Search is MongoDB text search**, not a dedicated search engine. Fine at this
  scale; a production catalogue would want Atlas Search or Elasticsearch.
* **`notFound()` returns HTTP 200 for a missing flat or project.** Next.js 14 App
  Router commits the 200 before the not-found boundary takes over for
  `notFound()` raised inside a dynamic segment. The user still gets the correct
  not-found page and the metadata is `noindex, nofollow`, so nothing incorrect
  is indexed — but a crawler sees a 200 rather than a 404. An unmatched route
  (a genuinely unknown URL) does return 404. Verified in
  `scripts/verify-all.cjs`.
* **No browser-based end-to-end suite.** Verification is layered instead: 134 API
  tests, a 102-check seeded funnel smoke test, an 82-check assertion pass over the
  rendered HTML of the production build, a 320→1920px horizontal-overflow probe,
  and `next build` / `tsc` / ESLint. There is no Playwright or Cypress runner in
  the repository.

---

## 25. Future enhancements

**Marketplace**

* Map-based search with polygon/lasso area filters and a "near me" radius.
* Saved searches with price-drop alerts.
* Virtual tours beyond a single embedded 360° URL, plus floor-plan overlays.
* Hindi, Marathi and Gujarati localisation.

**Trust & compliance**

* Automated RERA registry lookups per state, with a verification history.
* Builder scorecards: on-time possession trend, construction quality trend,
  complaint resolution time.
* Verified-purchase badges and a dispute-resolution SLA tracker.
* Developer escrow partner (bank) integration for real fund movement.

**Commerce & payments**

* Razorpay Route / EMI planner and affordability calculator on every flat.
* Configurable offers and price concessions with an audit trail.
* Part-payment plans beyond the single token (milestone-based escrow).
* Insurance and legal-services attach at handover.

**Operations**

* Builder analytics: funnel per project, conversion by tier, view→visit→booking.
* Bulk CSV import for large project catalogues.
* Multi-language email/SMS templates and a notification preference centre.
* White-label agent sub-portals with their own branded pages.

**Platform**

* PostgreSQL read replica for the analytics pipeline.
* Event-driven webhooks so builders can sync to their own CRM.
* Native apps (React Native) with push notifications.
* Automated end-to-end tests and visual regression on the responsive breakpoints.

---

## Licence

Provided as-is for evaluation and internal use.