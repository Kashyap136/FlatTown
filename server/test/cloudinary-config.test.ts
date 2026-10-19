import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const SNAPSHOT = { ...process.env };

const resetEnv = (): void => {
  for (const key of Object.keys(process.env)) {
    if (!(key in SNAPSHOT)) delete process.env[key];
  }
  for (const key of Object.keys(SNAPSHOT)) {
    process.env[key] = SNAPSHOT[key];
  }
};

const setEnv = (patch: Record<string, string | undefined>): void => {
  resetEnv();
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-access-secret';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-only-refresh-secret';
};

describe('cloudinary configuration', () => {
  after(() => {
    resetEnv();
  });

  it('imports storage safely when CLOUDINARY_URL is malformed', async () => {
    setEnv({ CLOUDINARY_URL: 'not-a-valid-url' });
    const tag = Date.now() + Math.random();
    const storageMod: any = await import(`../src/utils/storage.ts?malformed=${tag}`);
    assert.ok(storageMod, 'storage module imported without throwing');
    const envMod: any = await import(`../src/config/env.ts?malformed2=${tag}`);
    assert.equal(envMod.hasCloudinary(), false);
  });

  it('reports unavailable when no Cloudinary config is present', async () => {
    setEnv({ CLOUDINARY_URL: '', CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '' });
    const tag = Date.now() + Math.random();
    const envMod: any = await import(`../src/config/env.ts?empty=${tag}`);
    assert.equal(envMod.hasCloudinary(), false);
    assert.equal(envMod.cloudinaryConfig(), null);
  });

  it('accepts a valid CLOUDINARY_URL', async () => {
    setEnv({ CLOUDINARY_URL: 'cloudinary://abc123:xyz789@demo-cloud' });
    const tag = Date.now() + Math.random();
    const envMod: any = await import(`../src/config/env.ts?validurl=${tag}`);
    assert.equal(envMod.hasCloudinary(), true);
    const cfg = envMod.cloudinaryConfig();
    assert.ok(cfg && cfg.url === 'cloudinary://abc123:xyz789@demo-cloud');
  });

  it('accepts separate Cloudinary credentials', async () => {
    setEnv({ CLOUDINARY_URL: '', CLOUDINARY_CLOUD_NAME: 'demo-cloud', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' });
    const tag = Date.now() + Math.random();
    const envMod: any = await import(`../src/config/env.ts?sep=${tag}`);
    const cfg = envMod.cloudinaryConfig();
    assert.ok(cfg);
    assert.equal(cfg.cloud_name, 'demo-cloud');
    assert.equal(cfg.api_key, 'key');
    assert.equal(cfg.api_secret, 'secret');
  });

  it('gives CLOUDINARY_URL precedence over separate credentials', async () => {
    setEnv({
      CLOUDINARY_URL: 'cloudinary://abc123:xyz789@url-cloud',
      CLOUDINARY_CLOUD_NAME: 'other-cloud',
      CLOUDINARY_API_KEY: 'other-key',
      CLOUDINARY_API_SECRET: 'other-secret',
    });
    const tag = Date.now() + Math.random();
    const envMod: any = await import(`../src/config/env.ts?prec=${tag}`);
    const cfg = envMod.cloudinaryConfig();
    assert.ok(cfg && cfg.url === 'cloudinary://abc123:xyz789@url-cloud');
  });
});
