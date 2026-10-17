/**
 * Public discovery: tier classification, the full filter matrix, sorting,
 * pagination, RERA priority ranking, amenities `$all` semantics and compare.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Application } from 'express';

import { getHarness, startHarness, stopHarness } from './helpers/harness';
import {
  auth,
  createAdmin,
  createAmenity,
  createFlat,
  createProject,
  registerUser,
  verifyBuilder,
  type Account,
} from './helpers/fixtures';

let app: Application;
let api: string;
let builder: Account;
let admin: Account;
let projectId: string;

const list = async (query = ''): Promise<any> => {
  const res = await request(app).get(`${api}/flats${query}`).expect(200);
  return res.body;
};
/** `GET /flats` returns the page of items as `data`, with counts in `meta`. */
const items = (body: any): any[] => body.data as any[];
const ids = (body: any): string[] => items(body).map((f) => f.id);

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
  const project = await createProject(app, builder);
  projectId = project.id;
  await request(app)
    .put(`${api}/admin/approve-project/${projectId}`)
    .set(...auth(admin))
    .send({})
    .expect(200);
});

describe('tier auto-calculation (RULE 1)', () => {
  it('derives totalPrice and tier server-side, ignoring client-supplied values', async () => {
    const res = await request(app)
      .post(`${api}/flats`)
      .set(...auth(builder))
      .send({
        projectId,
        title: 'Client-tries-to-override',
        bhk: 3,
        type: 'apartment',
        sizeSqft: 1000,
        pricePerSqft: 7000,
        floorRise: 0,
        parkingCharges: 0,
        floor: 2,
        amenities: [],
        possessionDate: new Date(Date.now() + 200 * 86_400_000).toISOString(),
        // Both are recomputed server-side and must be ignored.
        totalPrice: 1,
        tier: 'luxury',
        images: [],
      })
      .expect(201);

    const flat = res.body.data.flat;
    assert.equal(flat.totalPrice, 7_000_000);
    assert.equal(flat.tier, 'mid');
    assert.equal(flat.priceBreakdown.baseTotal, 7_000_000);
    assert.equal(flat.priceBreakdown.tier, 'mid');
  });

  it('classifies budget, mid and luxury bands', async () => {
    const budget = await createFlat(app, builder, projectId, {
      title: 'Budget flat',
      sizeSqft: 800,
      pricePerSqft: 4000,
    });
    const mid = await createFlat(app, builder, projectId, {
      title: 'Mid flat',
      sizeSqft: 1000,
      pricePerSqft: 7000,
    });
    const luxury = await createFlat(app, builder, projectId, {
      title: 'Luxury flat',
      sizeSqft: 3000,
      pricePerSqft: 14000,
    });

    assert.deepEqual(
      [budget.totalPrice, mid.totalPrice, luxury.totalPrice],
      [3_200_000, 7_000_000, 42_000_000],
    );
    assert.deepEqual([budget.tier, mid.tier, luxury.tier], ['budget', 'mid', 'luxury']);
  });

  it('includes floorRise and parkingCharges in the total', async () => {
    const flat = await createFlat(app, builder, projectId, {
      sizeSqft: 455,
      pricePerSqft: 4900,
      floorRise: 90_000,
      parkingCharges: 150_000,
    });
    assert.equal(flat.totalPrice, 2_469_500);
  });

  it('reports the commission basis as the booking token, never the price', async () => {
    const flat = await createFlat(app, builder, projectId, { sizeSqft: 3000, pricePerSqft: 14000 });
    const res = await request(app).get(`${api}/flats/${flat.id}`).expect(200);
    assert.equal(res.body.data.commission.basis, 'booking_token');
    assert.equal(res.body.data.commission.percent, 10);
    assert.equal(res.body.data.commission.amountOnDefaultToken, 5_000);
    assert.notEqual(
      res.body.data.commission.amountOnDefaultToken,
      Math.round((flat.totalPrice * 10) / 100),
      'commission is not a percentage of the property price',
    );
  });
});

describe('filter matrix', () => {
  let pool: Record<string, string>;

  beforeEach(async () => {
    const swimming = await createAmenity('Swimming pool', 'wellness');
    const gym = await createAmenity('Gym', 'wellness');
    const parking = await createAmenity('Covered parking', 'parking');

    pool = {
      budget2: (
        await createFlat(app, builder, projectId, {
          title: 'Pune 2BHK budget',
          bhk: 2,
          sizeSqft: 700,
          pricePerSqft: 4000,
          floor: 3,
          possessionDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          amenities: [parking],
        })
      ).id,
      mid2: (
        await createFlat(app, builder, projectId, {
          title: 'Pune 2BHK mid',
          bhk: 2,
          sizeSqft: 1100,
          pricePerSqft: 7000,
          floor: 7,
          possessionDate: new Date(Date.now() + 400 * 86_400_000).toISOString(),
          amenities: [gym, parking],
        })
      ).id,
      mid3: (
        await createFlat(app, builder, projectId, {
          title: 'Pune 3BHK mid',
          bhk: 3,
          sizeSqft: 1500,
          pricePerSqft: 7500,
          floor: 11,
          possessionDate: new Date(Date.now() + 500 * 86_400_000).toISOString(),
          amenities: [swimming, gym, parking],
        })
      ).id,
      luxury4: (
        await createFlat(app, builder, projectId, {
          title: 'Pune 4BHK luxury',
          bhk: 4,
          type: 'penthouse',
          sizeSqft: 3200,
          pricePerSqft: 16000,
          floor: 22,
          possessionDate: new Date(Date.now() - 10 * 86_400_000).toISOString(),
          amenities: [swimming, gym, parking],
        })
      ).id,
    };
  });

  it('returns everything available by default', async () => {
    const body = await list();
    assert.equal(body.meta.total, 4);
    assert.deepEqual(ids(body).sort(), Object.values(pool).sort());
  });

  it('filters by BHK', async () => {
    const body = await list('?bhk=3');
    assert.deepEqual(ids(body), [pool.mid3]);
  });

  it('filters by multiple BHK values', async () => {
    const body = await list('?bhk=3,4');
    assert.deepEqual(ids(body).sort(), [pool.mid3, pool.luxury4].sort());
  });

  it('filters by tier', async () => {
    assert.deepEqual(ids(await list('?tier=budget')), [pool.budget2]);
    assert.deepEqual(ids(await list('?tier=mid')).sort(), [pool.mid2, pool.mid3].sort());
    assert.deepEqual(ids(await list('?tier=luxury')), [pool.luxury4]);
  });

  it('filters by city and locality', async () => {
    const hit = await list('?city=Pune');
    assert.equal(hit.meta.total, 4);

    const locality = await list('?locality=Koregaon Park');
    assert.equal(locality.meta.total, 4);

    const miss = await list('?city=Mumbai');
    assert.equal(miss.meta.total, 0);
    assert.deepEqual(items(miss), []);
  });

  it('filters by a price range', async () => {
    // 700x4,000 = 28L (below), 1,100x7,000 = 77L, 1,500x7,500 = 112.5L,
    // 3,200x16,000 = 512L (above the 450L ceiling).
    const body = await list('?priceMin=5000000&priceMax=45000000');
    assert.deepEqual(ids(body).sort(), [pool.mid2, pool.mid3].sort());
  });

  it('filters by possession status using the readiness rule (RULE 8)', async () => {
    // Only the luxury flat has a possession date in the past.
    const ready = await list('?possession=ready_to_move');
    assert.deepEqual(ids(ready), [pool.luxury4]);

    const upcoming = await list('?possession=under_construction');
    assert.deepEqual(ids(upcoming).sort(), [pool.budget2, pool.mid2, pool.mid3].sort());
  });

  it('keeps the three possession states distinct instead of collapsing them', async () => {
    // Regression: `new_launch` and `under_construction` both used to map to a
    // bare `possessionDate > today`, so they were indistinguishable from each
    // other and `ready_to_move,under_construction` matched every flat.
    // A second project that is explicitly a NEW launch.
    const launchProject = await createProject(app, builder, { status: 'new_launch', slug: `launch-${Date.now()}` });
    await request(app)
      .put(`${api}/admin/approve-project/${launchProject.id}`)
      .set(...auth(admin))
      .send({})
      .expect(200);
    const launchFlat = await createFlat(app, builder, launchProject.id, {
      possessionDate: new Date(Date.now() + 120 * 86_400_000).toISOString(),
      pricePerSqft: 7000,
      sizeSqft: 1000,
    });

    const underConstruction = await list('?possession=under_construction');
    assert.ok(!ids(underConstruction).includes(launchFlat.id), 'a new launch is not under construction');

    const newLaunch = await list('?possession=new_launch');
    assert.ok(ids(newLaunch).includes(launchFlat.id), 'a new launch matches new_launch');

    // Combining ready_to_move with a future state must not match everything.
    const combined = await list('?possession=ready_to_move,under_construction');
    const combinedIds = ids(combined);
    const total = await list();
    assert.ok(!combinedIds.includes(launchFlat.id), 'a new launch is not under construction');
    assert.ok(
      combinedIds.length < total.meta.total,
      'combining states must not degenerate into "every flat"',
    );
  });

  it('matches amenities with $all semantics', async () => {
    const { models } = getHarness();
    const swimming = await models.Amenity.findOne({ name: 'Swimming pool' }).lean();
    const gym = await models.Amenity.findOne({ name: 'Gym' }).lean();

    // 3BHK and 4BHK carry both amenities; 2BHK mid has the gym only.
    const both = await list(`?amenities=${swimming!._id},${gym!._id}`);
    assert.deepEqual(ids(both).sort(), [pool.mid3, pool.luxury4].sort());

    // A single amenity is an `$in` on top of `$all` semantics.
    const gymOnly = await list(`?amenities=${gym!._id}`);
    assert.deepEqual(ids(gymOnly).sort(), [pool.mid2, pool.mid3, pool.luxury4].sort());

    // An amenity nobody has returns nothing rather than everything.
    const none = await list('?amenities=507f1f77bcf86cd799439011');
    assert.equal(none.meta.total, 0);
  });

  it('filters by flat type and facing', async () => {
    assert.deepEqual(ids(await list('?type=penthouse')), [pool.luxury4]);
    assert.equal((await list('?type=apartment')).meta.total, 3);
  });

  it('excludes sold-out flats unless explicitly requested', async () => {
    await getHarness().models.Flat.updateOne({ _id: pool.mid2 }, { $set: { isAvailable: false } });

    const defaultView = await list();
    assert.equal(defaultView.meta.total, 3);
    assert.ok(!ids(defaultView).includes(pool.mid2));

    const withUnavailable = await list('?includeUnavailable=true');
    assert.equal(withUnavailable.meta.total, 4);
    assert.ok(ids(withUnavailable).includes(pool.mid2));
  });

  it('combines filters conjunctively', async () => {
    const body = await list('?city=Pune&bhk=2,3&tier=mid&priceMax=8000000&possession=under_construction');
    assert.deepEqual(ids(body), [pool.mid2]);

    const none = await list('?city=Pune&tier=budget&bhk=4');
    assert.equal(none.meta.total, 0);
  });

  it('paginates with a stable total and page metadata', async () => {
    const page1 = await list('?sortBy=price:asc&page=1&limit=2');
    const page2 = await list('?sortBy=price:asc&page=2&limit=2');

    assert.equal(page1.meta.total, 4);
    assert.equal(page1.meta.totalPages, 2);
    assert.equal(page1.meta.hasNext, true);
    assert.equal(page1.meta.hasPrev, false);
    assert.equal(page2.meta.hasNext, false);
    assert.equal(page2.meta.hasPrev, true);

    const combined = [...ids(page1), ...ids(page2)];
    assert.equal(new Set(combined).size, 4, 'pages do not overlap');
  });

  it('rejects an out-of-range page size and a bogus sort key', async () => {
    await request(app).get(`${api}/flats?limit=500`).expect(422);
    await request(app).get(`${api}/flats?sortBy=cheapest`).expect(422);
  });
});

describe('sorting', () => {
  beforeEach(async () => {
    await createFlat(app, builder, projectId, { title: 'A mid', sizeSqft: 1000, pricePerSqft: 7000 });
    await createFlat(app, builder, projectId, { title: 'B budget', sizeSqft: 600, pricePerSqft: 4000 });
    await createFlat(app, builder, projectId, { title: 'C luxury', sizeSqft: 3000, pricePerSqft: 15000 });
  });

  it('sorts by ascending and descending price', async () => {
    const asc = ids(await list('?sortBy=price:asc'));
    const desc = ids(await list('?sortBy=price:desc'));
    assert.equal(desc[0], asc[asc.length - 1], 'descending is the reverse of ascending');
  });

  it('sorts by price per square foot and by possession date', async () => {
    const perSqft = ids(await list('?sortBy=pricePerSqft:asc'));
    assert.equal(perSqft.length, 3);

    const soonest = await list('?sortBy=possessionDate:asc');
    assert.equal(soonest.meta.total, 3);
  });

  it('sorts newest first', async () => {
    const body = await list('?sortBy=newest');
    assert.equal(items(body)[0].title, 'C luxury');
  });
});

describe('RERA priority ranking (RULE 6)', () => {
  /**
   * A second builder with a published, approved project.
   *
   * A builder can only publish inventory while RERA-verified, so a listing that
   * is *later* found to be unverified is the realistic production case: the
   * admin revokes the registration after the inventory is already live.
   */
  const secondBuilderProject = async (): Promise<{ account: Account; projectId: string }> => {
    const account = await registerUser(app, 'builder', { companyName: 'Kulkarni Estates' });
    await verifyBuilder(account.id, true);
    const project = await createProject(app, account, { projectName: 'Revoked Towers' });
    await request(app)
      .put(`${api}/admin/approve-project/${project.id}`)
      .set(...auth(admin))
      .send({})
      .expect(200);
    return { account, projectId: project.id };
  };

  const revokeRera = async (builderId: string): Promise<void> => {
    await request(app)
      .put(`${api}/admin/verify-rera/${builderId}`)
      .set(...auth(admin))
      .send({ approved: false, reason: 'Registration lapsed' })
      .expect(200);
  };

  it('blocks a builder from publishing inventory before RERA verification', async () => {
    const pending = await registerUser(app, 'builder', { companyName: 'Pending Group' });
    await verifyBuilder(pending.id, false);
    const project = await createProject(app, pending);
    await request(app)
      .put(`${api}/admin/approve-project/${project.id}`)
      .set(...auth(admin))
      .send({})
      .expect(200);

    const res = await request(app)
      .post(`${api}/flats`)
      .set(...auth(pending))
      .send({
        projectId: project.id,
        title: 'Blocked flat',
        bhk: 2,
        sizeSqft: 900,
        pricePerSqft: 5000,
        floor: 1,
        amenities: [],
        possessionDate: new Date(Date.now() + 120 * 86_400_000).toISOString(),
        images: [],
      });
    assert.equal(res.status, 403);
    assert.match(res.body.message, /RERA verification/i);
  });

  it('puts RERA-verified listings ahead of unverified ones on the default sort', async () => {
    const { account: other, projectId: otherProjectId } = await secondBuilderProject();

    // Publish the flat, then let the admin pull the RERA registration. This is
    // the cheaper listing, so only the verification boost can win the ranking.
    const cheapUnverified = await createFlat(app, other, otherProjectId, {
      title: 'Cheap but unverified',
      sizeSqft: 500,
      pricePerSqft: 3000,
    });
    const priceyVerified = await createFlat(app, builder, projectId, {
      title: 'Pricey but verified',
      sizeSqft: 3000,
      pricePerSqft: 16000,
    });

    assert.equal(
      ids(await list('?sortBy=price:asc'))[0],
      cheapUnverified.id,
      'price alone would rank the unverified flat first',
    );

    await revokeRera(other.id);

    const relevance = ids(await list('?sortBy=relevance'));
    assert.equal(relevance[0], priceyVerified.id, 'verified project leads after revocation');
    assert.equal(
      ids(await list('?sortBy=price:asc'))[0],
      cheapUnverified.id,
      'the price sort is unaffected by verification',
    );
  });

  it('filters on reraVerified', async () => {
    const { account: other, projectId: otherProjectId } = await secondBuilderProject();
    await createFlat(app, other, otherProjectId, { title: 'Unverified flat' });
    await createFlat(app, builder, projectId, { title: 'Verified flat' });
    await revokeRera(other.id);

    const verified = await list('?reraVerified=true');
    assert.equal(verified.meta.total, 1);
    assert.equal(items(verified)[0].title, 'Verified flat');

    const unverified = await list('?reraVerified=false');
    assert.equal(unverified.meta.total, 1);
    assert.equal(items(unverified)[0].title, 'Unverified flat');
  });

  it('lets a builder set the RERA number but never self-verify it', async () => {
    const other = await registerUser(app, 'builder');
    const own = await createProject(app, other);

    const res = await request(app)
      .get(`${api}/projects/${own.id}`)
      .set(...auth(other))
      .expect(200);
    assert.equal(res.body.data.isRERAVerified, false);
    assert.ok(res.body.data.reraNumber, 'the number is stored as submitted');

    // A builder hitting the admin verification route is refused.
    const attempt = await request(app)
      .put(`${api}/admin/verify-rera/${other.id}`)
      .set(...auth(other))
      .send({ approved: true });
    assert.equal(attempt.status, 403);
  });

  it('marks a project unverified when the admin revokes its RERA registration', async () => {
    const account = await registerUser(app, 'builder', { companyName: 'Lapsing Group' });
    await verifyBuilder(account.id, true);
    const project = await createProject(app, account, { projectName: 'Lapsing Towers' });
    await request(app)
      .put(`${api}/admin/approve-project/${project.id}`)
      .set(...auth(admin))
      .send({})
      .expect(200);

    const flat = await createFlat(app, account, project.id, { title: 'Lapsing flat' });
    const before = await request(app)
      .get(`${api}/projects/${project.id}`)
      .set(...auth(admin))
      .expect(200);
    assert.equal(before.body.data.isRERAVerified, true);

    await revokeRera(account.id);

    const after = await request(app)
      .get(`${api}/projects/${project.id}`)
      .set(...auth(admin))
      .expect(200);
    assert.equal(after.body.data.isRERAVerified, false);

    // Revocation demotes rather than hides: the listing stays reachable and can
    // still be bought, it just loses its ranking boost.
    assert.ok(ids(await list()).includes(flat.id));
    assert.equal(ids(await list('?reraVerified=false')).includes(flat.id), true);
  });
});

describe('compare (max 3)', () => {
  it('returns the requested flats side by side', async () => {
    const a = await createFlat(app, builder, projectId, { title: 'Compare A' });
    const b = await createFlat(app, builder, projectId, { title: 'Compare B' });
    const c = await createFlat(app, builder, projectId, { title: 'Compare C' });

    const res = await request(app)
      .get(`${api}/flats/compare?ids=${a.id},${b.id},${c.id}`)
      .expect(200);
    assert.equal(res.body.data.items.length, 3);
    assert.equal(res.body.data.maxCompare, 3);
    assert.deepEqual(
      res.body.data.items.map((f: { title: string }) => f.title),
      ['Compare A', 'Compare B', 'Compare C'],
      'results keep the requested order',
    );
  });

  it('refuses more than three flats', async () => {
    const flats = [];
    for (let i = 0; i < 4; i += 1) flats.push(await createFlat(app, builder, projectId, { title: `Extra ${i}` }));
    const res = await request(app)
      .get(`${api}/flats/compare?ids=${flats.map((f) => f.id).join(',')}`)
      .expect(422);
    assert.match(res.body.message, /Validation failed/);
    const issue = (res.body.errors as Array<{ field: string; message: string }>)[0];
    assert.match(issue.message, /up to 3 flats/i);
  });

  it('ignores unknown ids rather than failing the whole comparison', async () => {
    const a = await createFlat(app, builder, projectId, { title: 'Known flat' });
    const res = await request(app)
      .get(`${api}/flats/compare?ids=${a.id},507f1f77bcf86cd799439011`)
      .expect(200);
    assert.equal(res.body.data.items.length, 1);
  });
});

describe('caching headers', () => {
  it('advertises the cache namespace on the discovery response', async () => {
    const res = await request(app).get(`${api}/flats`).expect(200);
    // Redis is disabled in tests, so every response is a MISS — but the header
    // must still be present so a client can reason about freshness.
    assert.equal(res.headers['x-flattown-cache'], 'MISS');
  });
});

describe('builder catalogue', () => {
  it('only lists approved projects publicly', async () => {
    const pending = await createProject(app, builder, { projectName: 'Pending Project' });
    await createFlat(app, builder, pending.id, { title: 'Pending flat' });

    const beforeApproval = await request(app).get(`${api}/projects`).expect(200);
    const slugs = (beforeApproval.body.data as Array<{ slug: string }>).map((p) => p.slug);
    assert.ok(!slugs.includes(pending.slug), 'an unapproved project is not public');

    await request(app)
      .put(`${api}/admin/approve-project/${pending.id}`)
      .set(...auth(admin))
      .send({})
      .expect(200);

    const after = await request(app).get(`${api}/projects`).expect(200);
    const afterSlugs = (after.body.data as Array<{ slug: string }>).map((p) => p.slug);
    assert.ok(afterSlugs.includes(pending.slug));
  });

  it('refuses to add flats to another builder’s project', async () => {
    const intruder = await registerUser(app, 'builder');
    await verifyBuilder(intruder.id);
    const res = await request(app)
      .post(`${api}/flats`)
      .set(...auth(intruder))
      .send({
        projectId,
        title: 'Trespasser',
        bhk: 2,
        sizeSqft: 900,
        pricePerSqft: 5000,
        floor: 1,
        amenities: [],
        possessionDate: new Date(Date.now() + 120 * 86_400_000).toISOString(),
        images: [],
      });
    assert.equal(res.status, 403);
  });

describe('public pricing configuration', () => {
  /**
   * The marketplace advertises its token amounts to anonymous visitors and the
   * booking wizard offers them verbatim. If this payload ever loses
   * `booking.allowedTokenAmounts`, the wizard silently falls back to hardcoded
   * defaults and can offer a token the server rejects — so pin the shape.
   */
  it('exposes the token amounts, visit charges and commission basis', async () => {
    const res = await request(app).get(`${api}/tiers/config`).expect(200);
    const { data } = res.body;

    assert.equal(data.thresholds.budget, 5_000_000);
    assert.equal(data.thresholds.mid, 15_000_000);
    assert.equal(data.tiers.budget.label, 'Budget');
    assert.equal(data.tiers.mid.label, 'Mid');
    assert.equal(data.tiers.luxury.label, 'Luxury');

    assert.equal(data.commission.percent, 10);
    assert.equal(data.commission.basis, 'booking_token');

    assert.ok(Array.isArray(data.booking.allowedTokenAmounts));
    assert.ok(data.booking.allowedTokenAmounts.length > 0);
    assert.ok(data.booking.allowedTokenAmounts.includes(data.booking.defaultTokenAmount));

    assert.ok(Array.isArray(data.visits.allowedCharges));
    assert.equal(typeof data.visits.freeVisitsForVerifiedBuilders, 'number');
    assert.equal(data.visits.refundableOnBooking, true);
  });

  it('tracks an admin change to the allowed token amounts', async () => {
    const before = (await request(app).get(`${api}/tiers/config`).expect(200)).body.data.booking
      .allowedTokenAmounts as number[];

    await request(app)
      .put(`${api}/admin/commission-config`)
      .set(...auth(admin))
      .send({ booking: { defaultTokenAmount: 75_000, allowedTokenAmounts: [75_000, 150_000] } })
      .expect(200);

    const advertised = (await request(app).get(`${api}/tiers/config`).expect(200)).body.data
      .booking.allowedTokenAmounts as number[];
    assert.deepEqual(advertised, [75_000, 150_000]);

    // The booking validator must accept exactly what the public config offers.
    const buyer = await registerUser(app, 'buyer');
    const allowed = await createFlat(app, builder, projectId, { title: 'Advertised token flat' });
    const notAdvertised = await createFlat(app, builder, projectId, { title: 'Unadvertised token flat' });

    const accepted = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId: allowed.id, tokenAmount: 150_000 });
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body));

    // ...and reject an amount that is no longer advertised.
    const rejected = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(buyer))
      .send({ flatId: notAdvertised.id, tokenAmount: 200_000 });
    assert.equal(rejected.status, 400);
    assert.match(rejected.body.message, /Token amount must be one of/);

    await request(app)
      .put(`${api}/admin/commission-config`)
      .set(...auth(admin))
      .send({ booking: { defaultTokenAmount: 50_000, allowedTokenAmounts: before } })
      .expect(200);
  });
});
});