import { Schema, type Document, type Model, type Types } from 'mongoose';
import { registerModel } from './User';

/**
 * Single-document platform configuration controlled by admins.
 * Backs tier thresholds, commission percentage and the agent/platform split.
 */
export interface IPlatformConfig extends Document {
  key: 'default';
  tiers: { budgetMax: number; midMax: number };
  commission: {
    /** Percentage charged on the booking token. */
    bookingTokenPercent: number;
    /** When an agent is involved: platform share of the commission. */
    agentPlatformPercent: number;
    agentAgentPercent: number;
    /** Optional per-agent override of the agent share, in percent of commission. */
    allowPerAgentOverride: boolean;
  };
  visits: {
    /** Builders verified by admin get the first N visits free. */
    freeVisitsForVerifiedBuilders: number;
    freeVisitsForAll: number;
    allowedCharges: number[];
    chargeGoesToPlatform: boolean;
    refundableOnBooking: boolean;
  };
  booking: {
    defaultTokenAmount: number;
    allowedTokenAmounts: number[];
    escrowAccountId: string;
    requireDocumentsBeforeRelease: boolean;
  };
  loan: {
    enabled: boolean;
    defaultLeadFee: number;
  };
  cities: Array<{ name: string; localities: string[]; isActive: boolean }>;
  updatedBy?: Types.ObjectId;
  updatedAt: Date;
}

const platformConfigSchema = new Schema<IPlatformConfig>(
  {
    key: { type: String, default: 'default', unique: true, immutable: true },
    tiers: {
      budgetMax: { type: Number, default: 5_000_000, min: 1 },
      midMax: { type: Number, default: 15_000_000, min: 1 },
      _id: false,
    },
    commission: {
      bookingTokenPercent: { type: Number, default: 10, min: 0, max: 100 },
      agentPlatformPercent: { type: Number, default: 70, min: 0, max: 100 },
      agentAgentPercent: { type: Number, default: 30, min: 0, max: 100 },
      // Off by default: an agent's share only deviates from the global
      // agentPlatformPercent when an admin has explicitly enabled overrides
      // AND set a value via PUT /admin/agents/:id/commission.
      allowPerAgentOverride: { type: Boolean, default: false },
      _id: false,
    },
    visits: {
      freeVisitsForVerifiedBuilders: { type: Number, default: 2, min: 0 },
      freeVisitsForAll: { type: Number, default: 0, min: 0 },
      allowedCharges: { type: [Number], default: [0, 199, 499] },
      chargeGoesToPlatform: { type: Boolean, default: true },
      refundableOnBooking: { type: Boolean, default: true },
      _id: false,
    },
    booking: {
      defaultTokenAmount: { type: Number, default: 50_000, min: 1000 },
      allowedTokenAmounts: { type: [Number], default: [50_000, 100_000, 200_000, 500_000] },
      escrowAccountId: { type: String, default: 'flattown-escrow' },
      requireDocumentsBeforeRelease: { type: Boolean, default: true },
      _id: false,
    },
    loan: {
      enabled: { type: Boolean, default: true },
      defaultLeadFee: { type: Number, default: 0, min: 0 },
      _id: false,
    },
    cities: {
      type: [
        new Schema(
          {
            name: { type: String, required: true },
            localities: { type: [String], default: [] },
            isActive: { type: Boolean, default: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const PlatformConfig: Model<IPlatformConfig> =
  registerModel<IPlatformConfig>('PlatformConfig', platformConfigSchema);