import { Schema, type Document, type Model, type Types } from 'mongoose';
import { registerModel } from './User';

/**
 * Hashed refresh tokens, one row per issued token so logout / rotation can
 * revoke a specific session without touching the access token.
 */
export interface IRefreshToken extends Document {
  userId: Types.ObjectId;
  tokenHash: string;
  userAgent?: string;
  ip?: string;
  expiresAt: Date;
  revokedAt?: Date;
  revokedReason?: string;
  familyId?: string;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    userAgent: String,
    ip: String,
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokedReason: String,
    familyId: String,
  },
  { timestamps: true },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ userId: 1, revokedAt: 1 });

export const RefreshToken: Model<IRefreshToken> =
  registerModel<IRefreshToken>('RefreshToken', refreshTokenSchema);