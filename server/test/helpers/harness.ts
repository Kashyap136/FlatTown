/**
 * Integration-test harness.
 *
 * Boots a real Express app against a real (in-memory) MongoDB, so every test
 * exercises the same middleware chain, Mongoose validators and aggregation
 * pipelines that production uses — no repository stubs, no mocked gateways
 * beyond the deliberately simulated payment gateway.
 *
 * IMPORTANT: `src/config/env.ts` snapshots `process.env` at import time, so the
 * environment must be fully prepared *before* any application module is
 * imported. That is why the app, the models and the config are pulled in with
 * dynamic `import()` after the test environment is set and the memory server
 * has handed back a connection string.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Application } from 'express';
import type { Model } from 'mongoose';

/* -------------------------------------------------------------------------- */
/*  Environment                                                                */
/* -------------------------------------------------------------------------- */

const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-only-access-secret',
  JWT_REFRESH_SECRET: 'test-only-refresh-secret',
  // Deliberately blank: a developer's real credentials must never be used.
  REDIS_URL: '',
  RAZORPAY_KEY: '',
  RAZORPAY_SECRET: '',
  RAZORPAY_WEBHOOK_SECRET: '',
  CLOUDINARY_URL: '',
  AWS_REGION: '',
  AWS_BUCKET_NAME: '',
  SMTP_HOST: '',
  SMTP_USER: '',
  SMTP_PASS: '',
  ALLOW_MOCK_PAYMENTS: 'true',
  LOG_LEVEL: 'error',
  FRONTEND_URL: 'http://localhost:3000',
};

/* -------------------------------------------------------------------------- */
/*  Module registry — populated once the app has been loaded                   */
/* -------------------------------------------------------------------------- */

export interface TestModels {
  User: Model<any>;
  Project: Model<any>;
  Flat: Model<any>;
  Amenity: Model<any>;
  Booking: Model<any>;
  SiteVisit: Model<any>;
  Review: Model<any>;
  Wishlist: Model<any>;
  Requirement: Model<any>;
  Inquiry: Model<any>;
  PlatformConfig: Model<any>;
  AuditLog: Model<any>;
  Notification: Model<any>;
}

export interface Harness {
  app: Application;
  models: TestModels;
  /** Base path for every API route, e.g. `/api/v1`. */
  api: string;
  truncate: () => Promise<void>;
}

let harness: Harness | null = null;
let memoryServer: MongoMemoryServer | null = null;

/**
 * Boots the app once per test process.
 *
 * When `scripts/test.mjs` is used it starts ONE MongoMemoryServer and exports
 * its URI as `FLATTOWN_TEST_MONGO_URI`; every test file then reuses it. Node
 * runs each test file in its own process, so without this the suite forked six
 * mongod instances back to back, and the resulting process contention
 * intermittently cancelled whole suites — a flaky red run that looked like a
 * product regression but was only a slow fork.
 *
 * Falling back to a private server keeps each file runnable standalone
 * (`node --test test/booking.test.ts`).
 */
export const startHarness = async (): Promise<Harness> => {
  if (harness) return harness;

  for (const [key, value] of Object.entries(TEST_ENV)) process.env[key] = value;

  const sharedUri = process.env.FLATTOWN_TEST_MONGO_URI;
  if (sharedUri) {
    process.env.MONGO_URI = sharedUri;
  } else {
    /**
     * A generous startup timeout: mongodb-memory-server defaults to 10s, which
     * a busy Windows machine can exceed.
     */
    memoryServer = await MongoMemoryServer.create({ timeout: 120_000 });
    process.env.MONGO_URI = memoryServer.getUri('flattown_test');
  }

  const { connectDatabase } = await import('../../src/config/db');
  const { loadPlatformConfig } = await import('../../src/services/platformConfig.service');
  const { createApp } = await import('../../src/app');
  const { User } = await import('../../src/models/User');
  const { Project } = await import('../../src/models/Project');
  const { Flat } = await import('../../src/models/Flat');
  const { Amenity } = await import('../../src/models/Amenity');
  const { Booking } = await import('../../src/models/Booking');
  const { SiteVisit } = await import('../../src/models/SiteVisit');
  const { Review } = await import('../../src/models/Review');
  const { Wishlist } = await import('../../src/models/Wishlist');
  const { Requirement } = await import('../../src/models/Requirement');
  const { Inquiry } = await import('../../src/models/Inquiry');
  const { PlatformConfig } = await import('../../src/models/PlatformConfig');
  const { AuditLog } = await import('../../src/models/AuditLog');
  const { Notification } = await import('../../src/models/Notification');

  await connectDatabase();
  await loadPlatformConfig();

  const { env } = await import('../../src/config/env');

  harness = {
    app: createApp(),
    models: {
      User,
      Project,
      Flat,
      Amenity,
      Booking,
      SiteVisit,
      Review,
      Wishlist,
      Requirement,
      Inquiry,
      PlatformConfig,
      AuditLog,
      Notification,
    },
    api: env.apiPrefix,
    truncate: async () => {
      await Promise.all(
        Object.values(harness!.models).map((model) => model.deleteMany({})),
      );
      // PlatformConfig is the admin-managed pricing source of truth; reseed it
      // so a config-mutating test cannot leak into the next one.
      await PlatformConfig.deleteMany({});
      await loadPlatformConfig();
    },
  };

  return harness;
};

export const stopHarness = async (): Promise<void> => {
  const mongoose = (await import('mongoose')).default;
  if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
  harness = null;
};

export const getHarness = (): Harness => {
  if (!harness) throw new Error('Harness not started — call startHarness() in before().');
  return harness;
};
