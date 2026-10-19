/**
 * Full API suite against a REAL Redis + in-memory MongoDB.
 *
 * The standard harness deliberately disables Redis (`REDIS_URL: ''`) so tests
 * stay hermetic and fast. This suite flips that on so the cache layer is
 * genuinely exercised: real SET/GET/DEL/SCAN against a real server, the
 * HIT/MISS header on `GET /flats`, and invalidation after mutations.
 *
 * Usage: node --test --import tsx --test-concurrency=1 test/redis.cache.test.ts
 *   (expects REDIS_URL to point at a running server)
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Application } from 'express';
import type { Model } from 'mongoose';

// REDIS_URL must be set BEFORE any application module is imported, because
// `src/config/env.ts` snapshots process.env at import time.
const REDIS_URL = process.env.REDIS_URL ?? '';
if (!REDIS_URL) {
  throw new Error('REDIS_URL must be set to run the Redis cache suite');
}

let app: Application;
let api: string;
let models: Record<string, Model<any>>;
let mongod: MongoMemoryServer;

const PASSWORD = 'FlatTown@123';
let counter = 0;
const uniq = () => `${Date.now().toString(36)}${(counter += 1)}`;

interface Account {
  id: string;
  accessToken: string;
}
const auth = (a: Account): [string, string] => ['Authorization', `Bearer ${a.accessToken}`];

const redisClient = async () => {
  const { createClient } = await import('redis');
  const c = createClient({ url: REDIS_URL });
  await c.connect();
  return c;
};

before(async () => {
  process.env.JWT_SECRET = 'redis-suite-access-secret';
  process.env.JWT_REFRESH_SECRET = 'redis-suite-refresh-secret';
  process.env.RAZORPAY_KEY = '';
  process.env.RAZORPAY_SECRET = '';
  process.env.RAZORPAY_WEBHOOK_SECRET = '';
  process.env.CLOUDINARY_URL = '';
  process.env.SMTP_HOST = '';
  process.env.ALLOW_MOCK_PAYMENTS = 'true';
  process.env.LOG_LEVEL = 'error';
  process.env.FRONTEND_URL = 'http://localhost:3000';
  // This is the whole point of the suite: cache ON.
  process.env.REDIS_URL = REDIS_URL;

  // Same generous timeout as the main harness — see test/helpers/harness.ts.
  mongod = await MongoMemoryServer.create({ timeout: 120_000 });
  process.env.MONGO_URI = mongod.getUri('flattown_redis');

  const { connectDatabase } = await import('../src/config/db');
  const { loadPlatformConfig } = await import('../src/services/platformConfig.service');
  const { initRedis } = await import('../src/config/redis');
  const { createApp } = await import('../src/app');

  await connectDatabase();
  await loadPlatformConfig();
  await initRedis();

  const [{ User }, { Project }, { Flat }, { Amenity }, { Booking }, { SiteVisit }, { Review }, { Wishlist },
    { Requirement }, { Inquiry }, { PlatformConfig }, { AuditLog }, { Notification }] = await Promise.all([
    import('../src/models/User'),
    import('../src/models/Project'),
    import('../src/models/Flat'),
    import('../src/models/Amenity'),
    import('../src/models/Booking'),
    import('../src/models/SiteVisit'),
    import('../src/models/Review'),
    import('../src/models/Wishlist'),
    import('../src/models/Requirement'),
    import('../src/models/Inquiry'),
    import('../src/models/PlatformConfig'),
    import('../src/models/AuditLog'),
    import('../src/models/Notification'),
  ]);
  models = { User, Project, Flat, Amenity, Booking, SiteVisit, Review, Wishlist, Requirement, Inquiry, PlatformConfig, AuditLog, Notification };

  const { env } = await import('../src/config/env');
  app = createApp();
  api = env.apiPrefix;
});

after(async () => {
  const mongoose = (await import('mongoose')).default;
  if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  const { disconnectRedis } = await import('../src/config/redis');
  await disconnectRedis();
  await mongod.stop();
});

beforeEach(async () => {
  // Truncation removes the cached admin too, so drop the memoised account.
  admin = undefined as unknown as Account;
  await Promise.all(Object.values(models).map((m) => m.deleteMany({})));
  const { loadPlatformConfig } = await import('../src/services/platformConfig.service');
  await models.PlatformConfig.deleteMany({});
  await loadPlatformConfig();
  const r = await redisClient();
  await r.flushAll();
  await r.quit();
});

const register = async (role: 'buyer' | 'builder' | 'agent'): Promise<Account> => {
  const res = await request(app)
    .post(`${api}/auth/register`)
    .send({ name: `${role} redis`, email: `${role}.redis.${uniq()}@ft.test`, phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`, password: PASSWORD, role })
    .expect(201);
  return { id: res.body.data.user.id, accessToken: res.body.data.accessToken };
};

const addDays = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

/** Creates an admin-approved project, failing loudly with the API message. */
const createProject = async (builder: Account, overrides: Record<string, unknown> = {}) => {
  const res = await request(app)
    .post(`${api}/projects`)
    .set(...auth(builder))
    .send({
      projectName: `Redis Project ${uniq()}`, slug: `redis-${uniq()}`, city: 'Pune', locality: 'Wakad',
      fullAddress: 'Redis suite address', reraNumber: `P521${uniq()}`,
      possessionDate: addDays(240).toISOString(), status: 'under_construction',
      geo: { lat: 18.5, lng: 73.8 }, amenities: [], images: [], ...overrides,
    });
  assert.equal(res.status, 201, `project create failed: ${res.status} ${JSON.stringify(res.body)}`);
  const id = res.body.data.project.id as string;
  await request(app).put(`${api}/admin/approve-project/${id}`).set(...auth(await makeAdmin())).send({}).expect(200);
  return id;
};

/** Creates a flat on a project, failing loudly with the API message. */
const createFlatOn = async (builder: Account, projectId: string, overrides: Record<string, unknown> = {}) => {
  const res = await request(app)
    .post(`${api}/flats`)
    .set(...auth(builder))
    .send({
      projectId, title: `Redis Flat ${uniq()}`, bhk: 2, sizeSqft: 1000, pricePerSqft: 7000,
      floor: 4, possessionDate: addDays(240).toISOString(), amenities: [], images: [], ...overrides,
    });
  assert.equal(res.status, 201, `flat create failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.flat.id as string;
};

/** Provisions a builder that has been through admin KYC verification. */
const verifiedBuilder = async () => {
  const b = await register('builder');
  await models.User.updateOne({ _id: b.id }, { $set: { isAdminVerified: true, kycStatus: 'approved', isRERAVerified: true } });
  return b;
};

describe('Redis cache (real server)', () => {
  it('connects to the real server', async () => {
    const { isCacheAvailable, cacheStatus } = await import('../src/config/redis');
    assert.equal(isCacheAvailable(), true, `cache not available: ${JSON.stringify(cacheStatus())}`);
    const r = await redisClient();
    await r.set('flattown:probe', 'pong', { EX: 30 });
    assert.equal(await r.get('flattown:probe'), 'pong');
    await r.quit();
  });

  it('caches GET /flats and serves a HIT on the second call', async () => {
    const builder = await verifiedBuilder();
    const projectId = await createProject(builder);
    await createFlatOn(builder, projectId, { bhk: 2, pricePerSqft: 7000 });

    const first = await request(app).get(`${api}/flats?city=Pune`).expect(200);
    assert.equal(first.headers['x-flattown-cache'], 'MISS', 'first call must be a MISS');
    assert.ok(first.body.data.length >= 1);

    const second = await request(app).get(`${api}/flats?city=Pune`).expect(200);
    assert.equal(second.headers['x-flattown-cache'], 'HIT', 'second call must be a HIT');
    assert.equal(second.body.data.length, first.body.data.length);

    // The entry really is in Redis, with the 5-minute TTL the spec requires.
    const r = await redisClient();
    const keys = await r.keys('flattown:flats:*');
    assert.ok(keys.length > 0, 'expected a discovery cache key in Redis');
    const ttl = await r.ttl(keys[0]);
    assert.ok(ttl > 0 && ttl <= 300, `expected a TTL of 0-300s, got ${ttl}`);
    await r.quit();
  });

  it('scopes the discovery cache per viewer so isWishlisted cannot leak', async () => {
    const buyerA = await register('buyer');
    const buyerB = await register('buyer');
    const builder = await verifiedBuilder();
    const projectId = await createProject(builder, { locality: 'Baner', status: 'new_launch' });
    const flatId = await createFlatOn(builder, projectId, { bhk: 3, sizeSqft: 1400, pricePerSqft: 8000 });

    await request(app).post(`${api}/wishlist/toggle`).set(...auth(buyerA)).send({ flatId }).expect(200);

    // A's response is cached for A.
    const aFirst = await request(app).get(`${api}/flats`).set(...auth(buyerA)).expect(200);
    const aItem = aFirst.body.data.find((f: { id: string }) => f.id === flatId);
    assert.equal(aItem.isWishlisted, true, 'buyer A sees their own wishlist flag');

    // B must NOT receive A's flag from the cache.
    const bFirst = await request(app).get(`${api}/flats`).set(...auth(buyerB)).expect(200);
    const bItem = bFirst.body.data.find((f: { id: string }) => f.id === flatId);
    assert.equal(bItem.isWishlisted, false, 'buyer B must not inherit buyer A wishlist state');
  });

  it('invalidates discovery cache when a flat changes', async () => {
    const builder = await verifiedBuilder();
    const projectId = await createProject(builder, { city: 'Mumbai', locality: 'Andheri' });
    const flatId = await createFlatOn(builder, projectId, { bhk: 1, sizeSqft: 600, pricePerSqft: 9000 });

    const cold = await request(app).get(`${api}/flats?city=Mumbai`).expect(200);
    assert.equal(cold.headers['x-flattown-cache'], 'MISS');
    const warm = await request(app).get(`${api}/flats?city=Mumbai`).expect(200);
    assert.equal(warm.headers['x-flattown-cache'], 'HIT');

    // Marking the flat sold must purge the cache, not leave a stale listing.
    await request(app).put(`${api}/flats/${flatId}`).set(...auth(builder)).send({ isAvailable: false }).expect(200);

    const afterChange = await request(app).get(`${api}/flats?city=Mumbai`).expect(200);
    assert.equal(afterChange.headers['x-flattown-cache'], 'MISS', 'a flat mutation must invalidate the cache');
    assert.equal(afterChange.body.meta.total, 0, 'the sold flat must not still be listed');
  });

  it('serves identical results from cache as from the database', async () => {
    const cold = await request(app).get(`${api}/flats?limit=60`).expect(200);
    assert.equal(cold.headers['x-flattown-cache'], 'MISS');
    const warm = await request(app).get(`${api}/flats?limit=60`).expect(200);
    assert.equal(warm.headers['x-flattown-cache'], 'HIT');

    assert.deepEqual(
      warm.body.data.map((f: { id: string }) => f.id),
      cold.body.data.map((f: { id: string }) => f.id),
      'a cache hit must not change the result set',
    );
    assert.equal(warm.body.meta.total, cold.body.meta.total);
  });
});

let admin: Account;

/** Admins are never publicly registrable, so they are provisioned directly. */
async function makeAdmin(): Promise<Account> {
  if (admin) return admin;
  const { issueTokens } = await import('../src/services/auth.service');
  const user = await models.User.create({
    name: 'Cache Admin', email: `admin.redis.${uniq()}@ft.test`,
    phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
    password: PASSWORD, role: 'admin', isAdminVerified: true, kycStatus: 'approved',
  });
  const tokens = await issueTokens(user, { headers: {} });
  admin = { id: String(user._id), accessToken: tokens.accessToken };
  return admin;
}