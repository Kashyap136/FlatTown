import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';

/**
 * Guards actions where RERA verification affects trust/ranking guarantees
 * (publishing a project, marking RERA verified, featuring a project).
 *
 * Builders can never satisfy this by themselves — the flag is only settable by
 * an admin through PUT /admin/verify-rera/:builderId.
 */
export const reraVerifiedCheck =
  (options: { allowAdmin?: boolean } = { allowAdmin: true }) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) return next(ApiError.unauthorized('Authentication required'));
    if (options.allowAdmin !== false && user.role === 'admin') return next();

    if (user.role === 'builder' && !user.isRERAVerified) {
      return next(
        ApiError.forbidden(
          'RERA verification is pending. Submit your RERA number and documents for admin verification.',
        ),
      );
    }
    return next();
  };

/**
 * Guards a specific resource: the owning builder must hold a verified RERA
 * registration (admins and platform agents bypass the check).
 */
export const reraVerifiedResourceCheck =
  (resolver: (req: Request) => Promise<{ isRERAVerified: boolean; label: string } | null>) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<unknown> => {
    try {
      const user = req.user;
      if (!user) return next(ApiError.unauthorized('Authentication required'));
      if (user.role === 'admin') return next();

      const target = await resolver(req);
      if (!target) return next(ApiError.notFound('Resource not found'));
      if (!target.isRERAVerified) {
        return next(
          ApiError.forbidden(`${target.label} is awaiting admin RERA verification and cannot be used yet.`),
        );
      }
      return next();
    } catch (error) {
      return next(error as Error);
    }
  };