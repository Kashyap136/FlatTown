import type { NextFunction, Request, Response } from 'express';
import type { IUser, UserRole } from '../models/User';
import { ApiError } from '../utils/ApiError';

/**
 * Narrows `req.user` for handlers mounted behind `authenticate`.
 *
 * `req.user` is optional because `optionalAuth` may leave it unset. Handlers
 * guarded by `requireAuth`/`roleCheck` can safely assert it with this helper
 * instead of a bare `!`, which keeps the failure mode explicit.
 */
export const currentUser = (req: Request): IUser => {
  if (!req.user) throw ApiError.unauthorized('Authentication required');
  return req.user;
};

export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) return next(ApiError.unauthorized('Authentication required'));
  return next();
};

/** Restricts a route to the listed roles. Must run after `authenticate`. */
export const roleCheck =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(ApiError.unauthorized('Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(`This action requires one of the following roles: ${roles.join(', ')}`),
      );
    }
    return next();
  };

export const isBuyer = roleCheck('buyer');
export const isBuilder = roleCheck('builder');
export const isAgent = roleCheck('agent');
export const isAdmin = roleCheck('admin');
export const isBuilderOrAgent = roleCheck('builder', 'agent');
export const isBuilderAgentOrAdmin = roleCheck('builder', 'agent', 'admin');

/**
 * Allows a builder, an agent who is attached to the record, or an admin.
 * `paramName` names the request param holding the owning builder id.
 */
export const ownerOrAdmin =
  (paramName: string) => (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(ApiError.unauthorized('Authentication required'));
    if (req.user.role === 'admin' || req.user.role === 'builder') return next();

    const ownerId = String(req.params[paramName] ?? '');
    if (req.user.role === 'agent' && ownerId && ownerId !== String(req.user._id)) {
      return next(ApiError.forbidden('Agents may only act on records they are assigned to'));
    }
    return next();
  };