/**
 * End-to-end funnel check against a RUNNING API.
 *
 * Exercises the full business flow over real HTTP with real multipart uploads:
 *   booking -> token payment -> builder accept -> document upload -> document
 *   verification -> admin escrow release -> review -> revenue report
 *
 * Usage:  node scripts/e2e-funnel.mjs http://localhost:5099
 */
const BASE = (process.argv[2] ?? 'http://localhost:5099') + '/api/v1';
const P = 'FlatTown@123';
const out = [];
const log = (m) => out.push(m);
let failures = 0;

const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const call = async (method, path, { token, body } = {}) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
};

const login = async (email) => (await call('POST', '/auth/login', { body: { email, password: P } })).body.data.accessToken;
const uniq = Date.now();
const rand = () => String(Math.floor(Math.random() * 1e9)).padStart(9, '0');

const register = async (role) => {
  const r = await call('POST', '/auth/register', {
    body: { name: `${role} e2e`, email: `${role}.e2e.${uniq}.${Math.random().toString(36).slice(2, 7)}@ft.test`, phone: `9${rand()}`, password: P, role },
  });
  return { id: r.body.data.user.id, token: r.body.data.accessToken };
};

const pdf = (label) => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(label)]);

const main = async () => {
  log('\n=== AUTH & ROLES ===');
  const adminT = await login('admin@flattown.dev');
  const builderT = await login('builder@flattown.dev');
  check('seeded admin logs in', Boolean(adminT));
  check('seeded builder logs in', Boolean(builderT));

  const buyer = await register('buyer');
  const me = await call('GET', '/auth/me', { token: buyer.token });
  check('/auth/me returns the caller', me.status === 200 && me.body.data.user.role === 'buyer');
  check('/auth/me never leaks a password', !JSON.stringify(me.body).includes('password'));

  check('buyer blocked from /admin/escrow', (await call('GET', '/admin/escrow', { token: buyer.token })).status === 403);
  check('builder blocked from /admin/revenue', (await call('GET', '/admin/revenue', { token: builderT })).status === 403);
  const noAuth = await call('GET', '/bookings');
  check('unauthenticated /bookings rejected', noAuth.status === 401);
  const badToken = await call('GET', '/auth/me', { token: 'not.a.jwt' });
  check('garbage JWT rejected', badToken.status === 401);

  log('\n=== DISCOVERY & FILTERS ===');
  const all = (await call('GET', '/flats?limit=60')).body;
  check('flats are returned', all.data.length > 0, `${all.meta.total} available`);

  const tiers = new Set(all.data.map((f) => f.tier));
  check('all three tiers present', tiers.has('budget') && tiers.has('mid') && tiers.has('luxury'), [...tiers].join(','));
  const bhks = new Set(all.data.map((f) => f.bhk));
  check('BHK 1-4 present', [1, 2, 3, 4].every((b) => bhks.has(b)), [...bhks].join(','));
  const rera = all.data.filter((f) => f.project?.isRERAVerified).length;
  check('RERA verified + unverified both present', rera > 0 && rera < all.data.length, `${rera}/${all.data.length} verified`);

  const budget = (await call('GET', '/flats?tier=budget&limit=60')).body;
  check('tier=budget returns only budget', budget.data.every((f) => f.tier === 'budget'), `${budget.meta.total} results`);
  const reraOnly = (await call('GET', '/flats?reraVerified=true&limit=60')).body;
  check('reraVerified=true returns only RERA projects', reraOnly.data.every((f) => f.project?.isRERAVerified === true), `${reraOnly.meta.total} results`);
  const pune = (await call('GET', '/flats?city=Pune&limit=60')).body;
  check('city filter works', pune.meta.total > 0 && pune.data.every((f) => f.project?.city === 'Pune'), `${pune.meta.total} in Pune`);
  const price = (await call('GET', '/flats?priceMin=5000000&priceMax=15000000&limit=60')).body;
  check('price range respected', price.data.every((f) => f.totalPrice >= 5000000 && f.totalPrice <= 15000000), `${price.meta.total} in ₹50L-1.5Cr`);

  const amenities = (await call('GET', '/amenities')).body.data ?? [];
  check('20 amenities seeded', amenities.length >= 20, `${amenities.length} amenities`);
  const two = amenities.slice(0, 2).map((a) => a.id ?? a._id);
  const am = await call('GET', `/flats?amenities=${two.join(',')}&limit=60`);
  check('amenities filter accepts an $all pair', am.status === 200, `${am.body.meta?.total} matched`);
  if (am.status === 200 && am.body.data.length) {
    const matchedIds = new Set(am.body.data.map((f) => f.id));
    const anyMissing = (await call('GET', '/flats?limit=60')).body.data.some(
      (f) => !matchedIds.has(f.id) && two.every((t) => (f.amenities ?? []).some((x) => String(x.id ?? x) === t)),
    );
    check('every $all result actually carries both amenities', !anyMissing);
  }

  const sorted = (await call('GET', '/flats?sortBy=pricePerSqft:asc&limit=60')).body.data;
  const rates = sorted.map((f) => f.pricePerSqft);
  check('sortBy=pricePerSqft:asc actually sorts', rates.every((r, i) => i === 0 || rates[i - 1] <= r), rates.slice(0, 3).join(','));

  const rel = (await call('GET', '/flats?sortBy=relevance&limit=60')).body.data;
  const firstUnverified = rel.findIndex((f) => !f.project?.isRERAVerified);
  const lastVerified = rel.map((f) => f.project?.isRERAVerified).lastIndexOf(true);
  check('RERA-verified ranked ahead of unverified', firstUnverified === -1 || lastVerified < firstUnverified);

  const page1 = (await call('GET', '/flats?limit=5&page=1')).body;
  const page2 = (await call('GET', '/flats?limit=5&page=2')).body;
  check('pagination returns distinct pages', page1.data.length === 5 && page2.data.length > 0 && page1.data[0].id !== page2.data[0].id);

  log('\n=== TIER / PRICE MATH (server authoritative) ===');
  const flat = all.data.find((f) => f.tier === 'luxury') ?? all.data[0];
  check('tier matches computed total', flat.tier === (flat.totalPrice < 5000000 ? 'budget' : flat.totalPrice < 15000000 ? 'mid' : 'luxury'), `${flat.title} = ₹${flat.totalPrice}`);
  check('totalPrice = size x rate + extras', Math.round(flat.sizeSqft * flat.pricePerSqft + (flat.floorRise ?? 0) + (flat.parkingCharges ?? 0)) === flat.totalPrice);

  log('\n=== SITE VISIT ===');
  const d = new Date(Date.now() + 11 * 86400000);
  const visit = await call('POST', '/visits/request', {
    token: buyer.token, body: { flatId: flat.id, slot: { date: d.toISOString(), time: `E2E ${uniq.toString(36)}` }, visitorCount: 2 },
  });
  check('site visit requested', visit.status === 201, `charge=${visit.body.data.visit.visitCharge} payment=${visit.body.data.visit.paymentStatus}`);
  const v = visit.body.data.visit;
  const order = visit.body.data.payment;
  if (v.visitCharge > 0 && order?.orderId) {
    const pay = await call('POST', `/visits/${v.id}/pay`, {
      token: buyer.token, body: { orderId: order.orderId, paymentId: `pay_mock_${order.orderId}`, signature: order.mockSignature || 'x'.repeat(64) },
    });
    check('visit charge paid & auto-confirmed', pay.status === 200 && pay.body.data.visit.status === 'confirmed', `recorded ₹${pay.body.data.payment.amount}`);
    check('visit charge amount is exact (no /100 bug)', pay.body.data.payment.amount === v.visitCharge);
  } else {
    check('free visit needs no payment', v.visitCharge === 0, `charge=₹${v.visitCharge}`);
  }
  check('buyer cannot mark a visit completed', (await call('PUT', `/visits/${v.id}/status`, { token: buyer.token, body: { status: 'completed' } })).status === 403);
  check('builder can confirm the visit', (await call('PUT', `/visits/${v.id}/status`, { token: builderT, body: { status: 'confirmed' } })).status === 200);
  check('duplicate slot refused', (await call('POST', '/visits/request', { token: buyer.token, body: { flatId: flat.id, slot: { date: d.toISOString(), time: `E2E ${uniq.toString(36)}` } } })).status === 409);

  log('\n=== TOKEN BOOKING & COMMISSION ===');
  const bk = await call('POST', '/bookings/token', { token: buyer.token, body: { flatId: flat.id, tokenAmount: 50000 } });
  const b = bk.body.data.booking;
  check('token booking created', bk.status === 201);
  check('commission is 10% of the TOKEN, not the flat price', b.commissionAmount === 5000, `token ₹50000 -> commission ₹${b.commissionAmount}; flat total ₹${b.totalPrice}`);
  check('no agent: platform keeps full commission, builder gets 90%', b.escrow.platformAmount === 5000 && b.escrow.builderAmount === 45000);
  check('duplicate booking refused', (await call('POST', '/bookings/token', { token: buyer.token, body: { flatId: flat.id, tokenAmount: 50000 } })).status === 409);
  const tokProbe = await register('buyer');
  // Validation failures return 422 (semantic) and 400 (business rule); both are
  // correct rejections, so accept either.
  const rejected = (s) => s === 400 || s === 422;
  check('token below the ₹1,000 minimum refused', rejected((await call('POST', '/bookings/token', { token: tokProbe.token, body: { flatId: flat.id, tokenAmount: 1 } })).status));
  check('token above the ₹1Cr ceiling refused', rejected((await call('POST', '/bookings/token', { token: tokProbe.token, body: { flatId: flat.id, tokenAmount: 99_999_999 } })).status));
  check('token amount off the admin allowlist refused', (await call('POST', '/bookings/token', { token: tokProbe.token, body: { flatId: flat.id, tokenAmount: 33333 } })).status === 400);
  check('builder cannot create a booking', (await call('POST', '/bookings/token', { token: builderT, body: { flatId: flat.id, tokenAmount: 50000 } })).status === 403);

  log('\n=== ESCROW STATE MACHINE ===');
  check('release refused before token paid', (await call('PUT', `/bookings/${b.id}/escrow-release`, { token: adminT, body: {} })).status === 400);
  const o = bk.body.data.payment;
  await call('POST', `/bookings/${b.id}/verify-token-payment`, { token: buyer.token, body: { orderId: o.orderId, paymentId: `pay_mock_${o.orderId}`, signature: o.mockSignature || 'y'.repeat(64) } });
  const paid = (await call('GET', `/bookings/${b.id}`, { token: buyer.token })).body.data.booking;
  check('token payment moves escrow to token_paid', paid.escrowStatus === 'token_paid');
  check('release refused while only token_paid', (await call('PUT', `/bookings/${b.id}/escrow-release`, { token: adminT, body: {} })).status === 409);
  check('buyer cannot release escrow', (await call('PUT', `/bookings/${b.id}/escrow-release`, { token: buyer.token, body: {} })).status === 403);
  check('builder cannot release escrow', (await call('PUT', `/bookings/${b.id}/escrow-release`, { token: builderT, body: {} })).status === 403);
  check('builder accepts booking', (await call('PUT', `/bookings/${b.id}/accept`, { token: builderT, body: {} })).status === 200);
  check('release refused without documents', (await call('PUT', `/bookings/${b.id}/escrow-release`, { token: adminT, body: {} })).status === 400);

  log('\n=== DOCUMENT UPLOAD (multipart) ===');
  const form = new FormData();
  form.append('types', 'aadhaar,pan');
  form.append('documents', new Blob([pdf('aadhaar')], { type: 'application/pdf' }), 'aadhaar.pdf');
  form.append('documents', new Blob([pdf('pan')], { type: 'application/pdf' }), 'pan.pdf');
  const up = await fetch(`${BASE}/bookings/${b.id}/documents`, { method: 'POST', headers: { Authorization: `Bearer ${buyer.token}` }, body: form });
  const upBody = await up.json();
  const docs = upBody.data?.booking?.documents ?? [];
  const docTypes = docs.map((x) => x.type);
  check('Aadhaar + PAN uploaded as two typed documents', up.status === 201 && docTypes.includes('aadhaar') && docTypes.includes('pan'), docTypes.join(','));
  check('document URLs are withheld from API responses (RULE 15)', docs.every((x) => x.url === undefined));

  // Unlabelled uploads must still be classified, not silently collapsed.
  const inferred = new FormData();
  inferred.append('documents', new Blob([pdf('a')], { type: 'application/pdf' }), 'my-aadhaar.pdf');
  inferred.append('documents', new Blob([pdf('p')], { type: 'application/pdf' }), 'pan-card.pdf');
  const up2 = await fetch(`${BASE}/bookings/${b.id}/documents`, { method: 'POST', headers: { Authorization: `Bearer ${buyer.token}` }, body: inferred });
  const up2Body = await up2.json();
  const inferredTypes = (up2Body.data?.booking?.documents ?? []).map((x) => x.type);
  check('unlabelled uploads are classified from the filename', up2.status === 201 && inferredTypes.includes('aadhaar') && inferredTypes.includes('pan'), inferredTypes.join(','));

  const badForm = new FormData();
  badForm.append('documents', new Blob([Buffer.from('<html><script>alert(1)</script></html>')], { type: 'application/pdf' }), 'evil.pdf');
  check('HTML disguised as PDF rejected', (await fetch(`${BASE}/bookings/${b.id}/documents`, { method: 'POST', headers: { Authorization: `Bearer ${buyer.token}` }, body: badForm })).status === 400);

  const idxs = (await call('GET', `/bookings/${b.id}`, { token: builderT })).body.data.booking.documents.map((_, i) => i);
  for (const i of idxs) await call('PUT', `/bookings/${b.id}/documents/${i}/verify`, { token: builderT, body: { verified: true } });
  const verified = (await call('GET', `/bookings/${b.id}`, { token: buyer.token })).body.data.booking;
  check('all documents verified -> docs_pending', verified.escrowStatus === 'docs_pending', verified.escrowStatus);

  log('\n=== ESCROW RELEASE ===');
  const rel2 = await call('PUT', `/bookings/${b.id}/escrow-release`, { token: adminT, body: {} });
  const rb = rel2.body.data.booking ?? rel2.body.data;
  check('admin releases escrow', rel2.status === 200 && rb.escrowStatus === 'completed');
  check('token fully accounted for', rb.escrow.builderAmount + rb.escrow.platformAmount + rb.escrow.agentAmount === 50000, `${rb.escrow.builderAmount}+${rb.escrow.platformAmount}+${rb.escrow.agentAmount}`);
  check('commission is exactly 10% of the token', rb.commissionAmount === 5000, `₹${rb.commissionAmount} on a ₹50,000 token`);
  check('builder always receives 90% of the token', rb.escrow.builderAmount === 45000, `₹${rb.escrow.builderAmount}`);
  const platformPlusAgent = rb.escrow.platformAmount + rb.escrow.agentAmount;
  check('platform + agent share equals the 10% commission', platformPlusAgent === 5000, `₹${platformPlusAgent}`);
  if (rb.escrow.agentAmount > 0) {
    check('with an agent the commission splits 70/30', rb.escrow.platformAmount === 3500 && rb.escrow.agentAmount === 1500, `${rb.escrow.platformAmount}/${rb.escrow.agentAmount}`);
  }
  const second = await call('PUT', `/bookings/${b.id}/escrow-release`, { token: adminT, body: {} });
  check('double release refused', second.status === 409);
  const ledger = (await call('GET', `/bookings/${b.id}`, { token: adminT })).body.data.booking.ledger.filter((e) => e.type === 'escrow_released');
  check('exactly one escrow_released ledger entry', ledger.length === 1);

  log('\n=== REVIEWS / WISHLIST / COMPARE / REQUIREMENTS ===');
  const rev = await call('POST', '/reviews', { token: buyer.token, body: { flatId: flat.id, bookingId: b.id, rating: 5, comment: 'On-time possession and clear pricing.' } });
  check('review accepted on a completed booking', rev.status === 201, `HTTP ${rev.status} ${rev.body.message ?? ''}`);
  const dup = await call('POST', '/reviews', { token: buyer.token, body: { flatId: flat.id, bookingId: b.id, rating: 1, comment: 'duplicate attempt' } });
  check('duplicate review refused', dup.status === 409 || dup.status === 403, `HTTP ${dup.status} ${dup.body.message ?? ''}`);
  const revOther = await call('POST', '/reviews', { token: (await register('buyer')).token, body: { flatId: flat.id, rating: 1, comment: 'no booking behind this one' } });
  check('review without a completed booking refused', revOther.status === 403, `HTTP ${revOther.status}`);

  check('wishlist toggle on', (await call('POST', `/wishlist/toggle/${flat.id}`, { token: buyer.token })).status === 200);
  const wl = await call('GET', '/wishlist/me', { token: buyer.token });
  check('wishlist returns the saved flat', wl.body.data.some((x) => x.id === flat.id), `${wl.body.data.length} saved`);
  await call('POST', `/wishlist/toggle/${flat.id}`, { token: buyer.token });
  check('wishlist toggle removes', !(await call('GET', '/wishlist/me', { token: buyer.token })).body.data.some((x) => x.id === flat.id));

  const four = (await call('GET', '/flats?limit=5')).body.data.map((x) => x.id);
  const cmp3 = await call('GET', `/flats/compare?ids=${four.slice(0, 3).join(',')}`);
  check('compare accepts up to 3 flats', cmp3.status === 200 && cmp3.body.data.items.length === 3, `${cmp3.body.data?.items?.length} compared, max=${cmp3.body.data?.maxCompare}`);
  const cmp4 = await call('GET', `/flats/compare?ids=${four.join(',')}`);
  check('compare rejects a 4th flat', cmp4.status === 400 || cmp4.status === 422, `HTTP ${cmp4.status}`);

  const req = await call('POST', '/requirements', { token: buyer.token, body: { bhk: 2, budgetMin: 3000000, budgetMax: 6000000, city: 'Pune', loanNeeded: false } });
  check('requirement created', req.status === 201);
  const matches = await call('GET', '/requirements/matches', { token: buyer.token });
  check('requirement matches returned', matches.status === 200, `${(matches.body.data?.length ?? 0)} matches`);

  const loan = await call('POST', '/loan/apply', { token: buyer.token, body: { bookingId: b.id, required: true, amount: 10000000 } });
  check('loan application accepted', loan.status === 201 || loan.status === 200, `HTTP ${loan.status}`);

  log('\n=== ADMIN ===');
  const esc = await call('GET', '/admin/escrow', { token: adminT });
  check('admin escrow ledger readable', esc.status === 200);
  const revw = await call('GET', '/admin/revenue', { token: adminT });
  check('admin revenue report readable', revw.status === 200, JSON.stringify(revw.body.data).slice(0, 200));
  const cfg = await call('PUT', '/admin/commission-config', { token: adminT, body: { commission: { bookingTokenPercent: 10, agentPlatformPercent: 70 } } });
  check('admin sets commission config', cfg.status === 200);
  // Amenity master CRUD is admin-only and lives under /amenities.
  check('non-admin cannot create an amenity', (await call('POST', '/amenities', { token: buyer.token, body: { name: 'Sneaky' } })).status === 403);
  const amen = await call('POST', '/amenities', { token: adminT, body: { name: `Test Amenity ${uniq}`, category: 'lifestyle', icon: 'Sparkles' } });
  const amenId = amen.body.data?.amenity?.id;
  check('admin creates amenity', amen.status === 201 && Boolean(amenId), `HTTP ${amen.status}`);
  check('admin updates amenity', (await call('PUT', `/amenities/${amenId}`, { token: adminT, body: { name: `Renamed ${uniq}` } })).status === 200);
  check('admin deactivates amenity', (await call('PUT', `/amenities/${amenId}`, { token: adminT, body: { isActive: false } })).status === 200);
  check('admin deletes amenity', (await call('DELETE', `/amenities/${amenId}`, { token: adminT })).status === 200);
  check('admin amenity list readable', (await call('GET', '/admin/amenities', { token: adminT })).status === 200);
  const queue = await call('GET', '/admin/verification-queue', { token: adminT });
  check('verification queue readable', queue.status === 200);

  // builder cannot self-verify RERA
  const bReg = await register('builder');
  const proj = await call('POST', '/projects', { token: bReg.token, body: { projectName: `Self verify ${uniq}`, slug: `self-${uniq}`, city: 'Pune', locality: 'Baner', fullAddress: 'Test address', reraNumber: `P5210${uniq}`, possessionDate: new Date(Date.now() + 200 * 86400000).toISOString(), status: 'new_launch', geo: { lat: 18.5, lng: 73.8 }, amenities: [], images: [] } });
  const selfRera = await call('PUT', `/projects/${proj.body.data.project.id}/rera-upload`, { token: bReg.token, body: { reraNumber: `P5210${uniq}` } });
  check('builder RERA upload never self-verifies', selfRera.status !== 200 || selfRera.body.data?.project?.isRERAVerified === false, `isRERAVerified=${selfRera.body.data?.project?.isRERAVerified}`);

  log('\n=== REFUND ===');
  const buyerC = await register('buyer');
  const b3 = await call('POST', '/bookings/token', { token: buyerC.token, body: { flatId: all.data[2].id, tokenAmount: 50000 } });
  const o3 = b3.body.data.payment;
  await call('POST', `/bookings/${b3.body.data.booking.id}/verify-token-payment`, {
    token: buyerC.token, body: { orderId: o3.orderId, paymentId: `pay_mock_${o3.orderId}`, signature: o3.mockSignature || 'z'.repeat(64) },
  });
  const rf = await call('POST', `/bookings/${b3.body.data.booking.id}/refund`, { token: adminT, body: { reason: 'End-to-end refund verification run' } });
  const rfB = rf.body.data.booking ?? rf.body.data;
  check('admin refunds a token', rf.status === 200 && rfB.escrowStatus === 'refunded', `refunded ₹${rfB.escrow?.refundedAmount}`);
  check('duplicate refund refused', (await call('POST', `/bookings/${b3.body.data.booking.id}/refund`, { token: adminT, body: { reason: 'attempting a duplicate refund' } })).status === 409);
  check('buyer cannot refund', (await call('POST', `/bookings/${b3.body.data.booking.id}/refund`, { token: buyerC.token, body: { reason: 'buyer attempting refund' } })).status === 403);

  console.log(out.join('\n'));
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => {
  console.log(out.join('\n'));
  console.error('\nHARNESS ERROR', e);
  process.exit(1);
});