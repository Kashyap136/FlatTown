import { Schema, type Document, type Model, type Types } from 'mongoose';
import { registerModel } from './User';

/** Pre-booking home-loan leads (a booking-linked application lives on Booking). */
export interface ILoanApplication extends Document {
  buyerId: Types.ObjectId;
  flatId?: Types.ObjectId;
  bookingId?: Types.ObjectId;
  loanAmount?: number;
  employmentType?: 'salaried' | 'self_employed' | 'business' | 'other';
  annualIncome?: number;
  status: 'applied' | 'assigned' | 'approved' | 'rejected' | 'disbursed';
  partnerId?: Types.ObjectId;
  partnerName?: string;
  leadFeeAmount: number;
  notes?: string;
  decisionNote?: string;
  decidedBy?: Types.ObjectId;
  decidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const loanApplicationSchema = new Schema<ILoanApplication>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    flatId: { type: Schema.Types.ObjectId, ref: 'Flat', index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', index: true },
    loanAmount: { type: Number, min: 0 },
    employmentType: { type: String, enum: ['salaried', 'self_employed', 'business', 'other'] },
    annualIncome: { type: Number, min: 0 },
    status: {
      type: String,
      enum: ['applied', 'assigned', 'approved', 'rejected', 'disbursed'],
      default: 'applied',
      index: true,
    },
    partnerId: { type: Schema.Types.ObjectId, ref: 'LoanPartner' },
    partnerName: String,
    leadFeeAmount: { type: Number, default: 0, min: 0 },
    notes: String,
    decisionNote: String,
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
  },
  { timestamps: true },
);

loanApplicationSchema.index({ status: 1, createdAt: -1 });
loanApplicationSchema.index({ partnerId: 1, status: 1 });

export const LoanApplication: Model<ILoanApplication> =
  registerModel<ILoanApplication>('LoanApplication', loanApplicationSchema);