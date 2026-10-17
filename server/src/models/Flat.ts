import { Schema, type Document, type Model, type Types } from 'mongoose';
import { registerModel } from './User';
import { calcTotal, calcTier, type Tier } from '../utils/tierCalculator';
import { getPricingContext } from '../utils/pricingContext';

export type FlatType = 'apartment' | 'villa' | 'penthouse';
export type Facing = 'east' | 'west' | 'north' | 'south' | 'north_east' | 'north_west' | 'south_east' | 'south_west';

export interface MediaItem {
  url: string;
  publicId?: string;
  caption?: string;
  kind?: 'image' | 'floor_plan' | 'video' | 'tour360';
}

export interface IFlat extends Document {
  projectId: Types.ObjectId;
  builderId: Types.ObjectId;
  agentId?: Types.ObjectId;
  title: string;
  bhk: number;
  type: FlatType;
  sizeSqft: number;
  pricePerSqft: number;
  floorRise: number;
  parkingCharges: number;
  /** Server-calculated: sizeSqft * pricePerSqft + floorRise + parkingCharges */
  totalPrice: number;
  /** Server-calculated from totalPrice using admin tier thresholds. */
  tier: Tier;
  floor: number;
  tower?: string;
  facing?: Facing;
  amenities: Types.ObjectId[];
  possessionDate: Date;
  isAvailable: boolean;
  visitCharge: number;
  tokenAmount: number;
  /** Commission % on the token (platform level default, per-flat override). */
  commissionPercent: number;
  images: MediaItem[];
  floorPlan?: MediaItem;
  tour360Url?: string;
  /** Count of accepted site visits — free-visit allowance is tracked on the builder. */
  visitCount: number;
  views: number;
  inquiriesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const mediaSchema = new Schema<MediaItem>(
  {
    url: { type: String, required: true },
    publicId: String,
    caption: String,
    kind: { type: String, enum: ['image', 'floor_plan', 'video', 'tour360'], default: 'image' },
  },
  { _id: false },
);

const flatSchema = new Schema<IFlat>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    builderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 140 },
    bhk: { type: Number, required: true, enum: [1, 2, 3, 4], index: true },
    type: { type: String, enum: ['apartment', 'villa', 'penthouse'], default: 'apartment', index: true },
    sizeSqft: { type: Number, required: [true, 'Size in sqft is required'], min: [200, 'Minimum size is 200 sqft'], max: 20000, index: true },
    pricePerSqft: { type: Number, required: [true, 'Price per sqft is required'], min: [100, 'Minimum rate is ₹100/sqft'], index: true },
    floorRise: { type: Number, default: 0, min: 0 },
    parkingCharges: { type: Number, default: 0, min: 0 },
    totalPrice: { type: Number, required: true, min: 0, index: true },
    tier: { type: String, enum: ['budget', 'mid', 'luxury'], required: true, index: true },
    floor: { type: Number, required: [true, 'Floor is required'], min: 0, max: 200 },
    tower: { type: String, trim: true },
    facing: {
      type: String,
      enum: ['east', 'west', 'north', 'south', 'north_east', 'north_west', 'south_east', 'south_west'],
    },
    amenities: [{ type: Schema.Types.ObjectId, ref: 'Amenity', index: true }],
    possessionDate: { type: Date, required: true, index: true },
    isAvailable: { type: Boolean, default: true, index: true },
    visitCharge: { type: Number, default: 0, min: 0 },
    tokenAmount: { type: Number, default: 50000, min: 1000 },
    commissionPercent: { type: Number, default: 10, min: 0, max: 100 },
    images: { type: [mediaSchema], default: [] },
    floorPlan: mediaSchema,
    tour360Url: String,
    visitCount: { type: Number, default: 0 },
    views: { type: Number, default: 0, index: true },
    inquiriesCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Spec-mandated indexes.
// Compound index used by the discovery endpoint's most common filters.
flatSchema.index({ isAvailable: 1, tier: 1, totalPrice: 1 });
flatSchema.index({ isAvailable: 1, bhk: 1, totalPrice: 1 });
flatSchema.index({ projectId: 1, isAvailable: 1 });
flatSchema.index({ title: 'text', tower: 'text' });

/**
 * Financial fields are ALWAYS recomputed server-side.
 * The client cannot submit totalPrice / tier / commissionPercent and have them honoured.
 */
flatSchema.pre('validate', function recomputeFinancials(next) {
  const { thresholds } = getPricingContext();
  const sizeSqft = Number(this.sizeSqft) || 0;
  const pricePerSqft = Number(this.pricePerSqft) || 0;

  if (sizeSqft > 0 && pricePerSqft > 0) {
    this.totalPrice = calcTotal(sizeSqft, pricePerSqft, this.floorRise, this.parkingCharges);
    this.tier = calcTier(this.totalPrice as number, thresholds);
  }
  // Visit charge is restricted to the published options (0 / 199 / 499).
  const charge = Number(this.visitCharge ?? 0);
  this.visitCharge = [0, 199, 499].includes(charge) ? charge : 0;
  next();
});

export const Flat: Model<IFlat> = registerModel<IFlat>('Flat', flatSchema);