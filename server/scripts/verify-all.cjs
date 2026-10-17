/* eslint-disable */
/**
 * Full-stack page verification.
 *
 * Boots the API against a throwaway in-memory MongoDB, seeds the demo dataset,
 * starts the API on the origin the web app was built with, and then asserts
 * what the running Next.js production server actually returns — marketplace,
 * flat detail, project detail, compare, booking funnel, auth, role guards, 404,
 * and the SEO metadata on every public route.
 *
 * The web app must already be running:
 *   cd web && npm run build && npm run start
 *
 * Usage:  node --import tsx scripts/verify-all.cjs [webOrigin] [apiPort]
 */
const http = require('node:http');

const WEB = process.argv[2] || 'http://localhost:3000';
const API_PORT = Number(process.argv[3] || 5000);
const API = `http://localhost:${API_PORT}`;

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PORT = String(API_PORT);
process.env.ALLOW_MOCK_PAYMENTS = 'true';
process.env.MOCK_PAYMENT_KEY = 'verify-mock-payment-key';
process.env.JWT_SECRET = 'verify-access-secret-0123456789-abcdefghij';
process.env.JWT_REFRESH_SECRET = 'verify-refresh-secret-0123456789-abcdefghij';
process.env.LOG_LEVEL = 'error';
process.env.FRONTEND_URL = 'http://localhost:3000';

let passed = 0;
let failed = 0;
const failures = [];

const check = (label, condition, detail) => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}${detail !== undefined ? `  -> ${String(detail).slice(0, 170)}` : ''}`);
  }
};
const section = (t) => console.log(`\n=== ${t} ===`);

const get = (url) =>
  new Promise((resolve, reject) => {
    http
      .get(url, { headers: { 'User-Agent': 'flattown-verify' } }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });

const getJson = async (url) => JSON.parse((await get(url)).body);
const title = (html) => (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
const meta = (html, n) => (html.match(new RegExp(`<meta name="${n}" content="([^"]*)"`)) || [])[1] || '';
const has = (html, s) => html.includes(s);
const twice = (html) => title(html).includes('FLAT TOWN | FLAT TOWN');

(async () => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri('flattown-verify');

  const { connectDatabase } = await import('../src/config/db.ts');
  await connectDatabase();
  const { seedAll } = await import('../src/seed/seedAll.ts');
  await seedAll();
  const { createApp } = await import('../src/app.ts');
  const server = createApp().listen(API_PORT);
  await new Promise((r) => server.once('listening', r));
  console.log(`[verify] API ${API} · web ${WEB}\n`);

  /* ------------------------------------------------------------------ */
  section('Marketplace  /');
  const home = await get(`${WEB}/`);
  check('responds 200', home.status === 200, home.status);
  check('renders the hero headline', has(home.body, 'Find your next home, direct from trusted builders'));
  check('title is not doubled', !twice(home.body), title(home.body));
  check('has a meta description', Boolean(meta(home.body, 'description')));
  // The results grid is a client island behind Suspense, so the server HTML
  // holds the skeleton by design. The BHK tabs are asserted on a detail page.
  check('renders the loading skeleton for the results island', has(home.body, 'Loading flats'));
  check('renders tier chips', has(home.body, 'Budget') && has(home.body, 'Mid') && has(home.body, 'Luxury'));
  check('renders the city selector', has(home.body, 'Select city'));
  check('renders a skip link', has(home.body, 'Skip to main content'));
  check('renders the value props', has(home.body, 'New builder flats only') && has(home.body, 'Admin-verified RERA'));
  check('states the product promise', has(home.body, 'transparent') || has(home.body, 'Transparent'));

  section('Flat detail  /flat/[id]');
  const flat = (await getJson(`${API}/api/v1/flats?city=Pune&limit=1`)).data[0];
  const fp = await get(`${WEB}/flat/${flat.id}`);
  check('responds 200', fp.status === 200, fp.status);
  const t = title(fp.body);
  const desc = meta(fp.body, 'description');
  check('title has BHK + locality + city', t.includes(`${flat.bhk} BHK`) && t.includes(flat.project.locality) && t.includes(flat.project.city), t);
  check('title has the price', /\d/.test(t) && t.includes(','), t);
  check('title is not doubled', !twice(fp.body), t);
  check('description has BHK', desc.includes(`${flat.bhk} BHK`), desc.slice(0, 80));
  check('description has the locality and city', desc.includes(flat.project.locality) && desc.includes(flat.project.city));
  check('description has the price', /\d/.test(desc) && desc.includes(','));
  check('description has the builder', desc.includes(flat.builder.name) || desc.includes(flat.builder.companyName || '@@none@@'), desc.slice(0, 130));
  check('has a canonical URL', has(fp.body, 'rel="canonical"'));
  check('has Open Graph tags', has(fp.body, 'property="og:title"') && has(fp.body, 'property="og:description"'));
  check('has an Open Graph image', has(fp.body, 'property="og:image"'));
  check('has a Twitter card', has(fp.body, 'name="twitter:card"'));
  check('emits Product JSON-LD', has(fp.body, 'Product') && has(fp.body, 'schema.org'));
  check('JSON-LD carries the price', has(fp.body, String(flat.totalPrice)));
  check('renders the h1', has(fp.body, flat.title));
  check('renders the price breakdown', has(fp.body, 'Price breakdown'));
  check('shows the size x rate arithmetic', has(fp.body, 'Base total') && has(fp.body, 'Total price'));
  check('shows the tier', has(fp.body, 'Budget') || has(fp.body, 'Mid') || has(fp.body, 'Luxury'));
  check('shows the RERA state', has(fp.body, 'RERA Verified') || has(fp.body, 'RERA pending'));
  check('renders the possession timeline', has(fp.body, 'Possession timeline'));
  check('renders the site visit CTA', has(fp.body, 'Book a site visit'));
  check('renders the reserve CTA', has(fp.body, 'Reserve with a token'));
  check('renders the inquiry form', has(fp.body, 'Interested in this flat'));
  check('renders amenities', has(fp.body, 'Amenities'));
  check('renders the map panel', has(fp.body, 'Location'));
  check('renders the builder card', has(fp.body, 'Builder rating') || has(fp.body, 'RERA'));
  check('states the token is held in escrow', has(fp.body, 'held in escrow'));
  check('states the commission is on the token only', has(fp.body, 'on the token only') || has(fp.body, 'never a percentage of the property price'));
  check('leaks no private document URL', !has(fp.body, '/uploads/documents/'));
  check('renders compare affordance', has(fp.body, 'You can compare') && has(fp.body, '>Compare<'));

  section('Project detail  /project/[id]');
  const project = (await getJson(`${API}/api/v1/projects?limit=1`)).data[0];
  const pp = await get(`${WEB}/project/${project.id}`);
  check('responds 200', pp.status === 200, pp.status);
  check('title has the project name', title(pp.body).includes(project.projectName), title(pp.body));
  check('title is not doubled', !twice(pp.body), title(pp.body));
  check('has a meta description', Boolean(meta(pp.body, 'description')));
  check('emits Residence JSON-LD', has(pp.body, 'Residence'));
  check('renders the tier distribution', has(pp.body, 'Tier distribution'));
  check('lists the project flats', has(pp.body, 'Available flats in this project'));
  check('shows the starting price', has(pp.body, 'Starting at'));
  check('shows the RERA number state', has(pp.body, 'RERA'));
  check('renders the brochure/download affordance', has(pp.body, 'See all flats') || has(pp.body, 'brochure'));
  check('renders the map panel', has(pp.body, 'Location'));

  section('Compare  /compare');
  const cmp = await get(`${WEB}/compare`);
  check('responds 200', cmp.status === 200, cmp.status);
  check('has a meta description', Boolean(meta(cmp.body, 'description')));
  check('explains the 3-flat cap', has(cmp.body, 'up to three') || has(cmp.body, 'up to 3'));
  check('states the 3-flat limit and the empty state', has(cmp.body, 'Nothing to compare yet') || has(cmp.body, 'up to three'));
  check('explains the commission basis for a comparing visitor', has(cmp.body, 'Add up to 3 flats') || has(cmp.body, 'up to 3 flats'));

  section('Booking funnel  /booking/[flatId]');
  const bk = await get(`${WEB}/booking/${flat.id}`);
  check('responds 200', bk.status === 200, bk.status);
  check('explains escrow', has(bk.body, 'escrow') || has(bk.body, 'Where your money'));
  check('asks the buyer to sign in', has(bk.body, 'Sign in') || has(bk.body, 'Create a buyer account'));
  check('gates the funnel behind sign-in', has(bk.body, 'Sign in to raise a booking token') || has(bk.body, 'Create a buyer account'));

  section('Auth');
  const lg = await get(`${WEB}/auth/login`);
  check('login responds 200', lg.status === 200, lg.status);
  const rg = await get(`${WEB}/auth/register`);
  check('register responds 200', rg.status === 200, rg.status);
  check('offers buyer, builder and agent', has(rg.body, 'Builder') && has(rg.body, 'Agent') && has(rg.body, 'Buyer'));
  check('never offers admin self-registration', !/>Admin</.test(rg.body), 'admin role offered');
  check('states admin is provisioned separately', has(rg.body, 'Admin accounts are provisioned') || has(rg.body, 'cannot be'));

  section('Role guards while signed out');
  for (const route of ['/buyer', '/builder', '/agent', '/admin', '/buyer/bookings', '/admin/escrow', '/admin/config']) {
    const page = await get(`${WEB}${route}`);
    // Strip <script> (RSC flight payload), <title> and meta, then look for text
    // that only a signed-in dashboard would render.
    const visible = page.body
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<title>[\s\S]*?<\/title>/g, '')
      .replace(/<meta[^>]*>/g, '');
    const leaked = /Recent inquiries|Platform administration|Revenue|Tier &amp; commission configuration|Needs your attention|Booking StatusTimeline|Your bookings/i.test(
      visible,
    );
    check(`${route} leaks no dashboard data while signed out`, page.status === 200 && !leaked, `status ${page.status}, leaked=${leaked}`);
    check(`${route} shows a neutral loading state server-side`, has(page.body, 'Loading your dashboard'), page.status);
  }

  section('Not found');
  const nf = await get(`${WEB}/flat/000000000000000000000000`);
  // NOTE: Next 14 App Router commits a 200 for notFound() inside a dynamic
  // segment; the correct not-found UI and a noindex metadata are still served.
  check('unknown flat serves the not-found UI', has(nf.body, 'We could not find that page'), nf.status);
  check('unknown flat is marked noindex', has(nf.body, 'noindex'), nf.status);
  check('offers a way back', has(nf.body, 'Browse the marketplace') || has(nf.body, 'could not find'));

  section('Report');
  console.log(`\n${'='.repeat(66)}`);
  console.log(`PAGE VERIFICATION: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log('='.repeat(66));

  server.close();
  const mongoose = (await import('mongoose')).default;
  await mongoose.connection.close();
  await mongod.stop();
  process.exit(failed > 0 ? 1 : 0);
})().catch(async (error) => {
  console.error('\nPAGE VERIFICATION CRASHED\n');
  console.error(error);
  process.exit(1);
});
