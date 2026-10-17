import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * Hot-reload safe model resolution (avoids OverwriteModelError under nodemon).
 *
 * Note: `mongoose.model()` is called WITHOUT a generic here and the result is
 * cast once. Invoking `mongoose.model<T>()` with an unconstrained `T` makes
 * TypeScript resolve every `Model` overload against an open type variable,
 * which blows the compiler heap on this schema set.
 */
export const registry = mongoose.models as unknown as Record<string, Model<any>>;

export const registerModel = <T>(name: string, schema: Schema): Model<T> => {
  const existing = registry[name] as Model<T> | undefined;
  if (existing) return existing;
  return mongoose.model(name, schema) as Model<T>;
};

export type UserRole = 'builder' | 'buyer' | 'agent' | 'admin';

export interface KycDoc {
  type: string;
  url: string;
  publicId?: string;
  verified: boolean;
  uploadedAt: Date;
  rejectionReason?: string;
}

export interface RatingSummary {
  avg: number;
  count: number;
}

/** New builders start at 3.5 so they are discoverable but not over-ranked. */
export const DEFAULT_BUILDER_RATING = 3.5;

export interface IUser extends Document {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
  avatar?: string;
  companyName?: string;
  bio?: string;
  isVerified: boolean;
  verificationRequestedAt?: Date;
  verifiedAt?: Date;
  isAdminVerified: boolean;
  isRERAVerified: boolean;
  reraNumber?: string;
  reraVerifiedAt?: Date;
  reraRejectionReason?: string;
  reraState?: string;
  kycDocs: KycDoc[];
  kycStatus: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  rating: RatingSummary;
  /** Commission share configuration for agents (override of platform default). */
  commissionSharePercent?: number;
  location: { city?: string; locality?: string; pincode?: string };
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const kycDocSchema = new Schema<KycDoc>(
  {
    type: { type: String, required: true, trim: true },
    url: { type: String, required: true },
    publicId: String,
    verified: { type: Boolean, default: false },
    uploadedAt: { type: Date, default: Date.now },
    rejectionReason: String,
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 120 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      unique: true,
      trim: true,
      index: true,
    },
    password: { type: String, required: true, minlength: 8, select: false },
    role: {
      type: String,
      enum: ['builder', 'buyer', 'agent', 'admin'],
      default: 'buyer',
      index: true,
    },
    avatar: String,
    companyName: { type: String, trim: true },
    bio: { type: String, trim: true, maxlength: 1000 },
    isVerified: { type: Boolean, default: false },
    verificationRequestedAt: Date,
    verifiedAt: Date,
    isAdminVerified: { type: Boolean, default: false },
    isRERAVerified: { type: Boolean, default: false, index: true },
    reraNumber: { type: String, trim: true, uppercase: true },
    reraVerifiedAt: Date,
    reraRejectionReason: String,
    reraState: String,
    kycDocs: { type: [kycDocSchema], default: [] },
    kycStatus: {
      type: String,
      enum: ['not_submitted', 'pending', 'approved', 'rejected'],
      default: 'not_submitted',
    },
    rating: {
      avg: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
      _id: false,
    },
    commissionSharePercent: { type: Number, min: 0, max: 100 },
    location: {
      city: { type: String, trim: true, index: true },
      locality: { type: String, trim: true },
      pincode: { type: String, trim: true },
      _id: false,
    },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

// Mandatory indexes from the specification.
// `location.city` is already indexed by the path-level `index: true`.
userSchema.index({ 'rating.avg': -1 });
userSchema.index({ isRERAVerified: -1, 'rating.avg': -1 });

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

export const User: Model<IUser> = registerModel<IUser>('User', userSchema);

export type { Types };