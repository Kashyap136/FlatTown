/* eslint-disable */
/**
 * Test runner that shares ONE MongoMemoryServer across every test file.
 *
 * `node --test` runs each file in its own process. Left to its own devices the
 * suite therefore forked one mongod per file, back to back, and on a busy
 * machine that contention intermittently failed or cancelled whole suites —
 * producing flaky red runs that looked like product regressions.
 *
 * This wrapper starts a single server, exports its URI as
 * `FLATTOWN_TEST_MONGO_URI` (the harness reuses it and does not start its own),
 * runs the files sequentially, then shuts the server down.
 *
 * Usage: node scripts/test.mjs [--concurrency 1]
 */
import { spawn } from 'node:child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';

const argv = process.argv.slice(2);
const concurrencyIdx = argv.indexOf('--concurrency');
const concurrency = concurrencyIdx >= 0 ? argv[concurrencyIdx + 1] : '1';
const passthrough = argv.filter((a, i) => a !== '--concurrency' && a !== concurrency);

const mongod = await MongoMemoryServer.create({ timeout: 120_000 });
const uri = mongod.getUri('flattown_test');
console.log(`[test] shared in-memory MongoDB ready (${uri})`);

const args = [
  '--test',
  `--test-concurrency=${concurrency}`,
  '--import',
  'tsx',
  ...passthrough,
  'test/admin.test.ts',
  'test/auth.test.ts',
  'test/booking.test.ts',
  'test/discovery.test.ts',
  'test/pricing.test.ts',
  'test/security.test.ts',
];

const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    FLATTOWN_TEST_MONGO_URI: uri,
    // The harness must not clobber the shared URI with its own blank value.
    MONGO_URI: uri,
  },
});

const code = await new Promise((resolve) => {
  child.on('exit', (c, signal) => resolve(signal ? 1 : (c ?? 0)));
});

await mongod.stop();
console.log('[test] shared in-memory MongoDB stopped');
process.exit(code);
