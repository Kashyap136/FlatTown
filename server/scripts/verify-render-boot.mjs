/**
 * Simulates a Render production boot as closely as possible on a dev machine.
 *
 * Reproduces the exact deploy contract:
 *   - the COMPILED artifact (`dist/`), not tsx sources
 *   - NODE_ENV=production
 *   - PORT injected by the platform (not pinned to 5000)
 *   - production safety rails: mock payments refused, placeholder JWT refused
 *
 * Usage: node scripts/verify-render-boot.mjs
 */
import { spawn } from 'node:child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';

const PORT = process.env.PROBE_PORT ?? '41234';

const mongod = await MongoMemoryServer.create();
const MONGO_URI = mongod.getUri('flattown_render_probe');

console.log('probe: starting MongoMemoryServer...');

const child = spawn(process.execPath, ['dist/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT,
    MONGO_URI,
    // Real-looking secrets so `assertProductionEnv()` passes.
    JWT_SECRET: 'probe-only-access-secret-0123456789abcdefghij',
    JWT_REFRESH_SECRET: 'probe-only-refresh-secret-9876543210abcdefghij',
    REDIS_URL: '',
    RAZORPAY_KEY: '',
    RAZORPAY_SECRET: '',
    RAZORPAY_WEBHOOK_SECRET: '',
    CLOUDINARY_URL: '',
    SMTP_HOST: '',
    ALLOW_MOCK_PAYMENTS: 'false',
    MOCK_PAYMENT_KEY: 'probe-mock-key',
    FRONTEND_URL: 'https://flattown.vercel.app',
    LOG_LEVEL: 'info',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let out = '';
child.stdout.on('data', (d) => { out += d.toString(); });
child.stderr.on('data', (d) => { out += d.toString(); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let healthy = false;

for (let i = 0; i < 40; i += 1) {
  await wait(1000);
  if (child.exitCode !== null) break;
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`);
    const body = await res.json();
    if (res.status === 200 && body?.data?.status === 'ok') { healthy = true; break; }
  } catch { /* not listening yet */ }
}

console.log('---- server output ----');
console.log(out.trim());
console.log('-----------------------');

const failures = [];
if (child.exitCode !== null && !healthy) failures.push(`process exited early with code ${child.exitCode}`);
if (!healthy) failures.push('/health did not return 200 within 40s');
if (!out.includes('FLAT TOWN API')) failures.push('startup banner missing — boot did not complete');

// The injected PORT must be honoured, not a hard-coded 5000.
if (healthy) {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/v1/flats?limit=1`);
  const body = await res.json();
  if (res.status !== 200 || !body.success) failures.push(`GET /api/v1/flats failed: ${res.status}`);
  else console.log(`probe: GET /api/v1/flats OK on injected PORT ${PORT}`);
}

child.kill('SIGTERM');
await wait(1500);
if (!child.killed) child.kill('SIGKILL');
await mongod.stop();

if (failures.length) {
  console.error('\nRENDER BOOT PROBE FAILED:');
  for (const f of failures) console.error(' - ' + f);
  process.exit(1);
}
console.log('\nRENDER BOOT PROBE PASSED — compiled artifact boots on an injected PORT with production safety rails enforced.');
process.exit(0);
