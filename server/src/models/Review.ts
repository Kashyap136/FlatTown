import { Schema, type Document, type Model, type Types } from 'mongoose';
import { registerModel } from './User';

export interface IReview extends Document {
  flatId?: Types.ObjectId;
  projectId?: Types.ObjectId;
  builderId: Types.ObjectId;
  buyerId: Types.ObjectId;
  bookingId?: Types.ObjectId;
  rating: number;
  /** Sub-scores feed the builder rating engine. */
  scores: {
    onTimePossession: number;
    constructionQuality: number;
    transparency: number;
  };
  comment: string;
  isVerifiedBooking: boolean;
  isPublished: boolean;
  moderation: {
    status: 'pending' | 'approved' | 'rejected';
    note?: string;
    by?: Types.ObjectId;
    at?: Date;
  };
  helpfulCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    flatId: { type: Schema.Types.ObjectId, ref: 'Flat', index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    builderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
    rating: { type: Number, required: [true, 'Rating is required'], min: 1, max: 5, index: true },
    scores: {
      onTimePossession: { type: Number, min: 1, max: 5, default: 5 },
      constructionQuality: { type: Number, min: 1, max: 5, default: 5 },
      transparency: { type: Number, min: 1, max: 5, default: 5 },
      _id: false,
    },
    comment: { type: String, required: [true, 'Comment is required'], trim: true, minlength: 10, maxlength: 1500 },
    isVerifiedBooking: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true, index: true },
    moderation: {
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
      note: String,
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      at: Date,
      _id: false,
    },
    helpfulCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

reviewSchema.index({ builderId: 1, isPublished: 1 });
reviewSchema.index({ flatId: 1, isPublished: 1 });
reviewSchema.index({ buyerId: 1, flatId: 1 }, { unique: true });

export const Review: Model<IReview> = registerModel<IReview>('Review', reviewSchema);