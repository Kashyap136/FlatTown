import { Schema, type Document, type Model, type Types } from 'mongoose';
import { registerModel } from './User';

export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'rejected';

export interface IDispute extends Document {
  raisedBy: Types.ObjectId;
  raisedByRole: string;
  against?: Types.ObjectId;
  bookingId?: Types.ObjectId;
  siteVisitId?: Types.ObjectId;
  flatId?: Types.ObjectId;
  subject: string;
  description: string;
  category: 'payment' | 'escrow' | 'documents' | 'site_visit' | 'misrepresentation' | 'other';
  status: DisputeStatus;
  resolution?: string;
  resolvedBy?: Types.ObjectId;
  resolvedAt?: Date;
  messages: Array<{ by: Types.ObjectId; role: string; message: string; at: Date }>;
  createdAt: Date;
  updatedAt: Date;
}

const disputeSchema = new Schema<IDispute>(
  {
    raisedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    raisedByRole: { type: String, required: true },
    against: { type: Schema.Types.ObjectId, ref: 'User' },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', index: true },
    siteVisitId: { type: Schema.Types.ObjectId, ref: 'SiteVisit' },
    flatId: { type: Schema.Types.ObjectId, ref: 'Flat' },
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    category: {
      type: String,
      enum: ['payment', 'escrow', 'documents', 'site_visit', 'misrepresentation', 'other'],
      default: 'other',
      index: true,
    },
    status: { type: String, enum: ['open', 'under_review', 'resolved', 'rejected'], default: 'open', index: true },
    resolution: { type: String, trim: true, maxlength: 2000 },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
    messages: {
      type: [
        new Schema(
          {
            by: { type: Schema.Types.ObjectId, ref: 'User' },
            role: String,
            message: String,
            at: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

disputeSchema.index({ status: 1, createdAt: -1 });

export const Dispute: Model<IDispute> = registerModel<IDispute>('Dispute', disputeSchema);