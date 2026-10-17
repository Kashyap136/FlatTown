import { Schema, type Document, type Model, type Types } from 'mongoose';
import { registerModel } from './User';

export interface IRequirement extends Document {
  buyerId: Types.ObjectId;
  bhk?: number;
  budgetMin: number;
  budgetMax: number;
  city: string;
  locality?: string;
  loanNeeded: boolean;
  preferredTiers?: string[];
  amenities?: Types.ObjectId[];
  possessionPreference?: string[];
  notes?: string;
  matchCount: number;
  lastMatchedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const requirementSchema = new Schema<IRequirement>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bhk: { type: Number, enum: [1, 2, 3, 4] },
    budgetMin: { type: Number, required: true, min: 0, default: 0 },
    budgetMax: { type: Number, required: true, min: 0 },
    city: { type: String, required: [true, 'City is required'], trim: true, index: true },
    locality: { type: String, trim: true },
    loanNeeded: { type: Boolean, default: false },
    preferredTiers: { type: [String], default: [] },
    amenities: [{ type: Schema.Types.ObjectId, ref: 'Amenity' }],
    possessionPreference: { type: [String], default: [] },
    notes: { type: String, trim: true, maxlength: 500 },
    matchCount: { type: Number, default: 0 },
    lastMatchedAt: Date,
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

requirementSchema.index({ buyerId: 1, isActive: 1 });
requirementSchema.index({ city: 1, budgetMax: 1, budgetMin: 1 });

requirementSchema.pre('validate', function normalise(next) {
  if (!this.budgetMin || this.budgetMin < 0) this.budgetMin = 0;
  if (this.budgetMax < this.budgetMin) this.budgetMax = this.budgetMin;
  next();
});

export const Requirement: Model<IRequirement> =
  registerModel<IRequirement>('Requirement', requirementSchema);