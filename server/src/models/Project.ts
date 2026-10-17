import { Schema, type Document, type Model, type Types } from 'mongoose';
import { registerModel } from './User';

export type Tier = 'budget' | 'mid' | 'luxury';
export type ProjectStatus = 'new_launch' | 'under_construction' | 'ready_to_move';

export interface MediaItem {
  url: string;
  publicId?: string;
  caption?: string;
  kind?: 'image' | 'floor_plan' | 'brochure' | 'video' | 'tour360' | 'document';
}

export interface IProject extends Document {
  builderId: Types.ObjectId;
  builderName: string;
  agentId?: Types.ObjectId;
  projectName: string;
  slug: string;
  description?: string;
  city: string;
  locality: string;
  fullAddress: string;
  geo: { lat: number; lng: number };
  reraNumber?: string;
  isRERAVerified: boolean;
  reraVerifiedAt?: Date;
  reraDocuments: MediaItem[];
  tierStats: { budget: number; mid: number; luxury: number };
  amenities: Types.ObjectId[];
  possessionDate: Date;
  status: ProjectStatus;
  /** Set true only by an admin via /admin/approve-project/:id */
  isApproved: boolean;
  approvedAt?: Date;
  approvedBy?: Types.ObjectId;
  rejectedReason?: string;
  images: MediaItem[];
  floorPlans: MediaItem[];
  brochureUrl?: string;
  tour360Url?: string;
  rating: { avg: number; count: number };
  totalFlats: number;
  availableFlats: number;
  minPrice: number;
  maxPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

const mediaSchema = new Schema<MediaItem>(
  {
    url: { type: String, required: true },
    publicId: String,
    caption: String,
    kind: { type: String, enum: ['image', 'floor_plan', 'brochure', 'video', 'tour360', 'document'], default: 'image' },
  },
  { _id: false },
);

const projectSchema = new Schema<IProject>(
  {
    builderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    builderName: { type: String, required: true, trim: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    projectName: { type: String, required: [true, 'Project name is required'], trim: true, maxlength: 160 },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    description: { type: String, trim: true, maxlength: 4000 },
    city: { type: String, required: [true, 'City is required'], trim: true, index: true },
    locality: { type: String, required: [true, 'Locality is required'], trim: true, index: true },
    fullAddress: { type: String, required: [true, 'Full address is required'], trim: true, maxlength: 500 },
    geo: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      _id: false,
    },
    reraNumber: { type: String, trim: true, uppercase: true },
    // Only admins may flip this flag — enforced at the route layer and by
    // stripping the field from every non-admin payload.
    isRERAVerified: { type: Boolean, default: false, index: true },
    reraVerifiedAt: Date,
    reraDocuments: { type: [mediaSchema], default: [] },
    tierStats: {
      budget: { type: Number, default: 0 },
      mid: { type: Number, default: 0 },
      luxury: { type: Number, default: 0 },
      _id: false,
    },
    amenities: [{ type: Schema.Types.ObjectId, ref: 'Amenity', index: true }],
    possessionDate: { type: Date, required: [true, 'Possession date is required'], index: true },
    status: {
      type: String,
      enum: ['new_launch', 'under_construction', 'ready_to_move'],
      default: 'new_launch',
      index: true,
    },
    isApproved: { type: Boolean, default: false, index: true },
    approvedAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedReason: String,
    images: { type: [mediaSchema], default: [] },
    floorPlans: { type: [mediaSchema], default: [] },
    brochureUrl: String,
    tour360Url: String,
    rating: {
      avg: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
      _id: false,
    },
    totalFlats: { type: Number, default: 0 },
    availableFlats: { type: Number, default: 0 },
    minPrice: { type: Number, default: 0 },
    maxPrice: { type: Number, default: 0 },
  },
  { timestamps: true },
);

projectSchema.index({ city: 1, locality: 1, isApproved: 1 });
projectSchema.index({ projectName: 'text', locality: 'text', city: 'text' });

export const Project: Model<IProject> = registerModel<IProject>('Project', projectSchema);