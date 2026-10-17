/**
 * Admin surface: verification queue, project approval, amenity master,
 * tier/commission configuration, escrow ledger, revenue and disputes.
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
let admin: Account;
let builder: Account;
let projectId: string;
let flatId: string;

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
  flatId = (await createFlat(app, builder, projectId, { sizeSqft: 1000, pricePerSqft: 7000 })).id;
});

describe('dashboard', () => {
  it('reports live counts from the database, not placeholders', async () => {
    const buyer = await registerUser(app, 'buyer');
    await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000 })
      .expect(201);

    const res = await request(app).get(`${api}/admin/dashboard`).set(...auth(admin)).expect(200);
    const data = res.body.data;

    assert.equal(data.users.builder, 1);
    assert.equal(data.users.buyer, 1);
    assert.equal(data.users.admin, 1);
    assert.equal(data.projects.approved, 1);
    assert.equal(data.projects.pending, 0);
    assert.equal(data.flats.total, 1);
    assert.equal(data.flats.available, 1);
    assert.equal(data.flats.byTier.mid, 1);
    assert.equal(data.bookings.created.count, 1);
    assert.equal(data.bookings.created.amount, 50_000);
    assert.equal(data.revenue.tokenCommission, 5_000, 'commission reflects the live booking');
    assert.equal(data.revenue.total, 5_000);
  });
});

describe('KYC verification (RULE 5)', () => {
  it('lists a builder with submitted documents and approves them', async () => {
    const applicant = await registerUser(app, 'builder', { companyName: 'Kulkarni Estates' });
    await getHarness().models.User.updateOne(
      { _id: applicant.id },
      {
        $set: {
          verificationRequestedAt: new Date(),
          kycDocs: [{ type: 'pan_card', url: '/uploads/pan.pdf', verified: false, uploadedAt: new Date() }],
        },
      },
    );

    const queue = await request(app).get(`${api}/admin/verification-queue?type=kyc`).set(...auth(admin)).expect(200);
    assert.equal(queue.body.data.kyc.length, 1);
    assert.equal(queue.body.meta.counts.kyc, 1);

    // A builder cannot verify themselves.
    const self = await request(app)
      .put(`${api}/admin/verify-kyc/${applicant.id}`)
      .set(...auth(applicant))
      .send({ approved: true });
    assert.equal(self.status, 403);

    const approved = await request(app)
      .put(`${api}/admin/verify-kyc/${applicant.id}`)
      .set(...auth(admin))
      .send({ approved: true })
      .expect(200);
    assert.equal(approved.body.data.builder.isAdminVerified, true);

    const drained = await request(app).get(`${api}/admin/verification-queue?type=kyc`).set(...auth(admin)).expect(200);
    assert.equal(drained.body.data.kyc.length, 0);
  });

  it('records a rejection reason', async () => {
    const applicant = await registerUser(app, 'builder', { companyName: 'Kulkarni Estates' });
    await getHarness().models.User.updateOne(
      { _id: applicant.id },
      { $set: { kycDocs: [{ type: 'pan_card', url: '/uploads/pan.pdf', verified: false, uploadedAt: new Date() }] } },
    );
    const res = await request(app)
      .put(`${api}/admin/verify-kyc/${applicant.id}`)
      .set(...auth(admin))
      .send({ approved: false, rejectionReason: 'Blurred PAN upload' })
      .expect(200);
    assert.equal(res.body.data.builder.isAdminVerified, false);
  });
});

describe('RERA verification (RULE 5/6)', () => {
  it('requires a RERA number before it can be reviewed', async () => {
    const applicant = await registerUser(app, 'builder', { companyName: 'No Rera Group' });
    const res = await request(app)
      .put(`${api}/admin/verify-rera/${applicant.id}`)
      .set(...auth(admin))
      .send({ approved: true })
      .expect(400);
    assert.match(res.body.message, /has not submitted a RERA number/i);
  });

  it('verifies the builder and every one of their projects at once', async () => {
    const applicant = await registerUser(app, 'builder', { companyName: 'Kulkarni Estates' });
    await verifyBuilder(applicant.id, false);
    const own = (await createProject(app, applicant, { projectName: 'Kulkarni Heights' })).id;

    const queue = await request(app).get(`${api}/admin/verification-queue?type=rera`).set(...auth(admin)).expect(200);
    assert.ok(queue.body.data.rera.some((b: { id: string }) => b.id === applicant.id));

    const res = await request(app)
      .put(`${api}/admin/verify-rera/${applicant.id}`)
      .set(...auth(admin))
      .send({ approved: true, registryReference: 'P52100012345' })
      .expect(200);
    assert.equal(res.body.data.builder.isRERAVerified, true);

    const project = await getHarness().models.Project.findById(own).lean();
    assert.equal(project!.isRERAVerified, true, 'projects inherit the RERA decision');
  });

  it('never allows a builder to self-verify', async () => {
    const applicant = await registerUser(app, 'builder');
    await verifyBuilder(applicant.id, false);
    for (const path of [`${api}/admin/verify-rera/${applicant.id}`, `${api}/admin/verify-kyc/${applicant.id}`]) {
      const res = await request(app).put(path).set(...auth(applicant)).send({ approved: true });
      assert.equal(res.status, 403);
    }
  });
});

describe('project approval', () => {
  it('keeps a project private until an admin approves it', async () => {
    const pending = (await createProject(app, builder, { projectName: 'Pending Towers' })).id;
    await createFlat(app, builder, pending, { title: 'Hidden flat' });

    const hidden = await request(app).get(`${api}/projects/${pending}`).expect(404);
    assert.equal(hidden.body.success, false);

    // The builder can still see their own project.
    const ownerView = await request(app).get(`${api}/projects/${pending}`).set(...auth(builder)).expect(200);
    assert.equal(ownerView.body.data.isApproved, false);

    await request(app).put(`${api}/admin/approve-project/${pending}`).set(...auth(admin)).send({}).expect(200);
    const publicView = await request(app).get(`${api}/projects/${pending}`).expect(200);
    assert.equal(publicView.body.data.isApproved, true);

    // A builder cannot approve their own project.
    const selfApprove = await request(app)
      .put(`${api}/admin/approve-project/${pending}`)
      .set(...auth(builder))
      .send({});
    assert.equal(selfApprove.status, 403);
  });

  it('records a rejection reason and unpublishes the project', async () => {
    const pending = (await createProject(app, builder, { projectName: 'Rejected Towers' })).id;
    await request(app).put(`${api}/admin/approve-project/${pending}`).set(...auth(admin)).send({}).expect(200);
    await request(app)
      .put(`${api}/admin/approve-project/${pending}`)
      .set(...auth(admin))
      .send({ approved: false, rejectionReason: 'RERA number does not match registry' })
      .expect(200);
    const project = await getHarness().models.Project.findById(pending).lean();
    assert.equal(project!.isApproved, false);
    assert.match(String(project!.rejectedReason), /RERA number/);
  });

  it('queues unapproved projects for review', async () => {
    await createProject(app, builder, { projectName: 'Second Pending Project' });
    const queue = await request(app)
      .get(`${api}/admin/verification-queue?type=project`)
      .set(...auth(admin))
      .expect(200);
    assert.equal(queue.body.data.projects.length, 1);
  });
});

describe('amenity master', () => {
  it('creates, updates and deactivates amenities', async () => {
    const created = await request(app)
      .post(`${api}/amenities`)
      .set(...auth(admin))
      .send({ name: 'Sky Lounge', category: 'lifestyle', icon: 'Lounge', description: 'Top-floor lounge' })
      .expect(201);
    const id = created.body.data.amenity.id ?? created.body.data.amenity._id;

    const updated = await request(app)
      .put(`${api}/amenities/${id}`)
      .set(...auth(admin))
      .send({ name: 'Sky Lounge', category: 'wellness', icon: 'Sparkles' })
      .expect(200);
    assert.equal(updated.body.data.amenity.category, 'wellness');

    const list = await request(app).get(`${api}/amenities`).expect(200);
    assert.ok(list.body.data.some((a: { name: string }) => a.name === 'Sky Lounge'));

    await request(app).delete(`${api}/amenities/${id}`).set(...auth(admin)).expect(200);
    const after = await request(app).get(`${api}/amenities`).expect(200);
    assert.ok(!after.body.data.some((a: { name: string }) => a.name === 'Sky Lounge'));
  });

  it('is admin-only for writes', async () => {
    await request(app)
      .post(`${api}/amenities`)
      .set(...auth(builder))
      .send({ name: 'Sneaky', category: 'lifestyle' })
      .expect(403);
    const admin = await createAdmin();
    const list = await request(app).get(`${api}/admin/amenities`).set(...auth(admin)).expect(200);
    assert.ok(Array.isArray(list.body.data));
  });

  it('rejects an unknown category', async () => {
    await request(app)
      .post(`${api}/amenities`)
      .set(...auth(admin))
      .send({ name: 'Bad Category', category: 'nonsense' })
      .expect(422);
  });
});

describe('platform configuration (RULE 13)', () => {
  it('exposes the effective pricing context', async () => {
    const res = await request(app).get(`${api}/admin/commission-config`).set(...auth(admin)).expect(200);
    assert.equal(res.body.data.config.tiers.budgetMax, 5_000_000);
    assert.equal(res.body.data.config.tiers.midMax, 15_000_000);
    assert.equal(res.body.data.effective.commissionPercent, 10);
    assert.equal(res.body.data.effective.agentPlatformPercent, 70);
    assert.equal(res.body.data.effective.agentPercent, 30);
  });

  it('is admin-only', async () => {
    await request(app).get(`${api}/admin/commission-config`).set(...auth(builder)).expect(403);
    await request(app)
      .put(`${api}/admin/commission-config`)
      .set(...auth(builder))
      .send({ commission: { bookingTokenPercent: 99 } })
      .expect(403);
  });

  it('rejects an inverted tier configuration', async () => {
    const res = await request(app)
      .put(`${api}/admin/commission-config`)
      .set(...auth(admin))
      .send({ tiers: { budgetMax: 20_000_000, midMax: 5_000_000 } })
      .expect(422);
    assert.equal(res.body.success, false);
  });

  it('recalculates existing tiers and applies new bands to new flats', async () => {
    // The existing ₹70L flat is "mid" under the default 50L / 1.5Cr bands.
    const before = await request(app).get(`${api}/flats/${flatId}`).expect(200);
    assert.equal(before.body.data.tier, 'mid');

    // Tighten the bands so ₹70L becomes luxury.
    await request(app)
      .put(`${api}/admin/commission-config`)
      .set(...auth(admin))
      .send({ tiers: { budgetMax: 6_000_000, midMax: 6_500_000 } })
      .expect(200);

    const after = await request(app).get(`${api}/flats/${flatId}`).expect(200);
    assert.equal(after.body.data.tier, 'luxury', 'existing listings are re-banded, not left stale');

    // A new flat uses the same bands.
    const fresh = await createFlat(app, builder, projectId, { title: 'After change', sizeSqft: 1000, pricePerSqft: 7000 });
    assert.equal(fresh.tier, 'luxury');

    // A flat that now sits inside the budget band.
    const cheap = await createFlat(app, builder, projectId, { title: 'Cheap now', sizeSqft: 600, pricePerSqft: 4000 });
    assert.equal(cheap.tier, 'budget');

    const cfg = await request(app).get(`${api}/admin/commission-config`).set(...auth(admin)).expect(200);
    assert.equal(cfg.body.data.config.tiers.budgetMax, 6_000_000);
    assert.equal(cfg.body.data.effective.thresholds.mid, 6_500_000);

    // The public tier config endpoint reflects the change.
    const tiers = await request(app).get(`${api}/tiers/config`).expect(200);
    assert.equal(tiers.body.data.thresholds.budget, 6_000_000);
    assert.equal(tiers.body.data.thresholds.mid, 6_500_000);

    // And the tier filter uses it too.
    const luxuryOnly = await request(app).get(`${api}/flats?tier=luxury`).expect(200);
    assert.equal(luxuryOnly.body.meta.total, 2);
    const budgetOnly = await request(app).get(`${api}/flats?tier=budget`).expect(200);
    assert.equal(budgetOnly.body.meta.total, 1);
  });

  it('changes the commission percentage and the agent split', async () => {
    await request(app)
      .put(`${api}/admin/commission-config`)
      .set(...auth(admin))
      .send({ commission: { bookingTokenPercent: 12, agentPlatformPercent: 60, agentAgentPercent: 40 } })
      .expect(200);

    const agent = await registerUser(app, 'agent');
    const buyer = await registerUser(app, 'buyer');
    const res = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000, agentId: agent.id })
      .expect(201);

    assert.equal(res.body.data.booking.commissionPercent, 12);
    assert.equal(res.body.data.booking.commissionAmount, 6_000);
    assert.equal(res.body.data.booking.escrow.platformAmount, 3_600, '60% of the commission');
    assert.equal(res.body.data.booking.escrow.agentAmount, 2_400, '40% of the commission');
    assert.equal(res.body.data.booking.escrow.builderAmount, 44_000);
    assert.equal(
      res.body.data.booking.escrow.builderAmount +
        res.body.data.booking.escrow.platformAmount +
        res.body.data.booking.escrow.agentAmount,
      50_000,
    );
  });

  it('configures the allowed token amounts', async () => {
    await request(app)
      .put(`${api}/admin/commission-config`)
      .set(...auth(admin))
      .send({ booking: { allowedTokenAmounts: [25_000, 75_000] } })
      .expect(200);

    const buyer = await registerUser(app, 'buyer');
    await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000 })
      .expect(400);

    const res = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 75_000 })
      .expect(201);
    assert.equal(res.body.data.booking.commissionAmount, 7_500);
  });

  it('rejects an empty configuration update', async () => {
    const res = await request(app)
      .put(`${api}/admin/commission-config`)
      .set(...auth(admin))
      .send({})
      .expect(422);
    assert.equal(res.body.success, false);
  });
});

describe('escrow ledger and revenue', () => {
  it('lists held, released and refunded tokens', async () => {
    const buyer = await registerUser(app, 'buyer');
    const created = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000 })
      .expect(201);
    const bookingId = created.body.data.booking.id as string;
    await payToken(app, buyer, bookingId);

    const ledger = await request(app).get(`${api}/admin/escrow`).set(...auth(admin)).expect(200);
    const row = ledger.body.data.find((b: { id: string }) => b.id === bookingId);
    assert.ok(row, 'the booking appears in the escrow ledger');
    assert.equal(row.escrowStatus, 'token_paid');
    assert.equal(row.tokenAmount, 50_000);
    assert.equal(row.commissionAmount, 5_000);
    assert.ok(row.buyer, 'the ledger resolves the buyer');
    assert.ok(row.builder, 'the ledger resolves the builder');

    const report = await request(app).get(`${api}/admin/revenue`).set(...auth(admin)).expect(200);
    assert.equal(report.body.data.tokenCommission.amount, 5_000);
    assert.equal(report.body.data.tokenCommission.tokensCollected, 50_000);
    assert.equal(report.body.data.tokenCommission.basis, 'booking_token');
    assert.equal(report.body.data.totalPlatformRevenue, 5_000);
    assert.equal(report.body.data.escrow.refunded, 0);
  });

  it('keeps the escrow ledger admin-only', async () => {
    await request(app).get(`${api}/admin/escrow`).set(...auth(builder)).expect(403);
    await request(app).get(`${api}/admin/revenue`).set(...auth(builder)).expect(403);
  });

  it('assigns a loan partner and updates the loan status', async () => {
    const buyer = await registerUser(app, 'buyer');
    const booking = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000, loanAssistanceRequired: true })
      .expect(201);
    const bookingId = booking.body.data.booking.id as string;
    await payToken(app, buyer, bookingId);

    const partner = await request(app)
      .post(`${api}/admin/loan-partners`)
      .set(...auth(admin))
      .send({ name: 'FlatTown Housing Finance', code: 'FTHF', contactEmail: 'desk@fthf.example' })
      .expect(201);
    const partnerId = partner.body.data.partner.id;

    const res = await request(app)
      .put(`${api}/bookings/${bookingId}/loan-status`)
      .set(...auth(admin))
      .send({ status: 'approved', partnerId, leadFeeAmount: 7_500 })
      .expect(200);
    assert.equal(res.body.data.booking.loanStatus, 'approved');
    assert.equal(String(res.body.data.booking.loan.partnerId), String(partnerId));
    assert.equal(res.body.data.booking.loan.leadFeeAmount, 7_500);

    // Only an admin may move a loan application forward.
    const denied = await request(app)
      .put(`${api}/bookings/${bookingId}/loan-status`)
      .set(...auth(buyer))
      .send({ status: 'approved' });
    assert.equal(denied.status, 403);
  });
});

describe('disputes', () => {
  it('lets a participant raise and an admin resolve a dispute', async () => {
    const buyer = await registerUser(app, 'buyer');
    const created = await request(app)
      .post(`${api}/disputes`)
      .set(...auth(buyer))
      .send({
        subject: 'Charged twice for the visit slot',
        description: 'I was charged the site visit fee two times for the same slot on the same day.',
        category: 'payment',
        flatId,
      })
      .expect(201);
    const id = created.body.data.dispute.id;

    const list = await request(app).get(`${api}/admin/disputes`).set(...auth(admin)).expect(200);
    assert.equal(list.body.data.length, 1);

    const resolved = await request(app)
      .put(`${api}/admin/disputes/${id}`)
      .set(...auth(admin))
      .send({ status: 'resolved', resolution: 'Refunded the duplicate charge' })
      .expect(200);
    assert.equal(resolved.body.data.dispute.status, 'resolved');

    await request(app).get(`${api}/admin/disputes`).set(...auth(buyer)).expect(403);
  });
});

describe('builder dashboard', () => {
  it('reports live views, inquiries, visits and bookings', async () => {
    const buyer = await registerUser(app, 'buyer');
    await request(app).get(`${api}/flats/${flatId}`).expect(200);
    await request(app).get(`${api}/flats/${flatId}`).expect(200);
    await request(app).post(`${api}/flats/${flatId}/inquiry`).set(...auth(buyer)).send({}).expect(201);
    await request(app)
      .post(`${api}/visits/request`)
      .set(...auth(buyer))
      .send({ flatId, slot: { date: new Date(Date.now() + 3 * 86_400_000).toISOString(), time: '10:00 AM' } })
      .expect(201);

    const res = await request(app).get(`${api}/builders/me/dashboard`).set(...auth(builder)).expect(200);
    assert.equal(res.body.data.stats.views, 2);
    assert.equal(res.body.data.stats.inquiries, 1);
    assert.equal(res.body.data.stats.visits, 1);
    assert.ok(res.body.data.projects.length >= 1);
  });

  it('is builder-only', async () => {
    await request(app).get(`${api}/builders/me/dashboard`).set(...auth(admin)).expect(403);
    await request(app).get(`${api}/builders/me/dashboard`).expect(401);
  });
});

describe('agent dashboard', () => {
  it('lists the flats an agent booked on behalf of a builder', async () => {
    const agent = await registerUser(app, 'agent');
    await getHarness().models.Flat.updateOne({ _id: flatId }, { $set: { agentId: agent.id } });

    // An agent has no builder dashboard of their own.
    await request(app).get(`${api}/builders/me/dashboard`).set(...auth(agent)).expect(403);

    const agentScope = await request(app).get(`${api}/bookings?scope=agent`).set(...auth(agent)).expect(200);
    assert.equal(agentScope.body.data.length, 0);

    const buyer = await registerUser(app, 'buyer');
    const booking = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId, tokenAmount: 50_000, agentId: agent.id })
      .expect(201);
    const scoped = await request(app).get(`${api}/bookings?scope=agent`).set(...auth(agent)).expect(200);
    assert.equal(scoped.body.data.length, 1);
    assert.equal(scoped.body.data[0].escrow.agentAmount, 1_500, 'the agent sees their own 30% share');
    assert.ok(booking.body.data.booking.escrowStatus);
  });

  it('keeps an agent out of the admin surface', async () => {
    const agent = await registerUser(app, 'agent');
    for (const path of [
      '/admin/dashboard',
      '/admin/escrow',
      '/admin/revenue',
      '/admin/verification-queue',
      '/admin/commission-config',
    ]) {
      const res = await request(app).get(`${api}${path}`).set(...auth(agent));
      assert.equal(res.status, 403, `agent must not reach ${path}`);
    }
  });
});