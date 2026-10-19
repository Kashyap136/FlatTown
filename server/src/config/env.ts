/**
 * Centralised environment configuration.
 *
 * Secrets are never exposed to the client bundle: anything prefixed with
 * `NEXT_PUBLIC_` lives in the web app only. Everything here is server side.
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const isPlaceholder = (value?: string): boolean => {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return (
    v.startsWith('change-me') ||
    v === 'example' ||
    v.startsWith('rzp_test_example') ||
    v.startsWith('pk.ey') ||
    v.startsWith('mongodb+srv://<') ||
    v.includes('your-')
  );
};

/**
 * Reads a percentage that may be written either as a percentage (`10`) or as a
 * fraction (`0.10`).
 *
 * The specification names the variable `COMMISSION=0.10`, while this codebase
 * historically read `COMMISSION_PERCENT=10`. Both are honoured so a value copied
 * from `.env.example` or a deploy blueprint actually takes effect — previously
 * `COMMISSION` was silently ignored.
 */
const percentOrFraction = (
  fraction: string | undefined,
  percent: string | undefined,
  fallback: number,
): number => {
  const raw = fraction ?? percent;
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
};

/** First non-empty value among several accepted environment variable names. */
const firstOf = (...values: Array<string | undefined>): string | undefined =>
  values.find((v) => v !== undefined && v !== '' && v.trim() !== '');

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';

/**
 * Known-insecure fallbacks. These are only used when the corresponding env var
 * is absent, and they are tracked explicitly so a production boot can refuse to
 * start rather than run with a publicly-known signing key.
 */
const INSECURE_JWT_SECRET = 'dev-only-insecure-jwt-secret';
const INSECURE_REFRESH_SECRET = 'dev-only-insecure-refresh-secret';

export const env = {
  nodeEnv,
  isProd,
  isTest: nodeEnv === 'test',
  port: num(process.env.PORT, 5000),

  // URLs
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  backendUrl: process.env.BACKEND_URL ?? 'http://localhost:5000',
  apiPrefix: '/api/v1',

  // Database
  mongoUri: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/flattown',

  // Auth
  jwtSecret: process.env.JWT_SECRET ?? INSECURE_JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? INSECURE_REFRESH_SECRET,
  accessTokenTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  refreshTokenTtl: process.env.JWT_REFRESH_TTL ?? '7d',

  // Redis
  redisUrl: process.env.REDIS_URL ?? '',

  // Payments
  razorpayKeyId: process.env.RAZORPAY_KEY ?? process.env.RAZORPAY_KEY_ID ?? '',
  razorpayKeySecret: process.env.RAZORPAY_SECRET ?? process.env.RAZORPAY_KEY_SECRET ?? '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  escrowAccountId: process.env.ESCROW_ACCOUNT_ID ?? 'flattown-escrow',
  /**
   * Development-only switch that allows the payment layer to run a deterministic
   * simulated gateway so the whole booking/escrow lifecycle can be exercised
   * without live Razorpay credentials. Refuses to activate in production.
   */
  allowMockPayments: bool(process.env.ALLOW_MOCK_PAYMENTS, true),
  mockPaymentKey: process.env.MOCK_PAYMENT_SECRET ?? 'flattown-dev-payment-secret',

  // Storage
  cloudinaryUrl: process.env.CLOUDINARY_URL ?? '',
  awsRegion: process.env.AWS_REGION ?? '',
  awsBucket: process.env.AWS_BUCKET_NAME ?? '',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',

  // Email
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: num(process.env.SMTP_PORT, 587),
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  // `MAIL_FROM` is the name published in .env.example; `EMAIL_FROM` is the
  // historical name. Both are accepted so the documented value is not ignored.
  emailFrom: firstOf(process.env.EMAIL_FROM, process.env.MAIL_FROM) ?? 'Flat Town <noreply@flattown.local>',

  // SMS abstraction (provider-agnostic)
  smsProvider: process.env.SMS_PROVIDER ?? 'log',
  smsApiKey: process.env.SMS_API_KEY ?? '',
  smsSenderId: process.env.SMS_SENDER_ID ?? 'FLATTOWN',

  // Business defaults (mirrored into PlatformConfig by the seeder)
  defaultTierBudget: num(process.env.TIER_BUDGET, 5_000_000),
  defaultTierMid: num(process.env.TIER_MID, 15_000_000),
  // `COMMISSION` is the specification's name and is a fraction (0.10 = 10%);
  // `COMMISSION_PERCENT` is the legacy percentage form (10). Both normalise to a
  // percentage here.
  defaultCommissionPercent: percentOrFraction(process.env.COMMISSION, process.env.COMMISSION_PERCENT, 10),
  defaultAgentSplitPlatformPercent: num(
    firstOf(process.env.AGENT_PLATFORM_PERCENT, process.env.AGENT_SPLIT_PLATFORM),
    70,
  ),
  defaultAgentSplitAgentPercent: num(
    firstOf(process.env.AGENT_AGENT_PERCENT, process.env.AGENT_SPLIT_AGENT),
    30,
  ),
  defaultTokenAmount: num(process.env.DEFAULT_TOKEN_AMOUNT, 50_000),
  defaultVisitCharge: num(process.env.DEFAULT_VISIT_CHARGE, 199),
  maxUploadMb: num(process.env.MAX_UPLOAD_MB, 10),
} as const;

/** True when live Razorpay credentials are usable. */
export const hasLiveRazorpay = (): boolean =>
  !isPlaceholder(env.razorpayKeyId) && !isPlaceholder(env.razorpayKeySecret) && env.razorpayKeyId.length > 5;

/** True when a real Cloudinary account is configured. */
export const hasCloudinary = (): boolean =>
  env.cloudinaryUrl.length > 0 && !env.cloudinaryUrl.includes('key:secret@');

/** True when the JWT signing key is missing, known-insecure or a placeholder. */
export const isInsecureJwt = (): boolean =>
  env.jwtSecret === INSECURE_JWT_SECRET || isPlaceholder(env.jwtSecret) || env.jwtSecret.length < 32;

export const placeholderFlags = {
  jwt: isInsecureJwt(),
  jwtRefresh:
    env.jwtRefreshSecret === INSECURE_REFRESH_SECRET || isPlaceholder(env.jwtRefreshSecret) ||
    env.jwtRefreshSecret.length < 32,
  razorpay: !hasLiveRazorpay(),
  cloudinary: !hasCloudinary(),
  mongo: isPlaceholder(env.mongoUri),
};

/**
 * Refuses to start a production server with unsafe configuration.
 *
 * A deployment that forgets JWT_SECRET would otherwise be running with a
 * publicly-known signing key, which makes every access AND refresh token
 * forgeable. Failing fast is the only safe behaviour.
 */
export const assertProductionEnv = (): void => {
  if (!isProd) return;
  const problems: string[] = [];

  if (isInsecureJwt()) {
    problems.push('JWT_SECRET must be set to a unique value of at least 32 characters');
  }
  if (placeholderFlags.jwtRefresh) {
    problems.push('JWT_REFRESH_SECRET must be set to a unique value of at least 32 characters');
  }
  if (env.jwtSecret === env.jwtRefreshSecret) {
    problems.push('JWT_SECRET and JWT_REFRESH_SECRET must be different values');
  }
  if (placeholderFlags.mongo) {
    problems.push('MONGO_URI must be set');
  }
  if (env.allowMockPayments) {
    problems.push('ALLOW_MOCK_PAYMENTS must be false in production');
  }

  if (problems.length) {
    throw new Error(
      `Refusing to start in production with an unsafe configuration:\n  - ${problems.join('\n  - ')}\n` +
        'See server/.env.example for the required values.',
    );
  }
};