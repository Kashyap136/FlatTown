import { Schema, type Document, type Model } from 'mongoose';
import { registerModel } from './User';

export interface ILoanPartner extends Document {
  name: string;
  code: string;
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  interestRateMin: number;
  interestRateMax: number;
  maxTenureYears: number;
  minLoanAmount: number;
  maxLoanAmount: number;
  /** Fee the platform receives per converted lead. */
  leadFeeAmount: number;
  activeLoans: number;
  avgDisbursalDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const loanPartnerSchema = new Schema<ILoanPartner>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    logoUrl: String,
    contactEmail: String,
    contactPhone: String,
    interestRateMin: { type: Number, default: 8.5 },
    interestRateMax: { type: Number, default: 11.5 },
    maxTenureYears: { type: Number, default: 20 },
    minLoanAmount: { type: Number, default: 500000 },
    maxLoanAmount: { type: Number, default: 100000000 },
    leadFeeAmount: { type: Number, default: 5000, min: 0 },
    activeLoans: { type: Number, default: 0 },
    avgDisbursalDays: { type: Number, default: 45 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const LoanPartner: Model<ILoanPartner> =
  registerModel<ILoanPartner>('LoanPartner', loanPartnerSchema);