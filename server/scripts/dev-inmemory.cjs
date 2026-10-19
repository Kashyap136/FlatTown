/* eslint-disable */
/**
 * Local development harness.
 *
 * Boots the API against a throwaway in-memory MongoDB, seeds the demo dataset
 * and listens on the configured port. This is a **development convenience only**
 * — it exists so the frontend can be exercised end to end without provisioning
 * an Atlas cluster, and it prints the origin so `NEXT_PUBLIC_API_URL` can point
 * at it.
 *
 * Usage:  node --import tsx scripts/dev-inmemory.cjs [--port 5000] [--no-seed]
 *
 * For anything persistent, point MONGO_URI at a real database and use
 * `npx nodemon src/index.ts` instead.
 */
const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = Number(portArg >= 0 ? args[portArg + 1] : process.env.PORT || 5000);
const RESEED = !args.includes('--no-seed');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PORT = String(PORT);
process.env.ALLOW_MOCK_PAYMENTS = process.env.ALLOW_MOCK_PAYMENTS || 'true';
process.env.MOCK_PAYMENT_KEY = process.env.MOCK_PAYMENT_KEY || 'dev-mock-payment-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev-access-secret-change-me-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me-0123456789';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'info';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

(async () => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  // The 10s default is too tight on a busy machine — it intermittently killed
  // dev startup with "Instance failed to start within 10000ms". Same fix and
  // same reasoning as test/helpers/harness.ts.
  const mongod = await MongoMemoryServer.create({ timeout: 120_000 });
  process.env.MONGO_URI = mongod.getUri('flattown-dev');
  console.log(`[dev] in-memory MongoDB ready (data is discarded on shutdown)`);

  const { connectDatabase } = await import('../src/config/db.ts');
  await connectDatabase();

  // Initialise the cache exactly like `src/index.ts` does, so setting
  // REDIS_URL here actually exercises the real cache path in development.
  const { initRedis, cacheStatus, disconnectRedis } = await import('../src/config/redis.ts');
  await initRedis();
  const cache = cacheStatus();

  if (RESEED) {
    const { seedAll } = await import('../src/seed/seedAll.ts');
    await seedAll();
  }

  const { createApp } = await import('../src/app.ts');
  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`[dev] API listening on http://localhost:${PORT}`);
    console.log(`[dev] point the web app at it: NEXT_PUBLIC_API_URL=http://localhost:${PORT}`);
    console.log(
      `[dev] cache: ${cache.enabled ? (cache.connected ? 'connected' : 'configured but not connected') : 'disabled (REDIS_URL not set)'}`,
    );
  });

  const shutdown = async (signal) => {
    console.log(`\n[dev] ${signal} — shutting down`);
    server.close();
    const mongoose = (await import('mongoose')).default;
    await mongoose.connection.close();
    await disconnectRedis();
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
})().catch((error) => {
  console.error('[dev] failed to start', error);
  process.exit(1);
});
