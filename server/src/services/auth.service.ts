import crypto from 'crypto';
import type { Request } from 'express';
import { RefreshToken } from '../models/RefreshToken';
import { User, type IUser } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { signAccessToken, signRefreshToken } from '../middlewares/auth';
import { env } from '../config/env';

const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  refreshExpiresIn: string;
}

export const issueTokens = async (
  user: IUser,
  req: Pick<Request, 'headers' | 'ip'> & Partial<Request>,
  familyId: string = crypto.randomUUID(),
): Promise<TokenPair> => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(String(user._id), familyId);

  const decoded = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64').toString('utf8')) as {
    exp: number;
  };

  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    userAgent: req.headers?.['user-agent'],
    ip: req.ip,
    expiresAt: new Date(decoded.exp * 1000),
    familyId,
  });

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  return {
    accessToken,
    refreshToken,
    expiresIn: env.accessTokenTtl,
    refreshExpiresIn: env.refreshTokenTtl,
  };
};

/** Rotates a refresh token: the presented token is revoked and replaced. */
export const rotateRefreshToken = async (
  presentedToken: string,
  req: Pick<Request, 'headers' | 'ip'> & Partial<Request>,
): Promise<{ user: IUser; tokens: TokenPair }> => {
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(presentedToken) });
  if (!stored) throw ApiError.unauthorized('Invalid refresh token');
  if (stored.revokedAt) throw ApiError.unauthorized('Refresh token has been revoked');
  if (stored.expiresAt.getTime() < Date.now()) throw ApiError.unauthorized('Refresh token expired');

  const user = await User.findById(stored.userId);
  if (!user) throw ApiError.unauthorized('Account no longer exists');

  stored.revokedAt = new Date();
  stored.revokedReason = 'rotated';
  await stored.save({ validateBeforeSave: false });

  const tokens = await issueTokens(user, req, stored.familyId);
  return { user, tokens };
};

export const revokeRefreshToken = async (presentedToken: string, reason: string): Promise<void> => {
  await RefreshToken.updateOne(
    { tokenHash: hashToken(presentedToken) },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
};

export const revokeAllForUser = async (userId: string, reason: string): Promise<number> => {
  const result = await RefreshToken.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
  return result.modifiedCount;
};

/** Shape returned to the client — never includes the password hash. */
export const publicUser = (user: IUser) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  avatar: user.avatar,
  companyName: user.companyName,
  bio: user.bio,
  isVerified: user.isVerified,
  isAdminVerified: user.isAdminVerified,
  isRERAVerified: user.isRERAVerified,
  reraNumber: user.reraNumber,
  reraVerifiedAt: user.reraVerifiedAt,
  kycStatus: user.kycStatus,
  kycDocs: (user.kycDocs ?? []).map((doc) => ({
    type: doc.type,
    verified: doc.verified,
    uploadedAt: doc.uploadedAt,
    // Private documents are only ever exposed through a signed, authorised route.
    url: undefined,
  })),
  rating: { avg: user.rating?.avg ?? 0, count: user.rating?.count ?? 0 },
  commissionSharePercent: user.commissionSharePercent,
  location: {
    city: user.location?.city,
    locality: user.location?.locality,
    pincode: user.location?.pincode,
  },
  createdAt: user.createdAt,
});