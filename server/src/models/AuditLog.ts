import { Schema, type Document, type Model, type Types } from 'mongoose';
import { registerModel } from './User';

/** Immutable audit trail for financial and verification actions. */
export interface IAuditLog extends Document {
  action: string;
  entity: 'booking' | 'siteVisit' | 'payment' | 'escrow' | 'project' | 'user' | 'config' | 'dispute' | 'review';
  entityId?: Types.ObjectId;
  actorId?: Types.ObjectId;
  actorRole?: string;
  amount?: number;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    action: { type: String, required: true, index: true },
    entity: { type: String, required: true, index: true },
    entityId: { type: Schema.Types.ObjectId, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorRole: String,
    amount: Number,
    metadata: { type: Schema.Types.Mixed },
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });

export const AuditLog: Model<IAuditLog> = registerModel<IAuditLog>('AuditLog', auditLogSchema);