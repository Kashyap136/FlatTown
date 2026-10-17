/**
 * Authentication, role guards and token lifecycle.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Application } from 'express';

import { startHarness, stopHarness } from './helpers/harness';
import { PASSWORD, auth, createAdmin, registerUser, type Account } from './helpers/fixtures';

let app: Application;
let api: string;

before(async () => {
  const harness = await startHarness();
  app = harness.app;
  api = harness.api;
});

after(async () => {
  await stopHarness();
});

beforeEach(async () => {
  const { getHarness } = await import('./helpers/harness');
  await getHarness().truncate();
});

describe('registration (RULE 5 — admin is never publicly registrable)', () => {
  it('registers a buyer and never echoes the password', async () => {
    const res = await request(app)
      .post(`${api}/auth/register`)
      .send({
        name: 'Asha Buyer',
        email: 'asha.buyer@flattown.test',
        phone: '9876543210',
        password: PASSWORD,
        role: 'buyer',
      })
      .expect(201);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.role, 'buyer');
    assert.equal(res.body.data.user.email, 'asha.buyer@flattown.test');
    assert.equal(res.body.data.user.password, undefined);
    assert.ok(res.body.data.accessToken, 'access token issued');
    assert.ok(res.body.data.refreshToken, 'refresh token issued');
    assert.equal(res.body.data.expiresIn, '15m');
    assert.equal(res.body.data.refreshExpiresIn, '7d');
  });

  it('refuses to self-register an admin', async () => {
    const res = await request(app)
      .post(`${api}/auth/register`)
      .send({
        name: 'Sneaky Admin',
        email: 'sneaky@flattown.test',
        phone: '9876543211',
        password: PASSWORD,
        role: 'admin',
      })
      .expect(422);
    assert.equal(res.body.success, false);
  });

  it('rejects a weak password and a malformed phone number', async () => {
    const weak = await request(app)
      .post(`${api}/auth/register`)
      .send({ name: 'Weak', email: 'weak@flattown.test', phone: '9876543212', password: 'short' })
      .expect(422);
    assert.equal(weak.body.success, false);
    assert.equal(weak.body.message, 'Validation failed');
    const passwordError = (weak.body.errors as Array<{ field: string; message: string }>).find(
      (e) => e.field === 'password',
    );
    assert.ok(passwordError, 'a password validation error is reported');
    assert.match(passwordError.message, /8 characters/i);

    const phone = await request(app)
      .post(`${api}/auth/register`)
      .send({ name: 'Bad Phone', email: 'phone@flattown.test', phone: '123', password: PASSWORD })
      .expect(422);
    const phoneError = (phone.body.errors as Array<{ field: string; message: string }>).find(
      (e) => e.field === 'phone',
    );
    assert.ok(phoneError, 'a phone validation error is reported');
    assert.match(phoneError.message, /10-digit|mobile/i);
  });

  it('rejects a duplicate email', async () => {
    await registerUser(app, 'buyer', { email: 'dupe@flattown.test' });
    const res = await request(app)
      .post(`${api}/auth/register`)
      .send({ name: 'Dupe Two', email: 'dupe@flattown.test', phone: '9876543213', password: PASSWORD })
      .expect(409);
    assert.equal(res.body.success, false);
  });

  it('gives a new builder the default 3.5 rating', async () => {
    const builder = await registerUser(app, 'builder', { companyName: 'Deshmukh Group' });
    const res = await request(app).get(`${api}/auth/me`).set(...auth(builder)).expect(200);
    assert.equal(res.body.data.user.role, 'builder');
    assert.equal(res.body.data.user.rating.avg, 3.5);
    assert.equal(res.body.data.user.rating.count, 0);
  });
});

describe('login and session', () => {
  it('logs in with the right password and refuses the wrong one', async () => {
    const created = await registerUser(app, 'buyer', { email: 'login@flattown.test' });

    const ok = await request(app)
      .post(`${api}/auth/login`)
      .send({ email: 'login@flattown.test', password: PASSWORD })
      .expect(200);
    assert.equal(ok.body.data.user.id, created.id);

    const bad = await request(app)
      .post(`${api}/auth/login`)
      .send({ email: 'login@flattown.test', password: 'WrongPass@1' })
      .expect(401);
    assert.equal(bad.body.success, false);
  });

  it('rotates the refresh token and invalidates the old one', async () => {
    const buyer = await registerUser(app, 'buyer');
    const familyOf = (token: string): string =>
      JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')).familyId as string;

    const first = await request(app)
      .post(`${api}/auth/refresh`)
      .send({ refreshToken: buyer.refreshToken })
      .expect(200);
    const rotated = first.body.data.refreshToken as string;

    assert.notEqual(rotated, buyer.refreshToken, 'a new refresh token is issued');
    assert.notEqual(rotated, undefined, 'the response carries the rotated token');
    assert.ok(first.body.data.accessToken, 'a fresh access token is issued');
    assert.equal(
      familyOf(rotated),
      familyOf(buyer.refreshToken),
      'rotation stays inside the same token family',
    );

    // Re-using the rotated-away token must fail (refresh-token reuse detection).
    const replay = await request(app)
      .post(`${api}/auth/refresh`)
      .send({ refreshToken: buyer.refreshToken })
      .expect(401);
    assert.equal(replay.body.success, false);
  });

  it('logs out and refuses the revoked refresh token', async () => {
    const buyer = await registerUser(app, 'buyer');
    await request(app).post(`${api}/auth/logout`).send({ refreshToken: buyer.refreshToken }).expect(200);

    const res = await request(app)
      .post(`${api}/auth/refresh`)
      .send({ refreshToken: buyer.refreshToken })
      .expect(401);
    assert.equal(res.body.success, false);
  });

  it('rejects a missing, malformed or forged bearer token', async () => {
    await request(app).get(`${api}/auth/me`).expect(401);
    await request(app).get(`${api}/auth/me`).set('Authorization', 'Bearer not-a-jwt').expect(401);
    await request(app)
      .get(`${api}/auth/me`)
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImZha2UifQ.bad-signature')
      .expect(401);
  });
});

describe('role guards (RULE 5)', () => {
  let buyer: Account;
  let builder: Account;
  let admin: Account;

  beforeEach(async () => {
    buyer = await registerUser(app, 'buyer');
    builder = await registerUser(app, 'builder');
    admin = await createAdmin();
  });

  it('keeps the admin surface admin-only', async () => {
    await request(app).get(`${api}/admin/dashboard`).expect(401);

    for (const account of [buyer, builder]) {
      const res = await request(app).get(`${api}/admin/dashboard`).set(...auth(account)).expect(403);
      assert.match(res.body.message, /requires one of the following roles: admin/i);
    }

    const ok = await request(app).get(`${api}/admin/dashboard`).set(...auth(admin)).expect(200);
    assert.equal(ok.body.success, true);
  });

  it('restricts booking creation to buyers', async () => {
    const res = await request(app)
      .post(`${api}/bookings/token`)
      .set(...auth(builder))
      .send({ flatId: '507f1f77bcf86cd799439011', tokenAmount: 50_000 });
    assert.equal(res.status, 403);
  });

  it('restricts site-visit requests to buyers', async () => {
    const res = await request(app)
      .post(`${api}/visits/request`)
      .set(...auth(builder))
      .send({
        flatId: '507f1f77bcf86cd799439011',
        slot: { date: new Date(Date.now() + 86_400_000).toISOString(), time: '10:00 AM' },
      });
    assert.equal(res.status, 403);
  });

  it('restricts the review write path to buyers', async () => {
    const res = await request(app)
      .post(`${api}/reviews`)
      .set(...auth(builder))
      .send({ flatId: '507f1f77bcf86cd799439011', rating: 5 });
    assert.equal(res.status, 403);
  });

  it('makes the wishlist buyer-only', async () => {
    await request(app).get(`${api}/wishlist/me`).set(...auth(builder)).expect(403);
    await request(app).get(`${api}/wishlist/me`).set(...auth(buyer)).expect(200);
  });

  it('keeps public discovery open to anonymous visitors', async () => {
    await request(app).get(`${api}/flats`).expect(200);
    await request(app).get(`${api}/projects`).expect(200);
    await request(app).get(`${api}/tiers/config`).expect(200);
    await request(app).get(`${api}/cities`).expect(200);
    await request(app).get(`${api}/amenities`).expect(200);
  });

  it('reports health without authentication', async () => {
    const res = await request(app).get('/health').expect(200);
    assert.equal(res.body.data.status, 'ok');
    assert.equal(res.body.data.payments.gateway, 'mock');
    assert.equal(res.body.data.payments.live, false);
  });
});
