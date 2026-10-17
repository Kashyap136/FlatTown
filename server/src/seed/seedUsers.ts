import { DEFAULT_BUILDER_RATING, User, type UserRole } from '../models/User';

/**
 * Development-only demo accounts.
 *
 * These credentials are intentionally simple and are ONLY created by
 * `npm run seed:all` / `npm run seed:users` in a development database.
 * Never run this seeder against production.
 */
export const DEMO_PASSWORD = 'FlatTown@123';

export interface DemoUserSpec {
  key: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  companyName?: string;
  city?: string;
  locality?: string;
  isAdminVerified?: boolean;
  isRERAVerified?: boolean;
  reraNumber?: string;
  kycDocs?: Array<{ type: string; url: string; verified: boolean }>;
}

export const DEMO_USERS: DemoUserSpec[] = [
  {
    key: 'admin',
    name: 'Flat Town Admin',
    email: 'admin@flattown.dev',
    phone: '9000000001',
    role: 'admin',
    companyName: 'Flat Town',
    city: 'Pune',
    locality: 'Baner',
    isAdminVerified: true,
  },
  {
    key: 'builder1',
    name: 'Rohan Deshmukh',
    email: 'builder@flattown.dev',
    phone: '9000000002',
    role: 'builder',
    companyName: 'Deshmukh Group',
    city: 'Pune',
    locality: 'Baner',
    isAdminVerified: true,
    isRERAVerified: true,
    reraNumber: 'P52100012345',
    kycDocs: [
      { type: 'pan', url: '/uploads/seed/builder-pan.pdf', verified: true },
      { type: 'aadhaar', url: '/uploads/seed/builder-aadhaar.pdf', verified: true },
    ],
  },
  {
    key: 'builder2',
    name: 'Ananya Kulkarni',
    email: 'builder2@flattown.dev',
    phone: '9000000003',
    role: 'builder',
    companyName: 'Kulkarni Estates',
    city: 'Pune',
    locality: 'Wakad',
    isAdminVerified: true,
    isRERAVerified: false,
    reraNumber: 'P52100098765',
    kycDocs: [{ type: 'pan', url: '/uploads/seed/builder2-pan.pdf', verified: true }],
  },
  {
    key: 'buyer',
    name: 'Priya Sharma',
    email: 'buyer@flattown.dev',
    phone: '9000000004',
    role: 'buyer',
    city: 'Pune',
    locality: 'Wakad',
  },
  {
    key: 'buyer2',
    name: 'Sandeep Patil',
    email: 'buyer2@flattown.dev',
    phone: '9000000005',
    role: 'buyer',
    city: 'Pune',
    locality: 'Baner',
  },
  {
    key: 'agent',
    name: 'Vikram Joshi',
    email: 'agent@flattown.dev',
    phone: '9000000006',
    role: 'agent',
    companyName: 'Joshi Realty',
    city: 'Mumbai',
    locality: 'Andheri',
  },
];

export const upsertDemoUser = async (spec: DemoUserSpec) => {
  const existing = await User.findOne({ email: spec.email });
  const payload = {
    name: spec.name,
    email: spec.email,
    phone: spec.phone,
    role: spec.role,
    companyName: spec.companyName,
    location: { city: spec.city, locality: spec.locality },
    isAdminVerified: spec.isAdminVerified ?? existing?.isAdminVerified ?? false,
    isVerified: spec.isAdminVerified ?? existing?.isVerified ?? false,
    isRERAVerified: spec.isRERAVerified ?? existing?.isRERAVerified ?? false,
    reraNumber: spec.reraNumber ?? existing?.reraNumber,
    kycDocs: spec.kycDocs ?? existing?.kycDocs ?? [],
    kycStatus: spec.kycDocs ? 'approved' : existing?.kycStatus ?? 'not_submitted',
    verifiedAt: spec.isAdminVerified ? new Date() : existing?.verifiedAt,
    rating:
      spec.role === 'builder'
        ? existing?.rating ?? { avg: DEFAULT_BUILDER_RATING, count: 0 }
        : existing?.rating ?? { avg: 0, count: 0 },
  };

  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    return existing;
  }
  return User.create({ ...payload, password: DEMO_PASSWORD });
};