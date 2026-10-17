import { Schema, type Document, type Model, type Types } from 'mongoose';
import { registerModel } from './User';

export type VisitStatus = 'requested' | 'confirmed' | 'completed' | 'cancelled';
export type PaymentStatus = 'not_required' | 'pending' | 'paid' | 'failed' | 'refunded';

export interface ISiteVisit extends Document {
  reference: string;
  flatId: Types.ObjectId;
  projectId: Types.ObjectId;
  buyerId: Types.ObjectId;
  builderId: Types.ObjectId;
  agentId?: Types.ObjectId;
  status: VisitStatus;
  slot: { date: Date; time: string };
  /** Visit charge is 100% refundable on booking and paid to the platform. */
  visitCharge: number;
  paymentStatus: PaymentStatus;
  payment?: {
    orderId: string;
    paymentId: string;
    signature: string;
    gateway: 'razorpay' | 'mock';
    amount: number;
    paidAt?: Date;
    refundId?: string;
  };
  requirements?: string;
  loanAssistanceRequired: boolean;
  visitorCount: number;
  builderNotes?: string;
  cancellationReason?: string;
  reminderSentAt?: Date;
  /** Set once the visit converts into a token booking. */
  bookingId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const siteVisitSchema = new Schema<ISiteVisit>(
  {
    reference: { type: String, unique: true, index: true },
    flatId: { type: Schema.Types.ObjectId, ref: 'Flat', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    builderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    status: {
      type: String,
      enum: ['requested', 'confirmed', 'completed', 'cancelled'],
      default: 'requested',
      index: true,
    },
    slot: {
      date: { type: Date, required: [true, 'Visit date is required'], index: true },
      time: { type: String, required: [true, 'Visit time slot is required'] },
      _id: false,
    },
    visitCharge: { type: Number, default: 0, min: 0 },
    paymentStatus: {
      type: String,
      enum: ['not_required', 'pending', 'paid', 'failed', 'refunded'],
      default: 'not_required',
      index: true,
    },
    payment: {
      orderId: String,
      paymentId: String,
      signature: String,
      gateway: { type: String, enum: ['razorpay', 'mock'] },
      amount: Number,
      paidAt: Date,
      refundId: String,
      _id: false,
    },
    requirements: { type: String, trim: true, maxlength: 500 },
    loanAssistanceRequired: { type: Boolean, default: false },
    visitorCount: { type: Number, default: 1, min: 1, max: 10 },
    builderNotes: { type: String, trim: true, maxlength: 500 },
    cancellationReason: { type: String, trim: true, maxlength: 300 },
    reminderSentAt: Date,
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', index: true },
  },
  { timestamps: true },
);

// `slot.date` is already indexed by the path-level `index: true`.
siteVisitSchema.index({ builderId: 1, 'slot.date': 1, status: 1 });
// One live visit per buyer per flat slot prevents accidental double booking.
siteVisitSchema.index(
  { flatId: 1, buyerId: 1, 'slot.date': 1, 'slot.time': 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['requested', 'confirmed'] } } },
);

siteVisitSchema.pre('validate', function assignReference(next) {
  if (!this.reference) {
    this.reference = `SV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }
  next();
});

export const SiteVisit: Model<ISiteVisit> = registerModel<ISiteVisit>('SiteVisit', siteVisitSchema);