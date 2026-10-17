import { Schema, type Document, type Model } from 'mongoose';
import { registerModel } from './User';

export type AmenityCategory = 'lifestyle' | 'parking' | 'security' | 'wellness' | 'utility';

export interface IAmenity extends Document {
  name: string;
  slug: string;
  icon: string;
  category: AmenityCategory;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const amenitySchema = new Schema<IAmenity>(
  {
    name: { type: String, required: [true, 'Amenity name is required'], trim: true, unique: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    icon: { type: String, required: true, default: 'Sparkles' },
    category: {
      type: String,
      enum: ['lifestyle', 'parking', 'security', 'wellness', 'utility'],
      default: 'lifestyle',
      index: true,
    },
    description: { type: String, trim: true, maxlength: 300 },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

amenitySchema.index({ category: 1, isActive: 1 });

export const Amenity: Model<IAmenity> = registerModel<IAmenity>('Amenity', amenitySchema);