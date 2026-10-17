import { Schema, type Document, type Model, type Types } from 'mongoose';
import { registerModel } from './User';

export interface IWishlist extends Document {
  buyerId: Types.ObjectId;
  flatId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const wishlistSchema = new Schema<IWishlist>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    flatId: { type: Schema.Types.ObjectId, ref: 'Flat', required: true, index: true },
  },
  { timestamps: true },
);

wishlistSchema.index({ buyerId: 1, flatId: 1 }, { unique: true });

export const Wishlist: Model<IWishlist> = registerModel<IWishlist>('Wishlist', wishlistSchema);