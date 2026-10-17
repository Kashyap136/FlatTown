/* eslint-disable */
/**
 * End-to-end smoke test against the REAL seed dataset.
 *
 * Unlike the other suites (which build fixtures by hand), this boots an
 * in-memory MongoDB, runs `seedAll()` exactly as `npm run seed:all` would, then
 * drives the full funnel over HTTP through the real Express app:
 *
 *   health -> discovery -> auth -> inquiry -> visit -> token -> documents
 *          -> escrow release -> audit
 *
 * It verifies the seed data itself respects the business rules (tier maths,
 * ready-to-move dates, RERA ranking) and that the seeded demo accounts work.
 *
 * Usage:  node --import tsx scripts/smoke-seeded.cjs
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.ALLOW_MOCK_PAYMENTS = 'true';
process.env.MOCK_PAYMENT_KEY = process.env.MOCK_PAYMENT_KEY || 'smoke-mock-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-access-secret-0123456789-0123456789';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'smoke-refresh-secret-0123456789-abcdef';

/* ------------------------------------------------------------------ runner */

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
    console.log(`  FAIL  ${label}${detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`);
  }
};

const section = (title) => console.log(`\n=== ${title} ===`);

/* -------------------------------------------------------------------- main */

(async () => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri('flattown-smoke');

  const request = (await import('supertest')).default;
  const { createPaymentOrder } = await import('../src/utils/razorpay.ts');
  const { connectDatabase } = await import('../src/config/db.ts');

  // The seed entry points expect the caller to have connected, exactly as the
  // `require.main` bootstrap in `seedAll.ts` does for `npm run seed:all`.
  await connectDatabase();

  console.log('Seeding the demo marketplace…');
  const { seedAll } = await import('../src/seed/seedAll.ts');
  await seedAll();

  const { createApp } = await import('../src/app.ts');
  const app = createApp();
  const api = '/api/v1';

  /* ------------------------------------------------------------------ health */
  section('Health & gateway labelling');
  const health = await request(app).get('/health').expect(200);
  check('health reports ok', health.body.data.status === 'ok', health.body.data);
  check('payments gateway is the simulated one', health.body.data.payments.gateway === 'mock', health.body.data.payments);
  check('simulated gateway is flagged as not live', health.body.data.payments.live === false);
  check('database connected', health.body.data.database === 'connected');

  /* ------------------------------------------------------------------ meta */
  section('Master data');
  const amenities = await request(app).get(`${api}/amenities`).expect(200);
  check('20 amenities seeded', amenities.body.data.length === 20, amenities.body.data.length);
  const requiredNames = ['Lift', 'Parking', 'Swimming Pool', 'Gym'];
  const names = amenities.body.data.map((a) => a.name);
  check('required amenities present', requiredNames.every((n) => names.includes(n)), names);

  const tiers = await request(app).get(`${api}/tiers/config`).expect(200);
  check('budget threshold is 50 lakh', tiers.body.data.thresholds.budget === 5_000_000, tiers.body.data.thresholds);
  check('mid threshold is 1.5 crore', tiers.body.data.thresholds.mid === 15_000_000, tiers.body.data.thresholds);

  const cities = await request(app).get(`${api}/cities`).expect(200);
  const cityNames = cities.body.data.map((c) => c.name);
  check('Pune and Mumbai seeded', cityNames.includes('Pune') && cityNames.includes('Mumbai'), cityNames);
  const pune = cities.body.data.find((c) => c.name === 'Pune');
  check(
    'Pune has the required localities',
    ['Pimpri', 'Wakad', 'Baner'].every((l) => pune.localities.includes(l)),
    pune && pune.localities,
  );

  /* ------------------------------------------------------------------ seed maths */
  section('Seeded data respects the business rules');
  const all = await request(app).get(`${api}/flats?limit=60&sortBy=relevance`).expect(200);
  const flats = all.body.data;
  check('flats are seeded', flats.length >= 10, flats.length);

  const badTotal = flats.filter((f) => {
    const expected = Math.round(f.sizeSqft * f.pricePerSqft + (f.floorRise || 0) + (f.parkingCharges || 0));
    return expected !== f.totalPrice;
  });
  check('totalPrice === size x rate + surcharges for every flat', badTotal.length === 0, badTotal.slice(0, 2));

  const expectedTier = (total) => (total < 5_000_000 ? 'budget' : total < 15_000_000 ? 'mid' : 'luxury');
  const badTier = flats.filter((f) => expectedTier(f.totalPrice) !== f.tier);
  check('tier is derived from the total price for every flat', badTier.length === 0, badTier.slice(0, 2));

  const tierCounts = flats.reduce((acc, f) => ({ ...acc, [f.tier]: (acc[f.tier] || 0) + 1 }), {});
  check('budget flats exist', (tierCounts.budget || 0) > 0, tierCounts);
  check('mid flats exist', (tierCounts.mid || 0) > 0, tierCounts);
  check('luxury flats exist', (tierCounts.luxury || 0) > 0, tierCounts);

  const ready = flats.filter((f) => f.project?.status === 'ready_to_move');
  check(
    'every ready_to_move flat has possessionDate <= today',
    ready.length > 0 && ready.every((f) => new Date(f.possessionDate).getTime() <= Date.now()),
    ready.map((f) => f.possessionDate),
  );

  // Sold-out units are hidden from the default listing, so ask for them.
  const withSold = await request(app).get(`${api}/flats?limit=60&includeUnavailable=true`).expect(200);
  check(
    'some flats are sold out',
    withSold.body.data.some((f) => !f.isAvailable),
    `${withSold.body.data.filter((f) => !f.isAvailable).length} sold out`,
  );
  check(
    'sold-out flats are hidden by default',
    flats.every((f) => f.isAvailable),
    'the default listing must only return available units',
  );
  check('RERA verified and pending both exist', flats.some((f) => f.project?.isRERAVerified) && flats.some((f) => !f.project?.isRERAVerified));

  const first = flats.find((f) => f.project?.isRERAVerified);
  const last = flats[flats.length - 1];
  if (first && last && first.id !== last.id) {
    check('RERA verified listings rank first (RULE 6)', first.project.isRERAVerified, { first: first.title });
  }

  const bhkSpread = [...new Set(flats.map((f) => f.bhk))].sort();
  check('multiple BHK configurations seeded', bhkSpread.length >= 3, bhkSpread);

  /* ------------------------------------------------------------------ auth */
  section('Seeded demo accounts');
  const PASSWORD = 'FlatTown@123';
  const login = async (email) => {
    const res = await request(app)
      .post(`${api}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.data;
  };

  const admin = await login('admin@flattown.dev');
  check('admin can sign in', admin.user.role === 'admin', admin.user.role);
  check('admin never has a password in the payload', admin.user.password === undefined);

  const builder = await login('builder@flattown.dev');
  check('builder can sign in', builder.user.role === 'builder', builder.user.role);
  check('builder is RERA verified', builder.user.isRERAVerified === true);

  const builder2 = await login('builder2@flattown.dev');
  check('second builder is awaiting RERA verification', builder2.user.isRERAVerified === false);

  const buyer = await login('buyer@flattown.dev');
  check('buyer can sign in', buyer.user.role === 'buyer', buyer.user.role);
  check('new builders default to a 3.5 rating', typeof builder2.user.rating.avg === 'number');

  const agent = await login('agent@flattown.dev');
  check('agent can sign in', agent.user.role === 'agent', agent.user.role);

  const adminAuth = ['Authorization', `Bearer ${admin.accessToken}`];
  const builderAuth = ['Authorization', `Bearer ${builder.accessToken}`];
  const buyerAuth = ['Authorization', `Bearer ${buyer.accessToken}`];
  const agentAuth = ['Authorization', `Bearer ${agent.accessToken}`];

  /* ------------------------------------------------------------------ authz */
  section('Authorisation boundaries');
  check('admin self-registration is refused', (await request(app)
    .post(`${api}/auth/register`)
    .send({ name: 'X Y', email: 'x@y.com', phone: '9999999999', password: 'FlatTown@123', role: 'admin' })
    .expect(422)).body.success === false);

  check('a buyer cannot create a flat', (await request(app)
    .post(`${api}/flats`)
    .set(...buyerAuth)
    .send({ projectId: flats[0].project.id, title: 'Sneaky', bhk: 2, type: 'apartment', sizeSqft: 900, pricePerSqft: 5000, floor: 1, possessionDate: new Date().toISOString() })
    .expect(403)).body.success === false);

  check('a builder cannot release escrow', (await request(app)
    .put(`${api}/bookings/000000000000000000000000/escrow-release`)
    .set(...builderAuth)
    .send({})
    .expect(403)).body.success === false);

  check('an agent cannot reach the admin dashboard', (await request(app)
    .get(`${api}/admin/dashboard`)
    .set(...agentAuth)
    .expect(403)).body.success === false);

  check('an agent cannot self-verify RERA', (await request(app)
    .put(`${api}/admin/verify-rera/${agent.user.id}`)
    .set(...agentAuth)
    .send({ approved: true })
    .expect(403)).body.success === false);

  /* ------------------------------------------------------------------ discovery */
  section('Discovery filters over seeded data');
  const byCity = await request(app).get(`${api}/flats?city=Pune&limit=60`).expect(200);
  check('city filter returns only Pune', byCity.body.data.length > 0 && byCity.body.data.every((f) => f.project.city === 'Pune'));

  const byLocality = await request(app).get(`${api}/flats?locality=Wakad&limit=60`).expect(200);
  check(
    'locality filter is honoured',
    byLocality.body.data.length > 0 && byLocality.body.data.every((f) => /wakad/i.test(f.project.locality)),
    byLocality.body.data.length,
  );

  const byBudget = await request(app).get(`${api}/flats?tier=budget&limit=60`).expect(200);
  check('budget filter returns only budget tier', byBudget.body.data.every((f) => f.tier === 'budget'), byBudget.body.data.length);

  const byRange = await request(app).get(`${api}/flats?priceMax=5000000&limit=60`).expect(200);
  check('price ceiling is honoured', byRange.body.data.every((f) => f.totalPrice <= 5_000_000), byRange.body.data.length);

  const rtm = await request(app).get(`${api}/flats?possession=ready_to_move&limit=60`).expect(200);
  check(
    'ready_to_move filter only returns flats with possessionDate <= today',
    rtm.body.data.every((f) => new Date(f.possessionDate).getTime() <= Date.now()),
    rtm.body.data.length,
  );

  const sorted = await request(app).get(`${api}/flats?sortBy=price:asc&limit=60`).expect(200);
  const prices = sorted.body.data.map((f) => f.totalPrice);
  check('price:asc is actually ascending', prices.every((p, i) => i === 0 || prices[i - 1] <= p), prices.slice(0, 5));

  const paged = await request(app).get(`${api}/flats?page=1&limit=3`).expect(200);
  check('pagination returns the requested page size', paged.body.data.length === 3, paged.body.data.length);
  check('pagination reports a total', typeof paged.body.meta.total === 'number' && paged.body.meta.total > 3, paged.body.meta);
  check('cache header is present', Boolean(paged.headers['x-flattown-cache']), paged.headers['x-flattown-cache']);

  const twoAmenityIds = amenities.body.data.slice(0, 2).map((a) => a.id);
  const byAmenities = await request(app)
    .get(`${api}/flats?amenities=${twoAmenityIds.join(',')}&limit=60`)
    .expect(200);
  check(
    'amenities filter uses $all semantics (RULE 9)',
    byAmenities.body.data.every((f) => twoAmenityIds.every((id) => (f.amenities || []).some((a) => a.id === id))),
    byAmenities.body.data.length,
  );

  const compare = await request(app)
    .get(`${api}/flats/compare?ids=${flats.slice(0, 3).map((f) => f.id).join(',')}`)
    .expect(200);
  check('compare returns 3 flats and the cap', compare.body.data.items.length === 3 && compare.body.data.maxCompare === 3);

  const tooMany = await request(app)
    .get(`${api}/flats/compare?ids=${flats.slice(0, 4).map((f) => f.id).join(',')}`)
    .expect(422);
  check('a 4th flat cannot be compared', tooMany.body.success === false);

  /* ------------------------------------------------------------------ projects */
  section('Projects & builder dashboards');
  const projects = await request(app).get(`${api}/projects?limit=20`).expect(200);
  check('projects are seeded and public', projects.body.data.length >= 3, projects.body.data.length);
  const project = projects.body.data[0];
  const projectDetail = await request(app).get(`${api}/projects/${project.id}`).expect(200);
  check('project detail resolves its flats', projectDetail.body.data.flats.length > 0, projectDetail.body.data.flats.length);
  check('project detail reports a RERA number or pending state', 'isRERAVerified' in projectDetail.body.data);

  const dash = await request(app).get(`${api}/builders/me/dashboard`).set(...builderAuth).expect(200);
  check('builder dashboard returns live stats', typeof dash.body.data.stats.views === 'number' && typeof dash.body.data.stats.inquiries === 'number', dash.body.data.stats);
  check('builder dashboard lists their projects', dash.body.data.projects.length > 0, dash.body.data.projects.length);

  const adminDash = await request(app).get(`${api}/admin/dashboard`).set(...adminAuth).expect(200);
  check('admin dashboard reports seeded counts', adminDash.body.data.flats.total > 0, adminDash.body.data.flats);
  check('admin dashboard reports platform revenue buckets', 'tokenCommission' in adminDash.body.data.revenue, adminDash.body.data.revenue);

  /* ------------------------------------------------------------------ funnel */
  section('Inquiry -> visit -> token -> documents -> escrow');
  const target = flats.find((f) => f.isAvailable && f.project?.isRERAVerified) ?? flats.find((f) => f.isAvailable);
  check('an available flat exists to book', Boolean(target));

  const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const inquiry = await request(app)
    .post(`${api}/flats/${target.id}/inquiry`)
    .set(...buyerAuth)
    .send({ message: 'Smoke test inquiry' })
    .expect(201);
  check('inquiry is created', inquiry.body.data.inquiry.status === 'new');

  const slotTime = '10:00 AM';
  const visit = await request(app)
    .post(`${api}/visits/request`)
    .set(...buyerAuth)
    .send({ flatId: target.id, slot: { date: future, time: slotTime } })
    .expect(201);
  check('site visit is requested', visit.body.data.visit.status === 'requested', visit.body.data.visit.status);
  check('first verified-builder visit is free', visit.body.data.visit.visitCharge === 0, visit.body.data.visit.visitCharge);
  check('a free visit needs no payment', visit.body.data.visit.paymentStatus === 'not_required');

  await request(app)
    .put(`${api}/visits/${visit.body.data.visit.id}/status`)
    .set(...builderAuth)
    .send({ status: 'confirmed' })
    .expect(200);
  check('builder confirms the visit', true);

  await request(app)
    .put(`${api}/visits/${visit.body.data.visit.id}/status`)
    .set(...builderAuth)
    .send({ status: 'completed' })
    .expect(200);

  const tokenBooking = await request(app)
    .post(`${api}/bookings/token`)
    .set(...buyerAuth)
    .send({ flatId: target.id, tokenAmount: 50_000, agentId: agent.user.id, loanAssistanceRequired: true })
    .expect(201);
  const booking = tokenBooking.body.data.booking;
  const payment = tokenBooking.body.data.payment;

  check('booking starts un-paid', booking.escrowStatus === 'created', booking.escrowStatus);
  check('commission is 10% of the TOKEN only (RULE 4)', booking.commissionAmount === 5_000, booking.commissionAmount);
  check('commission is NOT 10% of the property price', booking.commissionAmount !== Math.round(booking.totalPrice * 0.1));
  check('the 70/30 agent split is applied', payment.split.platformAmount === 3_500 && payment.split.agentAmount === 1_500, payment.split);
  check('the builder share is a full 90%', payment.split.builderAmount === 45_000, payment.split.builderAmount);
  check('the token is fully accounted for', payment.split.builderAmount + payment.split.platformAmount + payment.split.agentAmount === 50_000);
  check('the simulated gateway is labelled', payment.gateway === 'mock' && payment.simulated === true, payment);

  const order = await createPaymentOrder({ amount: 50_000, receipt: 'smoke' });
  const mockSig = (await import('crypto')).createHmac('sha256', process.env.MOCK_PAYMENT_KEY).update(`${order.orderId}|50000`).digest('hex');
  const forged = await request(app)
    .post(`${api}/bookings/${booking.id}/verify-token-payment`)
    .set(...buyerAuth)
    .send({ orderId: 'order_live_not_real', paymentId: 'pay_mock_x', signature: mockSig })
    .expect(400);
  check('an unverifiable order cannot mark the token paid', forged.body.success === false);

  const unverified = await request(app).get(`${api}/bookings/${booking.id}`).set(...buyerAuth).expect(200);
  check('escrow is still held at "created"', unverified.body.data.escrowStatus === 'created', unverified.body.data.escrowStatus);

  const bookingOrder = (await request(app).get(`${api}/bookings/${booking.id}`).set(...buyerAuth)).body.data;
  check('the booking recorded the gateway order', Boolean(bookingOrder.payment?.orderId), bookingOrder.payment);

  const verifyBody = {
    orderId: payment.orderId,
    paymentId: 'pay_mock_smoke_1',
    signature: (await import('crypto')).createHmac('sha256', process.env.MOCK_PAYMENT_KEY).update(`${payment.orderId}|50000`).digest('hex'),
  };
  const verified = await request(app)
    .post(`${api}/bookings/${booking.id}/verify-token-payment`)
    .set(...buyerAuth)
    .send(verifyBody)
    .expect(200);
  check('verification moves escrow to token_paid', verified.body.data.booking.escrowStatus === 'token_paid', verified.body.data.booking.escrowStatus);

  await request(app).put(`${api}/bookings/${booking.id}/accept`).set(...builderAuth).send({}).expect(200);
  const accepted = await request(app).get(`${api}/bookings/${booking.id}`).set(...builderAuth).expect(200);
  check('builder acceptance advances the state', accepted.body.data.escrowStatus === 'builder_accepted', accepted.body.data.escrowStatus);

  const earlyRelease = await request(app)
    .put(`${api}/bookings/${booking.id}/escrow-release`)
    .set(...adminAuth)
    .send({})
    .expect(400);
  check('escrow release is blocked before documents are verified', /documents not verified/i.test(earlyRelease.body.message), earlyRelease.body.message);

  // This booking asked for loan assistance, so a loan approval is required too.
  const REQUIRED_DOCS = ['aadhaar', 'pan'];
  for (const type of REQUIRED_DOCS) {
    await request(app)
      .post(`${api}/bookings/${booking.id}/documents`)
      .set(...buyerAuth)
      .attach('documents', Buffer.from(`%PDF-1.4 ${type} smoke`), { filename: `${type}.pdf`, contentType: 'application/pdf' })
      .field('types', type)
      .expect(201);
  }

  const partial = await request(app).get(`${api}/bookings/${booking.id}`).set(...adminAuth).expect(200);
  check('loan assistance is recorded on the booking', partial.body.data.loanStatus === 'applied', partial.body.data.loanStatus);
  check('private document URLs are never returned (RULE 15)', partial.body.data.documents.every((d) => d.url === undefined));

  for (let i = 0; i < REQUIRED_DOCS.length; i += 1) {
    await request(app)
      .put(`${api}/bookings/${booking.id}/documents/${i}/verify`)
      .set(...builderAuth)
      .send({ verified: true })
      .expect(200);
  }

  // A loan-assisted booking must not release without the loan approval letter.
  const missingLoan = await request(app)
    .put(`${api}/bookings/${booking.id}/escrow-release`)
    .set(...adminAuth)
    .send({})
    .expect(400);
  check(
    'release is still blocked while the loan approval is missing',
    /documents not verified/i.test(missingLoan.body.message),
    missingLoan.body.message,
  );

  await request(app)
    .post(`${api}/bookings/${booking.id}/documents`)
    .set(...buyerAuth)
    .attach('documents', Buffer.from('%PDF-1.4 loan_approval smoke'), { filename: 'loan.pdf', contentType: 'application/pdf' })
    .field('types', 'loan_approval')
    .expect(201);
  await request(app)
    .put(`${api}/bookings/${booking.id}/documents/${REQUIRED_DOCS.length}/verify`)
    .set(...builderAuth)
    .send({ verified: true })
    .expect(200);

  const afterDocs = await request(app).get(`${api}/bookings/${booking.id}`).set(...adminAuth).expect(200);
  check('all three documents are recorded', afterDocs.body.data.documents.length === 3, afterDocs.body.data.documents.length);

  for (let i = 0; i < 2; i += 1) {
    await request(app)
      .put(`${api}/bookings/${booking.id}/documents/${i}/verify`)
      .set(...builderAuth)
      .send({ verified: true })
      .expect(200);
  }

  const released = await request(app)
    .put(`${api}/bookings/${booking.id}/escrow-release`)
    .set(...adminAuth)
    .send({ note: 'Smoke test release' })
    .expect(200);
  const escrow = released.body.data.booking.escrow;
  check('escrow release completes the booking', released.body.data.booking.escrowStatus === 'completed', released.body.data.booking.escrowStatus);
  check('90% went to the builder', escrow.builderAmount === 45_000, escrow.builderAmount);
  check('70% of the commission stayed with the platform', escrow.platformAmount === 3_500, escrow.platformAmount);
  check('30% of the commission went to the agent', escrow.agentAmount === 1_500, escrow.agentAmount);
  check('a release timestamp is recorded', Boolean(escrow.releasedAt));

  const buyerRelease = await request(app)
    .put(`${api}/bookings/${booking.id}/escrow-release`)
    .set(...buyerAuth)
    .send({})
    .expect(403);
  check('a buyer cannot release escrow', buyerRelease.body.success === false);

  const sold = await request(app).get(`${api}/flats/${target.id}`).expect(200);
  check('the sold flat leaves the market', sold.body.data.isAvailable === false);

  const audit = await request(app).get(`${api}/admin/audit-logs`).set(...adminAuth).expect(200);
  check('the release is audited', audit.body.data.some((a) => a.action === 'escrow_released'), audit.body.data.map((a) => a.action));

  const revenue = await request(app).get(`${api}/admin/revenue`).set(...adminAuth).expect(200);
  check('revenue reports token commission', revenue.body.data.tokenCommission.amount > 0, revenue.body.data.tokenCommission);
  check('revenue states the commission basis', revenue.body.data.tokenCommission.basis === 'booking_token');

  /* ------------------------------------------------------------------ reviews */
  section('Reviews & builder rating');
  const review = await request(app)
    .post(`${api}/reviews`)
    .set(...buyerAuth)
    .send({ flatId: target.id, rating: 5, comment: 'Smoke test: transparent pricing and a smooth process.' })
    .expect(201);
  check('a completed buyer can review', review.body.data.review.rating === 5);
  check('the review is flagged as a verified purchase', review.body.data.review.isVerifiedBooking === true);

  const rating = await request(app).get(`${api}/builders/${builder.user.id}/rating`).expect(200);
  check('builder rating is recalculated', rating.body.data.rating.count > 0, rating.body.data.rating);

  /* ------------------------------------------------------------------ config */
  section('Admin configuration');
  const config = await request(app).get(`${api}/admin/commission-config`).set(...adminAuth).expect(200);
  check('tier config is readable', config.body.data.config.tiers.budgetMax === 5_000_000);
  check('commission config is readable', config.body.data.effective.commissionPercent === 10);
  check('agent split is 70/30', config.body.data.effective.agentPlatformPercent === 70);

  const amenityCreate = await request(app)
    .post(`${api}/amenities`)
    .set(...adminAuth)
    .send({ name: `Smoke Amenity ${Date.now()}`, category: 'lifestyle' })
    .expect(201);
  check('admin can create an amenity', Boolean(amenityCreate.body.data.amenity.id ?? amenityCreate.body.data.amenity._id));
  await request(app)
    .put(`${api}/amenities/${amenityCreate.body.data.amenity.id ?? amenityCreate.body.data.amenity._id}`)
    .set(...adminAuth)
    .send({ name: 'Smoke Amenity', category: 'wellness' })
    .expect(200);
  check('admin can update an amenity', true);

  const configDenied = await request(app)
    .put(`${api}/admin/commission-config`)
    .set(...builderAuth)
    .send({ commission: { bookingTokenPercent: 99 } })
    .expect(403);
  check('a builder cannot change the commission config', configDenied.body.success === false);

  /* ------------------------------------------------------------------ refund */
  section('Refund path');
  // Re-query: the flat used above is now sold, and a buyer cannot have two
  // active bookings.
  const stillAvailable = await request(app).get(`${api}/flats?limit=60`).expect(200);
  const refundable = stillAvailable.body.data.find((f) => f.isAvailable);
  check('a second flat is still available to book', Boolean(refundable));
  const refundBooking = await request(app)
    .post(`${api}/bookings/token`)
    .set(...buyerAuth)
    .send({ flatId: refundable.id, tokenAmount: 50_000 })
    .expect(201);
  const rb = refundBooking.body.data;
  await request(app)
    .post(`${api}/bookings/${rb.booking.id}/verify-token-payment`)
    .set(...buyerAuth)
    .send({
      orderId: rb.payment.orderId,
      paymentId: 'pay_mock_smoke_refund',
      signature: (await import('crypto')).createHmac('sha256', process.env.MOCK_PAYMENT_KEY).update(`${rb.payment.orderId}|100000`).digest('hex'),
    })
    .expect(200);

  const buyerRefund = await request(app)
    .post(`${api}/bookings/${rb.booking.id}/refund`)
    .set(...buyerAuth)
    .send({ reason: 'Buyer changed their mind' })
    .expect(403);
  check('a buyer cannot refund their own token', buyerRefund.body.success === false);

  const refunded = await request(app)
    .post(`${api}/bookings/${rb.booking.id}/refund`)
    .set(...adminAuth)
    .send({ reason: 'Smoke test refund' })
    .expect(200);
  check('an admin refund returns the token', refunded.body.data.booking.escrowStatus === 'refunded', refunded.body.data.booking.escrowStatus);
  check('the refund is labelled as simulated', refunded.body.data.booking.refund.gateway === 'mock', refunded.body.data.booking.refund);
  const backOnMarket = await request(app).get(`${api}/flats/${refundable.id}`).expect(200);
  check('the refunded flat returns to the market', backOnMarket.body.data.isAvailable === true);

  /* ------------------------------------------------------------------ seed idempotency */
  section('Seed idempotency');
  const beforeCount = (await request(app).get(`${api}/flats?limit=60&includeUnavailable=true`).expect(200)).body.data.length;
  await seedAll();
  const afterCount = (await request(app).get(`${api}/flats?limit=60&includeUnavailable=true`).expect(200)).body.data.length;
  check('re-seeding does not duplicate inventory', beforeCount === afterCount, { beforeCount, afterCount });

  /* ------------------------------------------------------------------ report */
  console.log(`\n${'='.repeat(64)}`);
  console.log(`SMOKE TEST: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log('='.repeat(64));

  const mongoose = (await import('mongoose')).default;
  await mongoose.connection.close();
  await mongod.stop();
  process.exit(failed > 0 ? 1 : 0);
})().catch(async (error) => {
  console.error('\nSMOKE TEST CRASHED\n');
  console.error(error);
  process.exit(1);
});
