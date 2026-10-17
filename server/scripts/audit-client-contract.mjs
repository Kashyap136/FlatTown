/**
 * Verifies every endpoint the web app actually calls.
 *
 * The path list is taken from `web/lib/api.ts`, so a route rename or a broken
 * client/server contract fails here rather than silently in the browser.
 *
 * Usage:  node scripts/audit-client-contract.mjs http://localhost:5092
 */
const BASE = (process.argv[2] ?? 'http://localhost:5092') + '/api/v1';
const P = 'FlatTown@123';

const call = async (m, p, { token, body } = {}) => {
  const r = await fetch(BASE + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  try { parsed = await r.json(); } catch { /* non-JSON */ }
  return { status: r.status, body: parsed };
};

/**
 * Finds raw Mongo `_id` leaks. Only a `_id` holding a real ObjectId (24 hex
 * chars) counts — an aggregation grouping key like `{ _id: '2026-10' }` is a
 * bucket, not a document id, and is intentionally preserved.
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
    name: `${role} contract`, email: `${role}.contract.${uniq}.${Math.random().toString(36).slice(2, 7)}@ft.test`,
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

  let bookingId = null;
  if (flat && buyerT) {
    const bk = await call('POST', '/bookings/token', { token: buyerT, body: { flatId: flat.id, tokenAmount: 50_000 } });
    bookingId = bk.body?.data?.booking?.id ?? null;
  }
  if (buyerT && flat) {
    await call('POST', '/requirements', { token: buyerT, body: { bhk: 2, budgetMin: 3_000_000, budgetMax: 6_000_000, city: 'Pune' } });
    await call('POST', '/loan/apply', { token: buyerT, body: { flatId: flat.id, loanAmount: 5_000_000 } });
    await call('POST', `/wishlist/toggle/${flat.id}`, { token: buyerT });
    const d = new Date(Date.now() + 7 * 86400000);
    await call('POST', '/visits/request', { token: buyerT, body: { flatId: flat.id, slot: { date: d.toISOString(), time: `C${uniq.toString(36)}` } } });
  }

  // Exactly the paths `web/lib/api.ts` calls.
  const probes = [
    ['GET', '/auth/me', buyerT],
    ['GET', '/amenities', undefined],
    ['GET', '/tiers/config', undefined],
    ['GET', '/cities', undefined],
    ['GET', '/flats?limit=5', undefined],
    ['GET', `/flats/${flat?.id}`, undefined],
    ['GET', `/flats/${flat?.id}/reviews`, undefined],
    ['GET', `/flats/compare?ids=${flat?.id}`, undefined],
    ['GET', '/projects?limit=5', undefined],
    ['GET', `/projects/${project?.id}`, undefined],
    ['GET', `/projects/${project?.id}/flats`, undefined],
    ['GET', '/projects/meta/cities', undefined],
    ['GET', '/builders/top-rated?city=Pune', undefined],
    ['GET', '/visits?scope=mine', buyerT],
    ['GET', '/visits/availability?flatId=' + flat?.id, buyerT],
    ['GET', '/notifications?unreadOnly=false', buyerT],
    ['PUT', '/notifications/read-all', buyerT],
    ['GET', '/notifications/chat/threads', buyerT],
    ['GET', '/visits?scope=builder', builderT],
    ['GET', '/bookings?scope=mine', buyerT],
    ['GET', '/bookings?scope=builder', builderT],
    ['GET', '/bookings?scope=agent', agentT],
    ['GET', `/bookings/${bookingId}`, buyerT],
    ['GET', `/bookings/${bookingId}/agreement`, buyerT],
    ['GET', '/requirements', buyerT],
    ['GET', '/requirements/matches', buyerT],
    ['GET', '/loan/application', buyerT],
    ['GET', '/loan/partners', buyerT],
    ['GET', '/wishlist/me', buyerT],
    ['GET', '/notifications?unreadOnly=false', buyerT],
    ['GET', '/reviews', undefined],
    ['GET', '/builders/me/dashboard', builderT],
    ['GET', '/builders/me/inquiries', builderT],
    ['GET', '/admin/dashboard', adminT],
    ['GET', '/admin/verification-queue', adminT],
    ['GET', '/admin/escrow', adminT],
    ['GET', '/admin/revenue', adminT],
    ['GET', '/admin/commission-config', adminT],
    ['GET', '/admin/amenities', adminT],
    ['GET', '/admin/bookings', adminT],
    ['GET', '/admin/disputes', adminT],
    ['GET', '/admin/reviews', adminT],
    ['GET', '/admin/loan-partners', adminT],
    ['GET', '/admin/loan-applications', adminT],
    ['GET', '/admin/audit-logs', adminT],
    ['GET', '/webhooks/razorpay/config', undefined],
  ];

  let bad = 0;
  let leaked = 0;
  for (const [method, path, token] of probes) {
    if (path.includes('undefined')) { console.log(`skip  ${method} ${path}`); continue; }
    const req = fetch(BASE + path, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    let res;
    try { res = await req; } catch { console.log(`ERR   ${method} ${path} — connection error`); bad++; continue; }
    let body = null;
    try { body = await res.json(); } catch { /* ignore */ }

    const leaks = body?.data ? findRawIds(body.data) : [];
    if (leaks.length) {
      leaked++;
      console.log(`_id   ${method} ${path} — ${[...new Set(leaks)].slice(0, 3).join(', ')}`);
    }
    if (res.status === 404) { console.log(`404   ${method} ${path}`); bad++; continue; }
    if (res.status === 401) { console.log(`401   ${method} ${path} — token rejected`); bad++; continue; }
    if (res.status >= 500) { console.log(`5xx   ${method} ${path} — ${res.status}`); bad++; continue; }
    if (!leaks.length) console.log(`ok    ${method} ${path} (${res.status})`);
  }

  console.log(`\n${bad === 0 && leaked === 0 ? 'CLIENT CONTRACT OK' : `${bad} broken route(s), ${leaked} raw-_id leak(s)`}`);
  process.exit(bad === 0 && leaked === 0 ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });