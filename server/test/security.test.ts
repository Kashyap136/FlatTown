/**
 * Regression tests for previously-exploitable financial and authorisation paths.
 *
 * Each test reproduces a defect that was fixed, so the behaviour cannot
 * silently regress:
 *
 *  - an agent stealing the platform commission via self-service profile update
 *  - the Razorpay webhook dividing amounts by 100 twice
 *  - escrow being released out of state order, twice, or without documents
 *  - a refund re-listing a flat that another live booking still holds
 *  - reviews inflating an unrelated builder's rating
 *  - buyers confirming their own site visit / writing builder-only notes
 *  - disguised (non-image/non-document) file uploads
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Application } from 'express';

import { getHarness, startHarness, stopHarness } from './helpers/harness';
import {
  addDays,
  auth,
  createAdmin,
  createAmenity,
  createFlat,
  createProject,
  payToken,
  registerUser,
  verifyBuilder,
  type Account,
} from './helpers/fixtures';

let app: Application;
let api: string;
let admin: Account;
let builder: Account;
let projectId: string;

before(async () => {
  const harness = await startHarness();
  app = harness.app;
  api = harness.api;
});

after(async () => {
  await stopHarness();
});

beforeEach(async () => {
  await getHarness().truncate();
  admin = await createAdmin();
  builder = await registerUser(app, 'builder', { companyName: 'Regression Group' });
  await verifyBuilder(builder.id);
  projectId = (await createProject(app, builder)).id;
  await request(app)
    .put(`${api}/admin/approve-project/${projectId}`)
    .set(...auth(admin))
    .send({})
    .expect(200);
});

/** Books a flat for `token` and settles the token payment. */
const bookAndPay = async (buyer: Account, flatId: string, token = 50_000): Promise<string> => {
  const created = await request(app)
    .post(`${api}/bookings/token`)
    .set(...auth(buyer))
    .send({ flatId, tokenAmount: token })
    .expect(201);
  const id = created.body.data.booking.id as string;
  await payToken(app, buyer, id);
  return id;
};

/** Drives a booking to the documented `docs_pending` stage ready for release. */
const advanceToDocsPending = async (bookingId: string): Promise<void> => {
  await request(app).put(`${api}/bookings/${bookingId}/accept`).set(...auth(builder)).send({}).expect(200);
  await getHarness().models.Booking.updateOne(
    { _id: bookingId },
    {
      $set: {
        escrowStatus: 'docs_pending',
        'escrow.status': 'docs_pending',
        documents: [
          { type: 'aadhaar', url: '/x.pdf', verified: true },
          { type: 'pan', url: '/y.pdf', verified: true },
        ],
      },
    },
  );
};

describe('commission integrity', () => {
  it('never persists a self-assigned agent commission share', async () => {
    const agent = await registerUser(app, 'agent');
    await request(app)
      .put(`${api}/auth/profile`)
      .set(...auth(agent))
      .send({ name: 'Renamed Agent', commissionSharePercent: 100 })
      .expect(200);

    const me = await request(app).get(`${api}/auth/me`).set(...auth(agent)).expect(200);
    assert.equal(
      me.body.data.user.commissionSharePercent ?? null,
      null,
      'commissionSharePercent must not be self-assignable',
    );
    assert.equal(me.body.data.user.isRERAVerified, false, 'role flags must not be self-assignable');
  });

  it('honours the configured split even when an agent record carries a stale override', async () => {
    const buyer = await registerUser(app, 'buyer');
    const agent = await registerUser(app, 'agent');
    const flat = await createFlat(app, builder, projectId, { tokenAmount: 50_000 });

    const bookingId = await bookAndPay(buyer, flat.id);
    // Attach the agent, then sneak a 100% share onto their document as if an
    // older code path had written it. `allowPerAgentOverride` defaults to false,
    // so the global 70/30 split must still apply.
    const { models } = getHarness();
    await models.User.updateOne({ _id: agent.id }, { $set: { commissionSharePercent: 100 } });
    await models.Booking.updateOne({ _id: bookingId }, { $set: { agentId: agent.id } });

    await advanceToDocsPending(bookingId);

    await request(app)
      .put(`${api}/bookings/${bookingId}/escrow-release`)
      .set(...auth(admin))
      .send({})
      .expect(200);

    const booking = await models.Booking.findById(bookingId).lean();
    assert.equal(booking!.commissionAmount, 5_000, '10% of a ₹50,000 token');
    assert.equal(booking!.escrow.platformAmount, 3_500, 'platform keeps the configured 70% of commission');
    assert.equal(booking!.escrow.agentAmount, 1_500, 'agent receives the configured 30% of commission');
    assert.equal(booking!.escrow.builderAmount, 45_000, 'builder receives 90% of the token');
  });

  it('lets an admin set a per-agent share and have it applied', async () => {
    const buyer = await registerUser(app, 'buyer');
    const agent = await registerUser(app, 'agent');
    const flat = await createFlat(app, builder, projectId, { tokenAmount: 50_000 });

    const bookingId = await bookAndPay(buyer, flat.id);
    const { models } = getHarness();
    await models.Booking.updateOne({ _id: bookingId }, { $set: { agentId: agent.id } });

    await request(app)
      .put(`${api}/admin/agents/${agent.id}/commission`)
      .set(...auth(admin))
      .send({ agentSharePercent: 50, enableOverride: true })
      .expect(200);

    await advanceToDocsPending(bookingId);
    await request(app)
      .put(`${api}/bookings/${bookingId}/escrow-release`)
      .set(...auth(admin))
      .send({})
      .expect(200);

    const booking = await models.Booking.findById(bookingId).lean();
    assert.equal(booking!.escrow.platformAmount, 2_500, 'platform takes 50% of the ₹5,000 commission');
    assert.equal(booking!.escrow.agentAmount, 2_500);
  });

  it('refuses an agent setting their own share through the admin route', async () => {
    const agent = await registerUser(app, 'agent');
    await request(app)
      .put(`${api}/admin/agents/${agent.id}/commission`)
      .set(...auth(agent))
      .send({ agentSharePercent: 100 })
      .expect(403);
  });
});

describe('escrow state machine', () => {
  it('refuses to release escrow before the builder has accepted', async () => {
    const buyer = await registerUser(app, 'buyer');
    const flat = await createFlat(app, builder, projectId, { tokenAmount: 50_000 });
    const bookingId = await bookAndPay(buyer, flat.id);

    // token_paid → completed would skip builder_accepted and docs_pending.
    await request(app)
      .put(`${api}/bookings/${bookingId}/escrow-release`)
      .set(...auth(admin))
      .send({})
      .expect(409);

    const booking = await getHarness().models.Booking.findById(bookingId).lean();
    assert.equal(booking!.escrowStatus, 'token_paid', 'escrow state must not advance');
    assert.equal(booking!.escrow.releasedAmount ?? 0, 0);
  });

  it('refuses to release escrow when required documents are unverified', async () => {
    const buyer = await registerUser(app, 'buyer');
    const flat = await createFlat(app, builder, projectId, { tokenAmount: 50_000 });
    const bookingId = await bookAndPay(buyer, flat.id);
    await request(app).put(`${api}/bookings/${bookingId}/accept`).set(...auth(builder)).send({}).expect(200);

    await request(app)
      .put(`${api}/bookings/${bookingId}/escrow-release`)
      .set(...auth(admin))
      .send({})
      .expect(400);
  });

  it('releases once and refuses a second release of the same escrow', async () => {
    const buyer = await registerUser(app, 'buyer');
    const flat = await createFlat(app, builder, projectId, { tokenAmount: 50_000 });
    const bookingId = await bookAndPay(buyer, flat.id);
    await advanceToDocsPending(bookingId);

    const { models } = getHarness();
    await request(app).put(`${api}/bookings/${bookingId}/escrow-release`).set(...auth(admin)).send({}).expect(200);
    await request(app).put(`${api}/bookings/${bookingId}/escrow-release`).set(...auth(admin)).send({}).expect(409);

    const booking = await models.Booking.findById(bookingId).lean();
    const releases = (booking!.ledger as Array<{ type: string }>).filter((e) => e.type === 'escrow_released');
    assert.equal(releases.length, 1, 'exactly one escrow_released ledger entry');
    assert.equal(booking!.escrowStatus, 'completed');
  });

  it('refuses to release a partially refunded escrow', async () => {
    const buyer = await registerUser(app, 'buyer');
    const flat = await createFlat(app, builder, projectId, { tokenAmount: 50_000 });
    const bookingId = await bookAndPay(buyer, flat.id);
    await request(app).put(`${api}/bookings/${bookingId}/accept`).set(...auth(builder)).send({}).expect(200);

    const { models } = getHarness();
    await models.Booking.updateOne(
      { _id: bookingId },
      {
        $set: {
          escrowStatus: 'docs_pending',
          'escrow.status': 'docs_pending',
          'escrow.refundedAmount': 20_000,
          documents: [
            { type: 'aadhaar', url: '/x.pdf', verified: true },
            { type: 'pan', url: '/y.pdf', verified: true },
          ],
        },
      },
    );

    await request(app)
      .put(`${api}/bookings/${bookingId}/escrow-release`)
      .set(...auth(admin))
      .send({})
      .expect(409);
  });
});

describe('token configuration', () => {
  it('defaults to the flat token and still enforces the admin allowlist', async () => {
    const buyer = await registerUser(app, 'buyer');
    await request(app)
      .put(`${api}/admin/commission-config`)
      .set(...auth(admin))
      .send({ booking: { allowedTokenAmounts: [50_000, 100_000] } })
      .expect(200);

    const flat = await createFlat(app, builder, projectId, { tokenAmount: 100_000 });

    // Omitting the token falls back to the flat's advertised amount.
    const defaulted = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId: flat.id })
      .expect(201);
    assert.equal(defaulted.body.data.booking.tokenAmount, 100_000, "the flat's token must be the default");

    // An amount outside the allowlist is still refused.
    const other = await createFlat(app, builder, projectId, { tokenAmount: 100_000 });
    await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId: other.id, tokenAmount: 25_000 })
      .expect(400);

    // An allowed alternative is accepted.
    await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId: other.id, tokenAmount: 50_000 })
      .expect(201);
  });
});

describe('refund safety', () => {
  it('does not re-list a flat that another live booking still holds', async () => {
    const buyerA = await registerUser(app, 'buyer');
    const buyerB = await registerUser(app, 'buyer');
    const flat = await createFlat(app, builder, projectId, { tokenAmount: 50_000 });

    const a = await bookAndPay(buyerA, flat.id);
    const b = await bookAndPay(buyerB, flat.id);
    assert.notEqual(a, b);

    const { models } = getHarness();
    // The flat has been sold: escrow was released for B, so it is off the market.
    await models.Flat.updateOne({ _id: flat.id }, { $set: { isAvailable: false } });

    // Refunding the older booking A must not put the sold flat back on sale.
    await request(app)
      .post(`${api}/bookings/${a}/refund`)
      .set(...auth(admin))
      .send({ reason: 'Buyer withdrew for an unrelated reason' })
      .expect(200);

    const doc = await models.Flat.findById(flat.id).lean();
    assert.equal(doc!.isAvailable, false, 'a sold flat must stay off the market after an unrelated refund');

    // Sanity: B's booking is untouched by A's refund.
    const bookingB = await models.Booking.findById(b).lean();
    assert.equal(bookingB!.escrowStatus, 'token_paid');
  });

  it('refuses a second refund of the same token', async () => {
    const buyer = await registerUser(app, 'buyer');
    const flat = await createFlat(app, builder, projectId, { tokenAmount: 50_000 });
    const bookingId = await bookAndPay(buyer, flat.id);

    await request(app)
      .post(`${api}/bookings/${bookingId}/refund`)
      .set(...auth(admin))
      .send({ reason: 'First refund issued by the platform' })
      .expect(200);
    await request(app)
      .post(`${api}/bookings/${bookingId}/refund`)
      .set(...auth(admin))
      .send({ reason: 'Attempting a duplicate refund here' })
      .expect(409);

    const booking = await getHarness().models.Booking.findById(bookingId).lean();
    assert.equal(booking!.escrow.refundedAmount, 50_000, 'refunded total must equal the token exactly');
  });

  it('re-lists the flat when it is genuinely free again', async () => {
    const buyer = await registerUser(app, 'buyer');
    const flat = await createFlat(app, builder, projectId, { tokenAmount: 50_000 });
    const bookingId = await bookAndPay(buyer, flat.id);

    await request(app)
      .post(`${api}/bookings/${bookingId}/refund`)
      .set(...auth(admin))
      .send({ reason: 'Full refund, flat returns to the market' })
      .expect(200);

    const doc = await getHarness().models.Flat.findById(flat.id).lean();
    assert.equal(doc!.isAvailable, true, 'a fully refunded flat returns to the market');
  });
});

describe('review authorisation', () => {
  it('refuses a review that points at a booking for a different flat', async () => {
    const buyer = await registerUser(app, 'buyer');
    const flatA = await createFlat(app, builder, projectId, { tokenAmount: 50_000 });
    const flatB = await createFlat(app, builder, projectId, { tokenAmount: 50_000 });

    const bookingId = await bookAndPay(buyer, flatA.id);
    await request(app).put(`${api}/bookings/${bookingId}/accept`).set(...auth(builder)).send({}).expect(200);

    const { models } = getHarness();
    await models.Booking.updateOne(
      { _id: bookingId },
      { $set: { escrowStatus: 'completed', 'escrow.status': 'completed' } },
    );

    // The completed booking is for flatA, but the review targets flatB.
    const res = await request(app)
      .post(`${api}/reviews`)
      .set(...auth(buyer))
      .send({ flatId: flatB.id, bookingId, rating: 1, comment: 'Trying to tank an unrelated listing.' })
      .expect(400);
    assert.match(res.body.message, /not for this flat/i);

    assert.equal(await models.Review.countDocuments({ buyerId: buyer.id, flatId: flatB.id }), 0);
  });

  it('refuses a review for a booking that is not yet completed', async () => {
    const buyer = await registerUser(app, 'buyer');
    const flat = await createFlat(app, builder, projectId, { tokenAmount: 50_000 });
    const bookingId = await bookAndPay(buyer, flat.id);

    const res = await request(app)
      .post(`${api}/reviews`)
      .set(...auth(buyer))
      .send({ flatId: flat.id, bookingId, rating: 1, comment: 'Too early to be reviewing this.' })
      .expect(403);
    assert.match(res.body.message, /completing a booking/i);
  });

  it('accepts a legitimate review from a completed booking', async () => {
    const buyer = await registerUser(app, 'buyer');
    const flat = await createFlat(app, builder, projectId, { tokenAmount: 50_000 });
    const bookingId = await bookAndPay(buyer, flat.id);
    await request(app).put(`${api}/bookings/${bookingId}/accept`).set(...auth(builder)).send({}).expect(200);

    const { models } = getHarness();
    await models.Booking.updateOne(
      { _id: bookingId },
      { $set: { escrowStatus: 'completed', 'escrow.status': 'completed' } },
    );

    await request(app)
      .post(`${api}/reviews`)
      .set(...auth(buyer))
      .send({ flatId: flat.id, bookingId, rating: 5, comment: 'On-time possession and clear pricing.' })
      .expect(201);

    const review = await models.Review.findOne({ flatId: flat.id }).lean();
    assert.equal(review!.isVerifiedBooking, true);
  });
});

describe('site visit authorisation', () => {
  it('does not let a buyer confirm their own visit or write builder notes', async () => {
    const buyer = await registerUser(app, 'buyer');
    const flat = await createFlat(app, builder, projectId, { visitCharge: 0 });

    const visit = await request(app)
      .post(`${api}/visits/request`)
      .set(...auth(buyer))
      .send({ flatId: flat.id, slot: { date: addDays(5).toISOString(), time: '10:00 AM - 12:00 PM' } })
      .expect(201);
    const visitId = visit.body.data.visit.id as string;

    await request(app)
      .put(`${api}/visits/${visitId}/status`)
      .set(...auth(buyer))
      .send({ status: 'confirmed' })
      .expect(403);

    await request(app)
      .put(`${api}/visits/${visitId}/status`)
      .set(...auth(builder))
      .send({ status: 'confirmed' })
      .expect(200);

    const { models } = getHarness();
    assert.equal((await models.SiteVisit.findById(visitId).lean())!.status, 'confirmed');

    // A buyer cancelling must not be able to write into builderNotes.
    await request(app)
      .put(`${api}/visits/${visitId}/status`)
      .set(...auth(buyer))
      .send({ status: 'cancelled', notes: 'injected by buyer' })
      .expect(200);
    assert.notEqual((await models.SiteVisit.findById(visitId).lean())!.builderNotes, 'injected by buyer');
  });
});

describe('upload hardening', () => {
  it('rejects an upload whose real content is disguised as an image', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');
    await request(app)
      .post(`${api}/projects/upload-files`)
      .set(...auth(builder))
      .field('kind', 'document')
      .attach('files', html, { filename: 'evil.png', contentType: 'image/png' })
      .expect(400);
  });

  it('rejects an HTML payload uploaded as an image', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');
    await request(app)
      .post(`${api}/projects/upload-files`)
      .set(...auth(builder))
      .attach('files', html, { filename: 'evil.png', contentType: 'image/png' })
      .expect(400);
  });

  it('accepts a genuine PDF document', async () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('% fake test pdf body')]);
    await request(app)
      .post(`${api}/projects/upload-files`)
      .set(...auth(builder))
      .field('kind', 'document')
      .attach('files', pdf, { filename: 'rera.pdf', contentType: 'application/pdf' })
      .expect(201);
  });

  it('never exposes a private document URL through the public builder API', async () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('% test')]);
    const upload = await request(app)
      .post(`${api}/projects/upload-files`)
      .set(...auth(builder))
      .field('kind', 'document')
      .attach('files', pdf, { filename: 'rera.pdf', contentType: 'application/pdf' })
      .expect(201);

    assert.ok(JSON.stringify(upload.body).includes('url'), 'the uploader receives the stored URL');

    const publicView = await request(app).get(`${api}/builders/${builder.id}/rating`).expect(200);
    assert.ok(
      !JSON.stringify(publicView.body).includes('/uploads/documents/'),
      'private document URLs must not leak publicly',
    );

    // The authenticated builder profile must hide document URLs too.
    const ownProfile = await request(app).get(`${api}/auth/me`).set(...auth(builder)).expect(200);
    assert.ok(
      !JSON.stringify(ownProfile.body).includes('/uploads/documents/'),
      'private document URLs must not leak through /auth/me either',
    );
  });
});

describe('response shape consistency', () => {
  /**
   * Collects the JSON paths of any raw Mongo `_id` still present in a payload.
   * Only a `_id` holding a real ObjectId counts — an aggregation grouping key
   * such as `{ _id: '2026-10' }` is a bucket, not a document id, and is
   * intentionally preserved by the response boundary.
   */
  const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
  const findRawIds = (value: unknown, path = '$', out: string[] = []): string[] => {
    if (Array.isArray(value)) {
      value.forEach((v) => findRawIds(v, `${path}[]`, out));
    } else if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>;
      if (typeof v._id === 'string' && OBJECT_ID.test(v._id)) out.push(path);
      for (const [k, val] of Object.entries(v)) findRawIds(val, `${path}.${k}`, out);
    }
    return out;
  };

  it('never exposes a raw Mongo _id on the public API surface', async () => {
    // The amenity master used to return `_id` while every other resource
    // returned `id`. The marketplace amenity filter reads `amenity.id`, so it
    // silently sent `undefined` and the filter could never match anything.
    const gym = await createAmenity('Gym', 'wellness');
    const pool = await createAmenity('Swimming Pool', 'lifestyle');
    await getHarness().models.Project.updateOne({ _id: projectId }, { $set: { amenities: [gym, pool] } });
    const flat = await createFlat(app, builder, projectId, { amenities: [gym, pool], tokenAmount: 50_000 });

    const probes: Array<[string, string | undefined]> = [
      ['/amenities', undefined],
      ['/tiers/config', undefined],
      ['/cities', undefined],
      ['/flats?limit=5', undefined],
      ['/flats/compare?ids=' + flat.id, undefined],
      ['/projects?limit=5', undefined],
      ['/projects/' + projectId, undefined],
      ['/flats/' + flat.id, undefined],
      ['/builders/top-rated?city=Pune', undefined],
      ['/reviews', undefined],
      ['/admin/amenities', admin.accessToken],
    ];

    for (const [path, token] of probes) {
      const req = request(app).get(`${api}${path}`);
      if (token) req.set(...auth({ accessToken: token } as Account));
      const res = await req.expect(200).catch((err: { message?: string }) => {
        assert.fail(`${path} was not readable (${err.message})`);
      });
      const leaks = findRawIds(res.body.data);
      assert.deepEqual(leaks, [], `${path} leaked raw _id at: ${[...new Set(leaks)].join(', ')}`);
    }
  });

  it('exposes amenity `id` so the marketplace filter can build its query', async () => {
    const gym = await createAmenity('Gym', 'wellness');
    await getHarness().models.Project.updateOne({ _id: projectId }, { $set: { amenities: [gym] } });
    const flat = await createFlat(app, builder, projectId, { amenities: [gym], tokenAmount: 50_000 });

    const res = await request(app).get(`${api}/amenities`).expect(200);
    const amenities = res.body.data as Array<Record<string, unknown>>;
    assert.ok(amenities.length >= 1, `${amenities.length} amenities`);
    for (const a of amenities) {
      assert.equal(typeof a.id, 'string', `amenity ${String(a.name)} must expose a string id`);
      assert.equal(a._id, undefined, 'raw _id must not be exposed');
    }

    // The id the API advertises must actually work as a filter value, and must
    // come back as a real ObjectId string — not "undefined".
    const filtered = await request(app).get(`${api}/flats?amenities=${amenities[0].id}&limit=5`).expect(200);
    assert.ok(filtered.body.data.some((f: { id: string }) => f.id === flat.id));
  });

  it('nests GET /bookings/:id under `booking` like every other booking endpoint', async () => {
    const buyer = await registerUser(app, 'buyer');
    const flat = await createFlat(app, builder, projectId, { tokenAmount: 50_000 });
    const bookingId = await bookAndPay(buyer, flat.id);
    const res = await request(app).get(`${api}/bookings/${bookingId}`).set(...auth(buyer)).expect(200);
    assert.ok(res.body.data.booking, 'expected data.booking');
    assert.equal(res.body.data.booking.id, bookingId);
  });
});

describe('webhook amount arithmetic', () => {
  it('treats fetchPayment amounts as rupees, matching the booking token exactly', async () => {
    const buyer = await registerUser(app, 'buyer');
    const flat = await createFlat(app, builder, projectId, { tokenAmount: 50_000 });
    const bookingId = await bookAndPay(buyer, flat.id);

    const { models } = getHarness();
    const booking = await models.Booking.findById(bookingId).lean();
    const held = (booking as any).payment.amount as number;

    // fetchPayment() divides the paise value by 100 exactly once and returns
    // rupees. Dividing again is what previously made the webhook dead code.
    assert.equal(held, 50_000, 'the recorded captured amount is the full token in rupees');
    assert.equal(Math.round(held), (booking as any).tokenAmount);
    assert.notEqual(Math.round(held / 100), (booking as any).tokenAmount);
  });
});