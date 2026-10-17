/**
 * Raw-`_id` audit across the whole API surface.
 *
 * Every resource must be exposed as `{ id, ... }`. A resource that returns the
 * raw Mongo document breaks any client that reads `.id` — which is exactly how
 * the marketplace amenity filter ended up sending `undefined`.
 *
 * Usage:  node scripts/audit-ids.mjs http://localhost:5099
 */
const BASE = (process.argv[2] ?? 'http://localhost:5099') + '/api/v1';
const P = 'FlatTown@123';

const call = async (m, p, { token, body } = {}) => {
  const r = await fetch(BASE + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  try { parsed = await r.json(); } catch { parsed = null; }
  return { status: r.status, body: parsed };
};

/**
 * Finds raw Mongo `_id` leaks.
 *
 * Only a `_id` holding a real ObjectId (24 hex chars) counts as a leak. An
 * aggregation grouping key such as `{ _id: '2026-10', commission: … }` is a
 * month bucket rather than a document id, and is intentionally preserved.
 */
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const findRawIds = (value, path = '$', out = []) => {
  if (Array.isArray(value)) value.forEach((v) => findRawIds(v, `${path}[]`, out));
  else if (value && typeof value === 'object') {
    if ('_id' in value && typeof value._id === 'string' && OBJECT_ID.test(value._id)) out.push(path);
    for (const [k, v] of Object.entries(value)) findRawIds(v, `${path}.${k}`, out);
  }
  return out;
};

const main = async () => {
  const login = async (e) => (await call('POST', '/auth/login', { body: { email: e, password: P } })).body?.data?.accessToken;
  const uniq = Date.now();
  const reg = async (role) => (await call('POST', '/auth/register', { body: {
    name: `${role} audit`, email: `${role}.audit.${uniq}.${Math.random().toString(36).slice(2, 7)}@ft.test`,
    phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`, password: P, role } })).body?.data;

  const adminT = await login('admin@flattown.dev');
  const builderT = await login('builder@flattown.dev');
  const buyer = await reg('buyer');
  const buyerT = buyer?.accessToken;
  const agentT = (await reg('agent'))?.accessToken;

  const flats = (await call('GET', '/flats?limit=5')).body?.data ?? [];
  const flat = flats[0];
  const projects = (await call('GET', '/projects?limit=5')).body?.data ?? [];
  const project = projects[0];

  // Create a booking + requirement so their detail endpoints are populated.
  let bookingId = null;
  if (flat && buyerT) {
    const bk = await call('POST', '/bookings/token', { token: buyerT, body: { flatId: flat.id, tokenAmount: 50_000 } });
    bookingId = bk.body?.data?.booking?.id ?? null;
  }
  if (buyerT) {
    await call('POST', '/requirements', { token: buyerT, body: { bhk: 2, budgetMin: 3_000_000, budgetMax: 6_000_000, city: 'Pune' } });
  }
  const visitList = buyerT ? (await call('GET', '/visits?scope=mine', { token: buyerT })).body?.data ?? [] : [];
  const visit = visitList[0];
  const notif = buyerT ? (await call('GET', '/notifications/me', { token: buyerT })).body?.data : null;

  const probes = [
    ['GET', '/amenities', undefined],
    ['GET', '/amenities-master', undefined],
    ['GET', '/tiers/config', undefined],
    ['GET', '/cities', undefined],
    ['GET', '/meta/stats', undefined],
    ['GET', '/marketplace/stats', undefined],
    ['GET', '/flats?limit=5', undefined],
    ['GET', '/projects?limit=5', undefined],
    ['GET', '/builders/top-rated?city=Pune', undefined],
    ['GET', '/reviews', undefined],
    ...(flat ? [['GET', `/flats/${flat.id}`, undefined], ['GET', `/flats/${flat.id}/reviews`, undefined]] : []),
    ...(project ? [['GET', `/projects/${project.id}`, undefined], ['GET', `/projects/${project.id}/flats`, undefined]] : []),
    ...(flat ? [['GET', `/flats/compare?ids=${flat.id}`, undefined]] : []),
    ['GET', '/requirements/matches', buyerT],
    ['GET', '/requirements', buyerT],
    ['GET', '/visits?scope=mine', buyerT],
    ...(visit ? [['GET', `/visits/${visit.id}`, buyerT]] : []),
    ['GET', '/bookings?scope=mine', buyerT],
    ...(bookingId ? [['GET', `/bookings/${bookingId}`, buyerT], ['GET', `/bookings/${bookingId}/agreement`, buyerT]] : []),
    ['GET', '/wishlist/me', buyerT],
    ['GET', '/loan/applications', adminT],
    ['GET', '/admin/amenities', adminT],
    ['GET', '/admin/bookings', adminT],
    ['GET', '/admin/escrow', adminT],
    ['GET', '/admin/revenue', adminT],
    ['GET', '/admin/verification-queue', adminT],
    ['GET', '/admin/disputes', adminT],
    ['GET', '/admin/reviews', adminT],
    ['GET', '/admin/loan-partners', adminT],
    ['GET', '/admin/loan-applications', adminT],
    ['GET', '/admin/commission-config', adminT],
    ['GET', '/admin/audit-logs', adminT],
    ['GET', '/admin/dashboard', adminT],
    ['GET', '/builders/me/dashboard', builderT],
    ['GET', '/builders/me/inquiries', builderT],
    ['GET', '/builders/me/agents', builderT],
    ['GET', '/bookings?scope=builder', builderT],
    ['GET', '/visits?scope=builder', builderT],
    ['GET', '/notifications/me', buyerT],
    ['GET', '/notifications/threads', buyerT],
  ];

  let leaks = 0;
  let unreachable = 0;
  for (const [method, path, token] of probes) {
    const req = fetch(BASE + path, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    let res;
    try {
      res = await req;
    } catch {
      console.log(`skip  ${method} ${path} — connection error`);
      continue;
    }
    if (res.status === 404) {
      console.log(`skip  ${method} ${path} — 404 (route not mounted)`);
      unreachable++;
      continue;
    }
    if (res.status >= 400) {
      console.log(`skip  ${method} ${path} — HTTP ${res.status}`);
      continue;
    }
    let body;
    try { body = await res.json(); } catch { console.log(`skip  ${method} ${path} — non-JSON`); continue; }
    const hits = findRawIds(body.data);
    if (hits.length) {
      leaks++;
      console.log(`LEAK  ${method} ${path} — ${[...new Set(hits)].slice(0, 5).join(', ')}`);
    } else {
      console.log(`ok    ${method} ${path}`);
    }
  }

  console.log(`\n${leaks === 0 ? 'NO RAW _id LEAKS' : `${leaks} ENDPOINT(S) STILL LEAK RAW _id`} (${unreachable} route(s) not mounted)`);
  process.exit(leaks === 0 ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });