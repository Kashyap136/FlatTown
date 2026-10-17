import { AuditLog } from '../models/AuditLog';
import type { Request } from 'express';

export const audit = async (input: {
  action: string;
  entity: 'booking' | 'siteVisit' | 'payment' | 'escrow' | 'project' | 'user' | 'config' | 'dispute' | 'review';
  entityId: string;
  actorId?: string;
  actorRole?: string;
  amount?: number;
  metadata?: Record<string, unknown>;
  req?: Request;
}): Promise<void> => {
  try {
    await AuditLog.create({
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      amount: input.amount,
      metadata: input.metadata,
      ip: input.req?.ip,
      userAgent: input.req?.headers?.['user-agent'],
    });
  } catch (error) {
    console.error('[audit] failed to record entry', error);
  }
};