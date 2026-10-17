/**
 * Test fixtures: account provisioning, tokens and catalogue setup.
 *
 * Everything here goes through the public HTTP API wherever possible so the
 * tests assert on the same validation and authorisation rules a client sees.
 */
import request from 'supertest';
import type { Application } from 'express';
import { getHarness } from './harness';

export const PASSWORD = 'FlatTown@123';

export interface Account {
  id: string;
  email: string;
  name: string;
  role: 'buyer' | 'builder' | 'agent' | 'admin';
  accessToken: string;
  refreshToken: string;
}

let counter = 0;
const uniq = (): string => {
  counter += 1;
  return `${Date.now().toString(36)}${counter}`;
};

const apiOf = (): string => getHarness().api;

/** Registers a user through `POST /auth/register` and returns a token pair. */
export const registerUser = async (
  app: Application,
  role: 'buyer' | 'builder' | 'agent',
  overrides: Record<string, unknown> = {},
): Promise<Account> => {
  const email = `${role}.${uniq()}@flattown.test`;
  const res = await request(app)
    .post(apiOf() + '/auth/register')
    .send({
      name: `${role} tester`,
      email,
      phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
      password: PASSWORD,
      role,
      ...overrides,
    })
    .expect(201);

  const data = res.body.data as {
    user: { id: string; name: string; email: string; role: Account['role'] };
    accessToken: string;
    refreshToken: string;
  };
  return {
    id: data.user.id,
    email: data.user.email,
    name: data.user.name,
    role: data.user.role,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
};

/**
 * Admin accounts are never publicly registrable, so they are inserted directly
 * — exactly the situation the specification describes (seeded / provisioned by
 * the platform operator).
 */
export const createAdmin = async (): Promise<Account> => {
  const { models } = getHarness();
  const email = `admin.${uniq()}@flattown.test`;
  // The pre-save hook hashes `password`; the field is `select: false`.
  const user = await models.User.create({
    name: 'Platform Admin',
    email,
    phone: `90000${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`,
    password: PASSWORD,
    role: 'admin',
    isAdminVerified: true,
    kycStatus: 'approved',
  });
  const { issueTokens } = await import('../../src/services/auth.service');
  const tokens = await issueTokens(user, { headers: {} });
  return {
    id: String(user._id),
    email,
    name: user.name,
    role: 'admin',
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
};

export const auth = (account: Account): [string, string] => ['Authorization', `Bearer ${account.accessToken}`];

/** Marks a builder as admin-verified + RERA-verified so it can publish. */
/**
 * Sets a builder to the admin-approved, RERA-submitted state.
 *
 * `rera = false` models a builder whose RERA number is on file but still
 * awaiting admin verification — the state the verification queue exists for.
 */
export const verifyBuilder = async (builderId: string, rera = true): Promise<void> => {
  const { models } = getHarness();
  await models.User.updateOne(
    { _id: builderId },
    {
      $set: {
        isAdminVerified: true,
        kycStatus: 'approved',
        isRERAVerified: rera,
        reraNumber: `P51700${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
        reraState: 'Maharashtra',
        reraVerifiedAt: rera ? new Date() : undefined,
        verificationRequestedAt: new Date(),
      },
    },
  );
};

export const addDays = (days: number): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

export interface ProjectFixture {
  id: string;
  slug: string;
}

export const createProject = async (
  app: Application,
  builder: Account,
  overrides: Record<string, unknown> = {},
): Promise<ProjectFixture> => {
  const slug = `proj-${uniq()}`;
  // Projects inherit the owner's RERA state, which only an admin can change in
  // production — the fixture mirrors whatever the admin already decided.
  const owner = await getHarness().models.User.findById(builder.id).select('isRERAVerified').lean();
  const res = await request(app)
    .post(apiOf() + '/projects')
    .set(...auth(builder))
    .send({
      projectName: `Test Project ${slug}`,
      slug,
      city: 'Pune',
      locality: 'Koregaon Park',
      fullAddress: `${uniq()} Test Street, Koregaon Park, Pune 411001`,
      description: 'RERA-registered residential project used by the automated test suite.',
      reraNumber: `P52100${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
      amenities: [],
      images: [],
      possessionDate: addDays(240).toISOString(),
      status: 'under_construction',
      geo: { lat: 18.53, lng: 73.89 },
      ...overrides,
    })
    .expect(201);
  const data = res.body.data as { project: { id: string; slug: string } };
  if (owner?.isRERAVerified) {
    await getHarness().models.Project.updateOne(
      { _id: data.project.id },
      { $set: { isRERAVerified: true, reraVerifiedAt: new Date() } },
    );
  }
  return { id: data.project.id, slug: data.project.slug };
};

export interface FlatFixture {
  id: string;
  projectId: string;
  totalPrice: number;
  tier: string;
}

export const createFlat = async (
  app: Application,
  builder: Account,
  projectId: string,
  overrides: Record<string, unknown> = {},
): Promise<FlatFixture> => {
  const res = await request(app)
    .post(apiOf() + '/flats')
    .set(...auth(builder))
    .send({
      projectId,
      title: `Flat ${uniq()}`,
      bhk: 2,
      type: 'apartment',
      sizeSqft: 1000,
      pricePerSqft: 7000,
      floorRise: 0,
      parkingCharges: 0,
      floor: 4,
      facing: 'east',
      amenities: [],
      possessionDate: addDays(240).toISOString(),
      isAvailable: true,
      images: [],
      ...overrides,
    })
    .expect(201);
  const data = res.body.data as { flat: { id: string; totalPrice: number; tier: string } };
  return { id: data.flat.id, projectId, totalPrice: data.flat.totalPrice, tier: data.flat.tier };
};

export type AmenityCategory = 'lifestyle' | 'parking' | 'security' | 'wellness' | 'utility';

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const createAmenity = async (
  name: string,
  category: AmenityCategory = 'lifestyle',
): Promise<string> => {
  const { models } = getHarness();
  const doc = await models.Amenity.create({
    name,
    slug: `${slugify(name)}-${uniq()}`,
    category,
    icon: 'Sparkles',
    isActive: true,
  });
  return String(doc._id);
};

/**
 * Completes a booking-token payment against the simulated gateway.
 * Returns the refreshed booking id.
 */
export const payToken = async (app: Application, buyer: Account, bookingId: string): Promise<void> => {
  const api = apiOf();
  const booking = await getHarness().models.Booking.findById(bookingId).lean();
  if (!booking) throw new Error(`Booking ${bookingId} not found`);
  const signature = 'a'.repeat(64); // mock gateway only requires a 64-char signature
  await request(app)
    .post(`${api}/bookings/${bookingId}/verify-token-payment`)
    .set(...auth(buyer))
    .send({
      paymentId: `pay_mock_${uniq()}`,
      signature,
      orderId: (booking as any).payment?.orderId,
    })
    .expect(200);
};

export const json = (res: request.Response): any => res.body;
