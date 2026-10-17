import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { User, type IUser, type UserRole } from '../models/User';
import { ApiError } from '../utils/ApiError';

export interface AccessTokenPayload extends JwtPayload {
  sub: string;
  role: UserRole;
  email: string;
  tokenType: 'access';
}

export interface RefreshTokenPayload extends JwtPayload {
  sub: string;
  tokenType: 'refresh';
  familyId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: IUser;
      auth?: { userId: string; role: UserRole };
    }
  }
}

export const signAccessToken = (user: Pick<IUser, '_id' | 'role' | 'email'>): string => {
  const payload: Omit<AccessTokenPayload, keyof JwtPayload> = {
    sub: String(user._id),
    role: user.role,
    email: user.email,
    tokenType: 'access',
  };
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.accessTokenTtl,
    issuer: 'flattown',
    audience: 'flattown-web',
  } as SignOptions);
};

export const signRefreshToken = (userId: string, familyId: string): string => {
  const payload: Omit<RefreshTokenPayload, keyof JwtPayload> = {
    sub: userId,
    tokenType: 'refresh',
    familyId,
    // A unique `jti` guarantees every issued refresh token is a distinct string.
    // Without it, two refreshes inside the same second would produce a
    // byte-identical JWT, so revoking the old one would immediately invalidate
    // the new one and rotation would be indistinguishable from replay.
    jti: crypto.randomUUID(),
  };
  return jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: env.refreshTokenTtl,
    issuer: 'flattown',
    audience: 'flattown-web',
  } as SignOptions);
};

const decodeAndVerify = <T extends JwtPayload>(
  token: string,
  secret: string,
  tokenType: T['tokenType'],
): T => {
  let decoded: string | JwtPayload;
  try {
    decoded = jwt.verify(token, secret, { issuer: 'flattown', audience: 'flattown-web' });
  } catch (error) {
    const message = error instanceof jwt.TokenExpiredError ? 'Session expired' : 'Invalid token';
    throw ApiError.unauthorized(message);
  }
  const payload = decoded as T;
  if (payload.tokenType !== tokenType) throw ApiError.unauthorized('Invalid token type');
  if (!payload.sub) throw ApiError.unauthorized('Invalid token payload');
  return payload;
};

const extractBearer = (req: Request): string | null => {
  // Express types the header as `string | string[]`; repeated headers collapse to an array.
  const header = req.headers.authorization ?? req.headers.authorisation;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const [scheme, value] = raw.split(' ');
  if (!value || scheme.toLowerCase() !== 'bearer') return null;
  return value.trim();
};

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  decodeAndVerify<AccessTokenPayload>(token, env.jwtSecret, 'access');

export const verifyRefreshToken = (token: string): RefreshTokenPayload =>
  decodeAndVerify<RefreshTokenPayload>(token, env.jwtRefreshSecret, 'refresh');

/**
 * Requires a valid access token and loads the user document.
 */
export const authenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = extractBearer(req);
    if (!token) throw ApiError.unauthorized('Authentication token missing');

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (!user) throw ApiError.unauthorized('Account no longer exists');
    if (user.role === 'admin' && !user.isAdminVerified && env.isProd) {
      throw ApiError.forbidden('Admin account is not activated');
    }

    req.user = user;
    req.auth = { userId: String(user._id), role: user.role };
    next();
  } catch (error) {
    next(error instanceof ApiError ? error : ApiError.unauthorized('Authentication failed'));
  }
};

/** Attaches req.user when a valid token exists but never rejects. */
export const optionalAuth = async (req: Request, _res: Response, next: NextFunction): Promise<unknown> => {
  const token = extractBearer(req);
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (user) {
      req.user = user;
      req.auth = { userId: String(user._id), role: user.role };
    }
  } catch {
    // ignore — optional auth never blocks the request
  }
  return next();
};