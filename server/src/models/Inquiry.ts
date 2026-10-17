import { Schema, type Document, type Model, type Types } from 'mongoose';
import { registerModel } from './User';

export type InquiryStatus = 'new' | 'contacted' | 'visit_booked' | 'booked' | 'closed';

/** Stage 1 of the funnel: buyer clicks "Interested" on a flat. */
export interface IInquiry extends Document {
  flatId: Types.ObjectId;
  projectId: Types.ObjectId;
  buyerId: Types.ObjectId;
  builderId: Types.ObjectId;
  agentId?: Types.ObjectId;
  message?: string;
  loanAssistanceRequired: boolean;
  status: InquiryStatus;
  visitId?: Types.ObjectId;
  bookingId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const inquirySchema = new Schema<IInquiry>(
  {
    flatId: { type: Schema.Types.ObjectId, ref: 'Flat', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    builderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    message: { type: String, trim: true, maxlength: 500 },
    loanAssistanceRequired: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['new', 'contacted', 'visit_booked', 'booked', 'closed'],
      default: 'new',
      index: true,
    },
    visitId: { type: Schema.Types.ObjectId, ref: 'SiteVisit' },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
  },
  { timestamps: true },
);

inquirySchema.index({ buyerId: 1, flatId: 1 });
inquirySchema.index({ builderId: 1, status: 1, createdAt: -1 });

export const Inquiry: Model<IInquiry> = registerModel<IInquiry>('Inquiry', inquirySchema);