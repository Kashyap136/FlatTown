import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { User, type UserRole } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { sendCreated, sendOk } from '../utils/response';
import { DEFAULT_BUILDER_RATING } from '../models/User';
import {
  issueTokens,
  publicUser,
  revokeAllForUser,
  revokeRefreshToken,
  rotateRefreshToken,
} from '../services/auth.service';
import { invalidateBuilder } from '../services/cacheInvalidation';

/** Admin accounts are never created through public registration. */
const SELF_REGISTERABLE_ROLES: UserRole[] = ['buyer', 'builder', 'agent'];

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[0-9]{10,15}$/, 'Enter a valid 10-digit Indian mobile number'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  role: z.enum(['buyer', 'builder', 'agent']).default('buyer'),
  companyName: z.string().trim().max(160).optional(),
  city: z.string().trim().max(80).optional(),
  locality: z.string().trim().max(120).optional(),
  avatar: z.string().url('Avatar must be a valid URL').optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'Refresh token is required'),
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().regex(/^[+]?[0-9]{10,15}$/).optional(),
  avatar: z.string().url().optional(),
  companyName: z.string().trim().max(160).optional(),
  bio: z.string().trim().max(1000).optional(),
  city: z.string().trim().max(80).optional(),
  locality: z.string().trim().max(120).optional(),
  pincode: z.string().trim().max(10).optional(),
  // NOTE: `commissionSharePercent` is deliberately NOT settable here.
  // It is a financial term that controls how the platform commission is split
  // at escrow release. Letting an agent write their own value would let them
  // claim 100% of the commission. It is admin-only — see PUT /admin/agents/:id/commission.
});

/** POST /auth/register */
export const register = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const input = registerSchema.parse(req.body);
    if (!SELF_REGISTERABLE_ROLES.includes(input.role)) {
      throw ApiError.forbidden('That role cannot be self-registered');
    }

    const existing = await User.findOne({ $or: [{ email: input.email }, { phone: input.phone }] });
    if (existing) {
      throw ApiError.conflict(
        existing.email === input.email ? 'Email already registered' : 'Phone number already registered',
      );
    }

    const user = await User.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      password: input.password,
      role: input.role,
      companyName: input.companyName,
      avatar: input.avatar,
      // Builders start at 3.5 so they are discoverable from day one.
      rating:
        input.role === 'builder'
          ? { avg: DEFAULT_BUILDER_RATING, count: 0 }
          : { avg: 0, count: 0 },
      isVerified: false,
      isRERAVerified: false,
      location: { city: input.city, locality: input.locality },
    });

    const tokens = await issueTokens(user, req);
    await invalidateBuilder(user);

    return sendCreated(res, 'Account created successfully', { user: publicUser(user), ...tokens });
  } catch (error) {
    return next(error);
  }
};

/** POST /auth/login */
export const login = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await User.findOne({ email: input.email }).select('+password');

    if (!user) throw ApiError.unauthorized('Invalid email or password');
    const matches = await user.comparePassword(input.password);
    if (!matches) throw ApiError.unauthorized('Invalid email or password');

    const tokens = await issueTokens(user, req);
    return sendOk(res, 'Logged in successfully', { user: publicUser(user), ...tokens });
  } catch (error) {
    return next(error);
  }
};

/** POST /auth/refresh */
export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const input = refreshSchema.parse(req.body);
    const { user, tokens } = await rotateRefreshToken(input.refreshToken, req);
    return sendOk(res, 'Session refreshed', { user: publicUser(user), ...tokens });
  } catch (error) {
    return next(error);
  }
};

/** POST /auth/logout */
export const logout = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body ?? {});
    await revokeRefreshToken(refreshToken, 'logout');
    return sendOk(res, 'Logged out successfully');
  } catch (error) {
    if (error instanceof z.ZodError) return sendOk(res, 'Logged out successfully');
    return next(error);
  }
};

/** GET /auth/me */
export const me = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    return sendOk(res, 'Authenticated user fetched', { user: publicUser(req.user) });
  } catch (error) {
    return next(error);
  }
};

/** PUT /auth/profile */
export const updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const input = updateProfileSchema.parse(req.body);

    const user = await User.findById(req.user._id);
    if (!user) throw ApiError.notFound('User not found');

    if (input.phone && input.phone !== user.phone) {
      const clash = await User.findOne({ phone: input.phone, _id: { $ne: user._id } });
      if (clash) throw ApiError.conflict('Phone number already registered');
    }

    if (input.name) user.name = input.name;
    if (input.phone) user.phone = input.phone;
    if (input.avatar !== undefined) user.avatar = input.avatar;
    if (input.companyName !== undefined) user.companyName = input.companyName;
    if (input.bio !== undefined) user.bio = input.bio;
    user.location = {
      city: input.city ?? user.location?.city,
      locality: input.locality ?? user.location?.locality,
      pincode: input.pincode ?? user.location?.pincode,
    };

    await user.save();
    await invalidateBuilder(user);
    return sendOk(res, 'Profile updated successfully', { user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
};

/** PUT /auth/password */
export const changePassword = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const schema = z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(8).regex(/[A-Za-z]/).regex(/[0-9]/),
    });
    const input = schema.parse(req.body);

    const user = await User.findById(req.user._id).select('+password');
    if (!user) throw ApiError.notFound('User not found');
    if (!(await user.comparePassword(input.currentPassword))) {
      throw ApiError.badRequest('Current password is incorrect');
    }

    user.password = input.newPassword;
    await user.save();
    const revoked = await revokeAllForUser(String(user._id), 'password_changed');

    return sendOk(res, 'Password updated. All other sessions were signed out.', { revokedSessions: revoked });
  } catch (error) {
    return next(error);
  }
};

/** POST /auth/upload-avatar — handled by the upload route; kept for completeness. */
export const uploadAvatar = async (req: Request, res: Response, next: NextFunction): Promise<unknown> => {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    if (!req.file) throw ApiError.badRequest('No image uploaded');
    const user = await User.findById(req.user._id);
    if (!user) throw ApiError.notFound('User not found');
    user.avatar = (req.file as Express.Multer.File & { url?: string }).url ?? user.avatar;
    await user.save();
    return sendOk(res, 'Avatar updated', { user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
};