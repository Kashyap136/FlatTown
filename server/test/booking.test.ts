/**
 * The full funnel: inquiry → site visit → token booking → documents →
 * escrow release / refund, plus wishlist, reviews, requirements and loans.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Application } from 'express';

import { getHarness, startHarness, stopHarness } from './helpers/harness';
import {
  auth,
  createAdmin,
  createFlat,
  createProject,
  payToken,
  registerUser,
  verifyBuilder,
  type Account,
} from './helpers/fixtures';

let app: Application;
let api: string;
let builder: Account;
let admin: Account;
let projectId: string;
let flatId: string;

const tomorrow = (days = 3): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

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
  builder = await registerUser(app, 'builder', { companyName: 'Deshmukh Group' });
  await verifyBuilder(builder.id);
  projectId = (await createProject(app, builder)).id;
  await request(app)
    .put(`${api}/admin/approve-project/${projectId}`)
    .set(...auth(admin))
    .send({})
    .expect(200);
  flatId = (
    await createFlat(app, builder, projectId, {
      title: '2BHK Sky View',
      sizeSqft: 1000,
      pricePerSqft: 7000,
      tokenAmount: 50_000,
    })
  ).id;
});

const newBuyer = (): Promise<Account> => registerUser(app, 'buyer');

/** `GET /bookings/:id` nests the booking under `data.booking`. */
const fetchBooking = async (bookingId: string, account: Account): Promise<any> => {
  const res = await request(app).get(`${api}/bookings/${bookingId}`).set(...auth(account)).expect(200);
  return res.body.data.booking;
};

/** Runs a booking all the way to `builder_accepted`. */
const bookFlat = async (
  buyer: Account,
  overrides: Record<string, unknown> = {},
): Promise<{ bookingId: string; tokenAmount: number; agentId?: string }> => {
  const created = await request(app)
    .post(`${api}/bookings/token`)
    .set(...auth(buyer))
    .send({ flatId, tokenAmount: 50_000, ...overrides })
    .expect(201);
  const bookingId = created.body.data.booking.id as string;
  await payToken(app, buyer, bookingId);
  await request(app)
    .put(`${api}/bookings/${bookingId}/accept`)
    .set(...auth(builder))
    .send({})
    .expect(200);
  return {
    bookingId,
    tokenAmount: created.body.data.booking.tokenAmount as number,
    agentId: created.body.data.booking.agentId as string | undefined,
  };
};

describe('inquiry', () => {
  it('records an interest once per buyer and flat', async () => {
    const buyer = await newBuyer();
    const first = await request(app)
      .post(`${api}/flats/${flatId}/inquiry`)
      .set(...auth(buyer))
      .send({ message: 'Please call after 6pm', visitDate: tomorrow(4) })
      .expect(201);
    assert.equal(first.body.data.inquiry.status, 'new');

    await request(app)
      .post(`${api}/flats/${flatId}/inquiry`)
      .set(...auth(buyer))
      .send({ message: 'again' })
      .expect(201);

    const list = await request(app).get(`${api}/builders/me/inquiries`).set(...auth(builder)).expect(200);
    assert.equal(list.body.data.length, 1);

    const flat = await request(app).get(`${api}/flats/${flatId}`).expect(200);
    assert.ok(flat.body.data.inquiriesCount >= 1);
  });

  it('rejects an inquiry on an unavailable flat', async () => {
    await getHarness().models.Flat.updateOne({ _id: flatId }, { $set: { isAvailable: false } });
    const buyer = await newBuyer();
    const res = await request(app)
      .post(`${api}/flats/${flatId}/inquiry`)
      .set(...auth(buyer))
      .send({})
      .expect(400);
    assert.match(res.body.message, /no longer available/i);
  });

  it('will not let a builder raise an inquiry on their own listing', async () => {
    const res = await request(app)
      .post(`${api}/flats/${flatId}/inquiry`)
      .set(...auth(builder))
      .send({});
    assert.equal(res.status, 403);
  });
});

// The revenue report is keyed by `siteVisitRevenue`, and a charge is only
// recognised once it is actually paid.
const revenue = async (): Promise<any> =>
  (await request(app).get(`${api}/admin/revenue`).set(...auth(admin)).expect(200)).body.data;

describe('site visit flow', () => {
  /**
   * A flat whose builder charges for visits. `createFlat` leaves `visitCharge`
   * at 0, which is also the correct value for a fully free listing.
   */
  const chargedFlat = async (): Promise<string> =>
    (
      await createFlat(app, builder, projectId, {
        title: '3BHK Garden View',
        bhk: 3,
        sizeSqft: 1350,
        pricePerSqft: 7600,
        visitCharge: 199,
      })
    ).id;

  it('gives a verified builder two free visits, then charges', async () => {
    const paidFlatId = await chargedFlat();
    const buyer = await newBuyer();

    const first = await request(app)
      .post(`${api}/visits/request`)
      .set(...auth(buyer))
      .send({ flatId: paidFlatId, slot: { date: tomorrow(2), time: '10:00 AM' }, requirements: 'Need loan' })
      .expect(201);
    assert.equal(first.body.data.visit.visitCharge, 0);
    assert.equal(first.body.data.visit.paymentStatus, 'not_required');
    assert.equal(first.body.data.visit.status, 'requested');

    const second = await request(app)
      .post(`${api}/visits/request`)
      .set(...auth(buyer))
      .send({ flatId: paidFlatId, slot: { date: tomorrow(3), time: '11:00 AM' } })
      .expect(201);
    assert.equal(second.body.data.visit.visitCharge, 0, 'the first 2 verified visits are free');

    // Both must be confirmed/completed before the quota is consumed.
    for (const visit of [first.body.data.visit, second.body.data.visit]) {
      await request(app)
        .put(`${api}/visits/${visit.id}/status`)
        .set(...auth(builder))
        .send({ status: 'confirmed' })
        .expect(200);
    }

    const third = await request(app)
      .post(`${api}/visits/request`)
      .set(...auth(buyer))
      .send({ flatId: paidFlatId, slot: { date: tomorrow(4), time: '12:00 PM' } })
      .expect(201);
    assert.equal(third.body.data.visit.visitCharge, 199, 'the third visit is charged');
    assert.equal(third.body.data.visit.paymentStatus, 'pending');
    assert.ok(third.body.data.visit.payment.orderId, 'a payment order is created for the charge');

    // The charge goes to the platform, but only once it is actually paid.
    const report = await revenue();
    assert.equal(report.siteVisitRevenue.gross, 0, 'revenue is booked on payment, not on request');
    assert.equal(report.tokenCommission.amount, 0);
    assert.equal(report.tokenCommission.basis, 'booking_token');
  });

  it('refuses a duplicate slot and a past date', async () => {
    const buyer = await newBuyer();
    const slot = { date: tomorrow(5), time: '10:00 AM' };
    await request(app)
      .post(`${api}/visits/request`)
      .set(...auth(buyer))
      .send({ flatId, slot })
      .expect(201);

    const clash = await request(app)
      .post(`${api}/visits/request`)
      .set(...auth(buyer))
      .send({ flatId, slot })
      .expect(409);
    assert.match(clash.body.message, /just been booked/i);

    const past = await request(app)
      .post(`${api}/visits/request`)
      .set(...auth(buyer))
      .send({ flatId, slot: { date: new Date(Date.now() - 86_400_000).toISOString(), time: '10:00 AM' } })
      .expect(400);
    assert.match(past.body.message, /past/i);
  });

  it('will not let a builder visit their own listing', async () => {
    const res = await request(app)
      .post(`${api}/visits/request`)
      .set(...auth(builder))
      .send({ flatId, slot: { date: tomorrow(2), time: '10:00 AM' } });
    assert.equal(res.status, 403);
  });

  it('charges, confirms and completes a paid visit', async () => {
    const paidFlatId = await chargedFlat();
    // Exhaust the free quota for this RERA-verified builder.
    for (const time of ['10:00 AM', '11:00 AM']) {
      const buyer = await newBuyer();
      const visit = await request(app)
        .post(`${api}/visits/request`)
        .set(...auth(buyer))
        .send({ flatId: paidFlatId, slot: { date: tomorrow(2), time } })
        .expect(201);
      await request(app)
        .put(`${api}/visits/${visit.body.data.visit.id}/status`)
        .set(...auth(builder))
        .send({ status: 'confirmed' })
        .expect(200);
    }

    const buyer = await newBuyer();
    const charged = await request(app)
      .post(`${api}/visits/request`)
      .set(...auth(buyer))
      .send({ flatId: paidFlatId, slot: { date: tomorrow(3), time: '12:00 PM' } })
      .expect(201);
    const visitId = charged.body.data.visit.id as string;
    assert.equal(charged.body.data.visit.visitCharge, 199);
    assert.equal(charged.body.data.visit.paymentStatus, 'pending');

    // A paid visit cannot be confirmed before the charge settles.
    const premature = await request(app)
      .put(`${api}/visits/${visitId}/status`)
      .set(...auth(builder))
      .send({ status: 'confirmed' })
      .expect(400);
    assert.match(premature.body.message, /Complete the visit charge payment/i);

    // The client cannot simply declare the visit paid.
    const forged = await request(app)
      .post(`${api}/visits/${visitId}/pay`)
      .set(...auth(buyer))
      .send({ paymentId: 'pay_mock_visit_1', signature: 'short' })
      .expect(422);
    assert.equal(forged.body.success, false);

    const paid = await request(app)
      .post(`${api}/visits/${visitId}/pay`)
      .set(...auth(buyer))
      .send({ paymentId: 'pay_mock_visit_1', signature: 'b'.repeat(64) })
      .expect(200);
    assert.equal(paid.body.data.payment.status, 'paid');
    assert.equal(paid.body.data.payment.gateway, 'mock');
    assert.equal(paid.body.data.payment.simulated, true, 'simulated payments are labelled');
    assert.equal(paid.body.data.visit.status, 'confirmed', 'a paid visit is auto-confirmed');

    const done = await request(app)
      .put(`${api}/visits/${visitId}/status`)
      .set(...auth(builder))
      .send({ status: 'completed', notes: 'Buyer liked the view' })
      .expect(200);
    assert.equal(done.body.data.visit.status, 'completed');

    // Double payment is refused.
    const again = await request(app)
      .post(`${api}/visits/${visitId}/pay`)
      .set(...auth(buyer))
      .send({ paymentId: 'pay_mock_visit_2', signature: 'c'.repeat(64) })
      .expect(409);
    assert.match(again.body.message, /already been paid/i);

    // The completed visit is booked as platform revenue.
    const report = await revenue();
    assert.equal(report.siteVisitRevenue.gross, 199);
    assert.equal(report.siteVisitRevenue.paidVisits, 1);
  });

  it('lets a buyer cancel a requested visit', async () => {
    const buyer = await newBuyer();
    const visit = await request(app)
      .post(`${api}/visits/request`)
      .set(...auth(buyer))
      .send({ flatId, slot: { date: tomorrow(6), time: '10:00 AM' } })
      .expect(201);

    const res = await request(app)
      .put(`${api}/visits/${visit.body.data.visit.id}/status`)
      .set(...auth(buyer))
      .send({ status: 'cancelled', cancellationReason: 'Plans changed' })
      .expect(200);
    assert.equal(res.body.data.visit.status, 'cancelled');
  });
});

describe('token booking and commission (RULE 4)', () => {
  it('charges 10% of the token only, never of the property price', async () => {
    const buyer = await newBuyer();
    const res = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000 })
      .expect(201);

    const { booking, payment } = res.body.data;
    assert.equal(booking.totalPrice, 7_000_000, 'the ₹70L flat price is recorded');
    assert.equal(booking.tokenAmount, 50_000);
    assert.equal(booking.commissionPercent, 10);
    assert.equal(booking.commissionAmount, 5_000, '10% of ₹50,000 — not of ₹70L');
    assert.notEqual(booking.commissionAmount, Math.round(booking.totalPrice * 0.1));

    assert.equal(payment.commission.basis, 'booking_token');
    assert.equal(payment.commission.amount, 5_000);
    assert.equal(payment.gateway, 'mock');
    assert.equal(payment.simulated, true, 'a simulated payment is always labelled as such');
    assert.equal(booking.escrow.status, 'created');
  });

  it('ignores a client-supplied commission or escrow amount', async () => {
    const buyer = await newBuyer();
    const res = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000, commissionPercent: 90, commissionAmount: 999, escrowStatus: 'completed' })
      .expect(201);
    assert.equal(res.body.data.booking.commissionPercent, 10);
    assert.equal(res.body.data.booking.commissionAmount, 5_000);
    assert.equal(res.body.data.booking.escrowStatus, 'created');
  });

  it('refuses a token below the minimum and outside the allowed amounts', async () => {
    const buyer = await newBuyer();
    const tooSmall = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 500 })
      .expect(422);
    const issue = (tooSmall.body.errors as Array<{ field: string }>)[0];
    assert.equal(issue.field, 'tokenAmount');

    const res = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 77_777 })
      .expect(400);
    assert.match(res.body.message, /Token amount must be one of/);
  });

  it('never marks the token paid until the payment is verified', async () => {
    const buyer = await newBuyer();
    const created = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000 })
      .expect(201);
    const bookingId = created.body.data.booking.id as string;
    assert.equal(created.body.data.booking.escrowStatus, 'created');

    // An unverified attempt must not move the state.
    const unknownOrder = await request(app)
      .post(`${api}/bookings/${bookingId}/verify-token-payment`)
      .set(...auth(buyer))
      .send({
        orderId: 'order_live_not_ours',
        paymentId: 'pay_mock_x',
        signature: 'f'.repeat(64),
      })
      .expect(400);
    assert.match(unknownOrder.body.message, /Unknown payment order/i);

    // A malformed callback is rejected by validation before it reaches the gateway.
    const malformed = await request(app)
      .post(`${api}/bookings/${bookingId}/verify-token-payment`)
      .set(...auth(buyer))
      .send({ paymentId: 'pay_mock_x', signature: 'short' })
      .expect(422);
    assert.equal(malformed.body.success, false);

    // Claiming success without a verifiable payment never advances escrow.
    const stranger = await newBuyer();
    await request(app)
      .post(`${api}/bookings/${bookingId}/verify-token-payment`)
      .set(...auth(stranger))
      .send({ paymentId: 'pay_mock_x', signature: 'e'.repeat(64) })
      .expect(403);

    const stored = await getHarness().models.Booking.findById(bookingId).lean();
    assert.equal(stored!.escrowStatus, 'created', 'escrow state is server controlled');
    assert.equal(stored!.payment!.paymentId, undefined);
  });

  it('advances escrow to token_paid only after verification', async () => {
    const buyer = await newBuyer();
    const created = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000 })
      .expect(201);
    const bookingId = created.body.data.booking.id as string;
    await payToken(app, buyer, bookingId);

    const res = await fetchBooking(bookingId, buyer);
    assert.equal(res.escrowStatus, 'token_paid');
    assert.equal(res.escrow.heldAmount, 50_000);
    assert.equal(res.escrow.platformAmount, 5_000);
    assert.equal(res.escrow.builderAmount, 45_000);
  });

  it('blocks a second active booking by the same buyer', async () => {
    const buyer = await newBuyer();
    await request(app).post(`${api}/bookings/token`).set(...auth(buyer)).send({ flatId, tokenAmount: 50_000 }).expect(201);
    const second = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000 })
      .expect(409);
    assert.match(second.body.message, /already have an active booking/i);
  });

  it('will not let a builder accept before the token is paid', async () => {
    const buyer = await newBuyer();
    const created = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000 })
      .expect(201);
    const bookingId = created.body.data.booking.id as string;

    const early = await request(app)
      .put(`${api}/bookings/${bookingId}/accept`)
      .set(...auth(builder))
      .send({})
      .expect(400);
    assert.match(early.body.message, /token_paid/i);

    // A stranger builder cannot accept it either.
    await payToken(app, buyer, bookingId);
    const stranger = await registerUser(app, 'builder', { companyName: 'Rival Group' });
    await verifyBuilder(stranger.id);
    const res = await request(app)
      .put(`${api}/bookings/${bookingId}/accept`)
      .set(...auth(stranger))
      .send({})
      .expect(403);
    assert.equal(res.body.success, false);
  });
});

describe('agent commission split (RULE 4 — 70/30)', () => {
  it('splits the commission 70/30 when an agent is attached', async () => {
    const agent = await registerUser(app, 'agent');
    const buyer = await newBuyer();
    const res = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000, agentId: agent.id })
      .expect(201);

    const { booking, payment } = res.body.data;
    assert.equal(booking.agentId, agent.id);
    assert.equal(booking.commissionAmount, 5_000);
    assert.equal(payment.split.platformAmount, 3_500);
    assert.equal(payment.split.agentAmount, 1_500);
    assert.equal(payment.split.agentSharePercent, 30);
    assert.equal(booking.escrow.platformAmount, 3_500);
    assert.equal(booking.escrow.agentAmount, 1_500);
    assert.equal(booking.escrow.builderAmount, 45_000);
    assert.equal(
      booking.escrow.builderAmount + booking.escrow.platformAmount + booking.escrow.agentAmount,
      50_000,
      'the token is fully accounted for',
    );
  });

  it('gives the whole commission to the platform when no agent is involved', async () => {
    const buyer = await newBuyer();
    const res = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000 })
      .expect(201);
    assert.equal(res.body.data.booking.escrow.agentAmount, 0);
    assert.equal(res.body.data.booking.escrow.platformAmount, 5_000);
  });

  it('rejects an agent id that is not an agent', async () => {
    const buyer = await newBuyer();
    const res = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000, agentId: builder.id })
      .expect(400);
    assert.match(res.body.message, /does not exist/i);
  });
});

describe('escrow release (RULE 12)', () => {
  it('is admin-only', async () => {
    const buyer = await newBuyer();
    const { bookingId } = await bookFlat(buyer);

    for (const account of [buyer, builder]) {
      const res = await request(app)
        .put(`${api}/bookings/${bookingId}/escrow-release`)
        .set(...auth(account))
        .send({});
      assert.equal(res.status, 403, `${account.role} must not be able to release escrow`);
    }
  });

  it('is blocked until the required documents are verified', async () => {
    const buyer = await newBuyer();
    const { bookingId } = await bookFlat(buyer);

    const blocked = await request(app)
      .put(`${api}/bookings/${bookingId}/escrow-release`)
      .set(...auth(admin))
      .send({})
      .expect(400);
    assert.match(blocked.body.message, /documents not verified/i);

    for (const type of ['aadhaar', 'pan']) {
      await request(app)
        .post(`${api}/bookings/${bookingId}/documents`)
        .set(...auth(buyer))
        .attach('documents', Buffer.from(`%PDF-1.4 ${type} test document`), {
          filename: `${type}.pdf`,
          contentType: 'application/pdf',
        })
        .field('types', type)
        .expect(201);
    }

    const stillBlocked = await request(app)
      .put(`${api}/bookings/${bookingId}/escrow-release`)
      .set(...auth(admin))
      .send({})
      .expect(400);
    assert.match(stillBlocked.body.message, /documents not verified/i);
  });

  it('releases 90% to the builder, 10% to the platform and the agent share', async () => {
    const agent = await registerUser(app, 'agent');
    const buyer = await newBuyer();
    const { bookingId } = await bookFlat(buyer, { agentId: agent.id });

    // Upload and verify the mandatory documents.
    const types = ['aadhaar', 'pan'];
    for (let i = 0; i < types.length; i += 1) {
      await request(app)
        .post(`${api}/bookings/${bookingId}/documents`)
        .set(...auth(buyer))
        .attach('documents', Buffer.from(`%PDF-1.4 ${types[i]}`), {
          filename: `${types[i]}.pdf`,
          contentType: 'application/pdf',
        })
        .field('types', types[i])
        .expect(201);
    }
    const afterUpload = await fetchBooking(bookingId, admin);
    const docs = afterUpload.documents as Array<{ type: string }>;
    assert.equal(docs.length, 2);
    for (let i = 0; i < docs.length; i += 1) {
      await request(app)
        .put(`${api}/bookings/${bookingId}/documents/${i}/verify`)
        .set(...auth(builder))
        .send({ verified: true })
        .expect(200);
    }

    const released = await request(app)
      .put(`${api}/bookings/${bookingId}/escrow-release`)
      .set(...auth(admin))
      .send({ note: 'KYC and RERA verified' })
      .expect(200);

    const escrow = released.body.data.booking.escrow;
    assert.equal(released.body.data.booking.escrowStatus, 'completed');
    assert.equal(escrow.builderAmount, 45_000);
    assert.equal(escrow.platformAmount, 3_500);
    assert.equal(escrow.agentAmount, 1_500);
    assert.equal(escrow.releasedAmount, 45_000);
    assert.ok(escrow.releasedAt);

    // Releasing twice is refused.
    const again = await request(app)
      .put(`${api}/bookings/${bookingId}/escrow-release`)
      .set(...auth(admin))
      .send({})
      .expect(409);
    assert.match(again.body.message, /already been released/i);

    // The flat leaves the market.
    const flat = await getHarness().models.Flat.findById(flatId).lean();
    assert.equal(flat!.isAvailable, false);

    // Financial actions are audited.
    const audit = await request(app).get(`${api}/admin/audit-logs`).set(...auth(admin)).expect(200);
    const actions = (audit.body.data as Array<{ action: string }>).map((a) => a.action);
    assert.ok(actions.includes('escrow_released'));
  });

  it('refuses release when the builder KYC is not verified', async () => {
    const buyer = await newBuyer();
    const { bookingId } = await bookFlat(buyer);

    for (const type of ['aadhaar', 'pan']) {
      await request(app)
        .post(`${api}/bookings/${bookingId}/documents`)
        .set(...auth(buyer))
        .attach('documents', Buffer.from(`%PDF-1.4 ${type}`), {
          filename: `${type}.pdf`,
          contentType: 'application/pdf',
        })
        .field('types', type)
        .expect(201);
    }
    const listing = await fetchBooking(bookingId, admin);
    const docs = listing.documents as unknown[];
    for (let i = 0; i < docs.length; i += 1) {
      await request(app)
        .put(`${api}/bookings/${bookingId}/documents/${i}/verify`)
        .set(...auth(builder))
        .send({ verified: true })
        .expect(200);
    }

    const res = await request(app)
      .put(`${api}/bookings/${bookingId}/escrow-release`)
      .set(...auth(admin))
      .send({ builderKycVerified: false })
      .expect(400);
    assert.match(res.body.message, /KYC must be verified/i);
  });
});

describe('refund', () => {
  it('is admin-only', async () => {
    const buyer = await newBuyer();
    const { bookingId } = await bookFlat(buyer);
    for (const account of [buyer, builder]) {
      const res = await request(app)
        .post(`${api}/bookings/${bookingId}/refund`)
        .set(...auth(account))
        .send({ reason: 'Changed my mind' });
      assert.equal(res.status, 403, `${account.role} must not be able to refund a token`);
    }
  });

  it('refunds a paid booking and returns the flat to the market', async () => {
    const buyer = await newBuyer();
    const { bookingId } = await bookFlat(buyer);

    const res = await request(app)
      .post(`${api}/bookings/${bookingId}/refund`)
      .set(...auth(admin))
      .send({ reason: 'Buyer bought elsewhere' })
      .expect(200);

    assert.equal(res.body.data.booking.escrowStatus, 'refunded');
    assert.equal(res.body.data.booking.refund.gateway, 'mock');
    assert.equal(res.body.data.booking.refund.amount, 50_000);

    const flat = await getHarness().models.Flat.findById(flatId).lean();
    assert.equal(flat!.isAvailable, true, 'a refunded flat goes back on sale');

    // A refunded booking can never be released, and never double-refunded.
    const release = await request(app)
      .put(`${api}/bookings/${bookingId}/escrow-release`)
      .set(...auth(admin))
      .send({})
      .expect(400);
    assert.match(release.body.message, /refunded/i);

    const twice = await request(app)
      .post(`${api}/bookings/${bookingId}/refund`)
      .set(...auth(admin))
      .send({ reason: 'Again please' })
      .expect(409);
    assert.match(twice.body.message, /already been refunded/i);
  });

  it('will not refund a completed booking', async () => {
    const buyer = await newBuyer();
    const { bookingId } = await bookFlat(buyer);
    const types = ['aadhaar', 'pan'];
    for (const type of types) {
      await request(app)
        .post(`${api}/bookings/${bookingId}/documents`)
        .set(...auth(buyer))
        .attach('documents', Buffer.from(`%PDF-1.4 ${type}`), {
          filename: `${type}.pdf`,
          contentType: 'application/pdf',
        })
        .field('types', type)
        .expect(201);
    }
    const listing = await fetchBooking(bookingId, admin);
    const docs = listing.documents as unknown[];
    for (let i = 0; i < docs.length; i += 1) {
      await request(app)
        .put(`${api}/bookings/${bookingId}/documents/${i}/verify`)
        .set(...auth(builder))
        .send({ verified: true })
        .expect(200);
    }
    await request(app)
      .put(`${api}/bookings/${bookingId}/escrow-release`)
      .set(...auth(admin))
      .send({})
      .expect(200);

    const res = await request(app)
      .post(`${api}/bookings/${bookingId}/refund`)
      .set(...auth(admin))
      .send({ reason: 'Too late' })
      .expect(400);
    assert.match(res.body.message, /dispute centre/i);
  });

  it('will not refund an unpaid booking', async () => {
    const buyer = await newBuyer();
    const created = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000 })
      .expect(201);
    const res = await request(app)
      .post(`${api}/bookings/${created.body.data.booking.id}/refund`)
      .set(...auth(admin))
      .send({ reason: 'changed my mind' })
      .expect(400);
    assert.match(res.body.message, /No token was ever paid/i);
  });
});

describe('booking visibility', () => {
  it('scopes the list per role', async () => {
    const buyer = await newBuyer();
    await bookFlat(buyer);

    const asBuyer = await request(app).get(`${api}/bookings`).set(...auth(buyer)).expect(200);
    assert.equal(asBuyer.body.data.length, 1);
    assert.equal(asBuyer.body.meta.total, 1);

    const asBuilder = await request(app)
      .get(`${api}/bookings?scope=builder`)
      .set(...auth(builder))
      .expect(200);
    assert.equal(asBuilder.body.data.length, 1);

    const asAdmin = await request(app).get(`${api}/bookings?scope=all`).set(...auth(admin)).expect(200);
    assert.equal(asAdmin.body.data.length, 1);

    const stranger = await newBuyer();
    const asStranger = await request(app).get(`${api}/bookings`).set(...auth(stranger)).expect(200);
    assert.equal(asStranger.body.data.length, 0);

    // Only an admin may use the platform-wide scope.
    await request(app).get(`${api}/bookings?scope=all`).set(...auth(buyer)).expect(403);
  });

  it('never leaks another buyer’s booking', async () => {
    const buyer = await newBuyer();
    const { bookingId } = await bookFlat(buyer);
    const stranger = await newBuyer();
    const res = await request(app).get(`${api}/bookings/${bookingId}`).set(...auth(stranger)).expect(403);
    assert.equal(res.body.success, false);
  });

  it('never exposes a private document URL', async () => {
    const buyer = await newBuyer();
    const created = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000 })
      .expect(201);
    const bookingId = created.body.data.booking.id as string;
    await request(app)
      .post(`${api}/bookings/${bookingId}/documents`)
      .set(...auth(buyer))
      .attach('documents', Buffer.from('%PDF-1.4 aadhaar'), {
        filename: 'aadhaar.pdf',
        contentType: 'application/pdf',
      })
      .field('types', 'aadhaar')
      .expect(201);

    const res = await fetchBooking(bookingId, buyer);
    const docs = res.documents as Array<{ url?: string }>;
    assert.equal(docs.length, 1);
    assert.equal(docs[0].url, undefined, 'RULE 15: private documents are not exposed');
  });
});

describe('wishlist', () => {
  it('toggles, lists and reports wishlist state on the marketplace', async () => {
    const buyer = await newBuyer();

    const added = await request(app)
      .post(`${api}/wishlist/toggle/${flatId}`)
      .set(...auth(buyer))
      .expect(200);
    assert.equal(added.body.data.wishlisted, true);

    const list = await request(app).get(`${api}/wishlist/me`).set(...auth(buyer)).expect(200);
    assert.equal(list.body.data.length, 1);

    const search = await request(app).get(`${api}/flats`).set(...auth(buyer)).expect(200);
    assert.equal(search.body.data[0].isWishlisted, true);

    const removed = await request(app)
      .post(`${api}/wishlist/toggle/${flatId}`)
      .set(...auth(buyer))
      .expect(200);
    assert.equal(removed.body.data.wishlisted, false);
    const empty = await request(app).get(`${api}/wishlist/me`).set(...auth(buyer)).expect(200);
    assert.equal(empty.body.data.length, 0);
  });

  it('never duplicates an entry', async () => {
    const buyer = await newBuyer();
    await request(app).post(`${api}/wishlist/toggle/${flatId}`).set(...auth(buyer)).expect(200);
    await request(app).post(`${api}/wishlist/toggle/${flatId}`).set(...auth(buyer)).expect(200);
    await request(app).post(`${api}/wishlist/toggle/${flatId}`).set(...auth(buyer)).expect(200);
    const list = await request(app).get(`${api}/wishlist/me`).set(...auth(buyer)).expect(200);
    assert.equal(list.body.data.length, 1);
  });

  it('accepts the documented POST /wishlist/toggle shape with flatId in the body', async () => {
    // The API reference publishes `POST /wishlist/toggle`; the web client uses
    // `POST /wishlist/toggle/:id`. Both must work.
    const buyer = await newBuyer();

    const added = await request(app)
      .post(`${api}/wishlist/toggle`)
      .set(...auth(buyer))
      .send({ flatId })
      .expect(200);
    assert.equal(added.body.data.wishlisted, true);
    assert.equal(added.body.data.flatId, flatId);

    const list = await request(app).get(`${api}/wishlist/me`).set(...auth(buyer)).expect(200);
    assert.equal(list.body.data.length, 1);

    const removed = await request(app)
      .post(`${api}/wishlist/toggle`)
      .set(...auth(buyer))
      .send({ flatId })
      .expect(200);
    assert.equal(removed.body.data.wishlisted, false);
  });

  it('rejects a wishlist toggle with no flat id at all', async () => {
    const buyer = await newBuyer();
    const missing = await request(app).post(`${api}/wishlist/toggle`).set(...auth(buyer)).send({});
    assert.ok([400, 422].includes(missing.status), `expected 400/422, got ${missing.status}`);
    assert.equal(missing.body.success, false);
    assert.match(JSON.stringify(missing.body.errors ?? missing.body.message), /flat ?id|flatId/i);

    const malformed = await request(app)
      .post(`${api}/wishlist/toggle`)
      .set(...auth(buyer))
      .send({ flatId: 'not-an-object-id' });
    assert.ok([400, 422].includes(malformed.status), `expected 400/422, got ${malformed.status}`);
  });

  it('hides the wishlist from anonymous and non-buyer callers', async () => {
    await request(app).get(`${api}/wishlist/me`).expect(401);
    await request(app).get(`${api}/wishlist/me`).set(...auth(builder)).expect(403);
  });
});

describe('reviews and builder rating', () => {
  /** Drives a booking to `completed` so a review is allowed. */
  const completeBooking = async (buyer: Account): Promise<string> => {
    const { bookingId } = await bookFlat(buyer);
    const types = ['aadhaar', 'pan'];
    for (const type of types) {
      await request(app)
        .post(`${api}/bookings/${bookingId}/documents`)
        .set(...auth(buyer))
        .attach('documents', Buffer.from(`%PDF-1.4 ${type}`), {
          filename: `${type}.pdf`,
          contentType: 'application/pdf',
        })
        .field('types', type)
        .expect(201);
    }
    const listing = await fetchBooking(bookingId, admin);
    const docs = listing.documents as unknown[];
    for (let i = 0; i < docs.length; i += 1) {
      await request(app)
        .put(`${api}/bookings/${bookingId}/documents/${i}/verify`)
        .set(...auth(builder))
        .send({ verified: true })
        .expect(200);
    }
    await request(app)
      .put(`${api}/bookings/${bookingId}/escrow-release`)
      .set(...auth(admin))
      .send({})
      .expect(200);
    return bookingId;
  };

  it('refuses a review before a booking is completed', async () => {
    const buyer = await newBuyer();
    const res = await request(app)
      .post(`${api}/reviews`)
      .set(...auth(buyer))
      .send({ flatId, rating: 5, comment: 'Great transparency and pricing.' })
      .expect(403);
    assert.match(res.body.message, /completing a booking/i);
  });

  it('accepts one review per buyer per flat and updates the builder average', async () => {
    const first = await newBuyer();
    await completeBooking(first);
    const created = await request(app)
      .post(`${api}/reviews`)
      .set(...auth(first))
      .send({ flatId, rating: 5, comment: 'Transparent pricing and on-time updates.' })
      .expect(201);
    assert.equal(created.body.data.review.rating, 5);
    assert.equal(created.body.data.review.isVerifiedBooking, true);

    await request(app)
      .post(`${api}/reviews`)
      .set(...auth(first))
      .send({ flatId, rating: 1, comment: 'Duplicate attempt from the same buyer.' })
      .expect(409);

    // A second completed buyer on a second flat of the same builder.
    const otherFlat = (
      await createFlat(app, builder, projectId, { title: '3BHK Sky View', sizeSqft: 1400, pricePerSqft: 7500 })
    ).id;
    const originalFlat = flatId;
    flatId = otherFlat;
    try {
      const second = await newBuyer();
      await completeBooking(second);
      await request(app)
        .post(`${api}/reviews`)
        .set(...auth(second))
        .send({ flatId: otherFlat, rating: 4, comment: 'Good construction quality overall.' })
        .expect(201);
    } finally {
      flatId = originalFlat;
    }

    const rating = await request(app).get(`${api}/builders/${builder.id}/rating`).set(...auth(builder)).expect(200);
    assert.equal(rating.body.data.rating.avg, 4.5);
    assert.equal(rating.body.data.rating.count, 2);
  });

  it('rejects an out-of-range rating and a too-short comment', async () => {
    const buyer = await newBuyer();
    await completeBooking(buyer);

    const badRating = await request(app)
      .post(`${api}/reviews`)
      .set(...auth(buyer))
      .send({ flatId, rating: 9, comment: 'This rating is out of range entirely.' })
      .expect(422);
    assert.equal(badRating.body.success, false);

    const shortComment = await request(app)
      .post(`${api}/reviews`)
      .set(...auth(buyer))
      .send({ flatId, rating: 4, comment: 'ok' })
      .expect(422);
    assert.equal(shortComment.body.success, false);
  });

  it('lets an admin moderate a review', async () => {
    const buyer = await newBuyer();
    await completeBooking(buyer);
    const created = await request(app)
      .post(`${api}/reviews`)
      .set(...auth(buyer))
      .send({ flatId, rating: 2, comment: 'Delays on the possession date promised.' })
      .expect(201);

    // A builder cannot moderate their own reviews.
    await request(app)
      .put(`${api}/reviews/${created.body.data.review.id}/moderate`)
      .set(...auth(builder))
      .send({ action: 'hide' })
      .expect(403);

    const moderated = await request(app)
      .put(`${api}/reviews/${created.body.data.review.id}/moderate`)
      .set(...auth(admin))
      .send({ action: 'hide' })
      .expect(200);
    assert.equal(moderated.body.data.review.isPublished, false);

    const publicList = await request(app).get(`${api}/flats/${flatId}/reviews`).expect(200);
    assert.equal(publicList.body.data.reviews.length, 0, 'a hidden review is not public');
  });
});

describe('requirements and loan assistance', () => {
  it('matches a requirement against available flats', async () => {
    const buyer = await newBuyer();
    await request(app)
      .post(`${api}/requirements`)
      .set(...auth(buyer))
      .send({ bhk: 2, budgetMin: 5_000_000, budgetMax: 9_000_000, city: 'Pune', loanNeeded: true })
      .expect(201);

    const matches = await request(app).get(`${api}/requirements/matches`).set(...auth(buyer)).expect(200);
    assert.equal(matches.body.data.matches.length, 1);
    assert.equal(matches.body.data.matches[0].id, flatId);

    // A requirement outside the inventory returns nothing.
    await request(app)
      .post(`${api}/requirements`)
      .set(...auth(buyer))
      .send({ bhk: 4, budgetMin: 40_000_000, budgetMax: 90_000_000, city: 'Mumbai' })
      .expect(201);
    const none = await request(app).get(`${api}/requirements/matches`).set(...auth(buyer)).expect(200);
    assert.equal(none.body.data.matches.length, 0);
  });

  it('records a standalone loan application', async () => {
    const buyer = await newBuyer();
    const res = await request(app)
      .post(`${api}/loan/apply`)
      .set(...auth(buyer))
      .send({ flatId, employmentType: 'salaried', annualIncome: 1_500_000, loanAmount: 6_000_000 })
      .expect(201);
    assert.equal(res.body.data.application.status, 'applied');

    const mine = await request(app).get(`${api}/loan/application`).set(...auth(buyer)).expect(200);
    assert.equal(mine.body.data.length, 1);
  });

  it('rejects a loan application that is not a buyer', async () => {
    const res = await request(app)
      .post(`${api}/loan/apply`)
      .set(...auth(builder))
      .send({ flatId, employmentType: 'salaried', annualIncome: 1_500_000, loanAmount: 6_000_000 });
    assert.equal(res.status, 403);
  });

  it('marks the booking loan status when assistance is requested', async () => {
    const buyer = await newBuyer();
    const { bookingId } = await bookFlat(buyer, { loanAssistanceRequired: true });
    const res = await fetchBooking(bookingId, buyer);
    assert.equal(res.loanStatus, 'applied');
    assert.equal(res.loan.required, true);
  });
});