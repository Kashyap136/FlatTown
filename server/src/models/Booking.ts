import { Schema, type Document, type Model, type Types } from 'mongoose';
import { registerModel } from './User';

export type EscrowStatus =
  | 'created'
  | 'token_paid'
  | 'builder_accepted'
  | 'docs_pending'
  | 'completed'
  | 'refunded';

export type LoanStatus = 'not_needed' | 'applied' | 'approved' | 'rejected';

export interface BookingDocument {
  type: 'aadhaar' | 'pan' | 'loan_approval' | 'salary_proof' | 'bank_statement' | 'other';
  url: string;
  publicId?: string;
  verified: boolean;
  verifiedBy?: Types.ObjectId;
  verifiedAt?: Date;
  rejectionReason?: string;
  uploadedAt: Date;
}

export interface EscrowLedgerEntry {
  type: 'token_received' | 'commission_booked' | 'escrow_released' | 'refund' | 'adjustment';
  amount: number;
  note?: string;
  by?: Types.ObjectId;
  at: Date;
}

export interface IBooking extends Document {
  reference: string;
  flatId: Types.ObjectId;
  projectId: Types.ObjectId;
  buyerId: Types.ObjectId;
  builderId: Types.ObjectId;
  agentId?: Types.ObjectId;
  /** Snapshot of the flat price at booking time (server-calculated). */
  totalPrice: number;
  sizeSqft: number;
  pricePerSqft: number;
  tier: string;
  tokenAmount: number;
  /** commissionAmount = tokenAmount * commissionPercent — token only, never totalPrice. */
  commissionPercent: number;
  commissionAmount: number;
  escrowStatus: EscrowStatus;
  escrow: {
    status: EscrowStatus;
    heldAmount: number;
    releasedAmount: number;
    refundedAmount: number;
    releasedAt?: Date;
    releasedBy?: Types.ObjectId;
    builderAmount: number;
    platformAmount: number;
    agentAmount: number;
    agentSharePercent: number;
    accountId: string;
  };
  loanStatus: LoanStatus;
  loan: {
    required: boolean;
    status: LoanStatus;
    partnerId?: Types.ObjectId;
    partnerName?: string;
    leadFeeAmount: number;
    appliedAt?: Date;
    approvedAt?: Date;
    notes?: string;
  };
  documents: BookingDocument[];
  documentsRequested: Array<{ type: BookingDocument['type']; note?: string; requestedAt: Date; by?: Types.ObjectId }>;
  payment: {
    orderId: string;
    /** Populated only once the gateway confirms the capture. */
    paymentId?: string;
    /** Populated only once the client returns the checkout signature. */
    signature?: string;
    gateway: 'razorpay' | 'mock';
    amount: number;
    capturedAt?: Date;
  };
  refund?: {
    amount: number;
    refundId: string;
    reason?: string;
    gateway: 'razorpay' | 'mock';
    at: Date;
    by?: Types.ObjectId;
  };
  siteVisitId?: Types.ObjectId;
  statusHistory: Array<{ from: EscrowStatus; to: EscrowStatus; by?: Types.ObjectId; note?: string; at: Date }>;
  ledger: EscrowLedgerEntry[];
  completedAt?: Date;
  agreementUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<BookingDocument>(
  {
    type: {
      type: String,
      enum: ['aadhaar', 'pan', 'loan_approval', 'salary_proof', 'bank_statement', 'other'],
      required: true,
    },
    url: { type: String, required: true },
    publicId: String,
    verified: { type: Boolean, default: false },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: Date,
    rejectionReason: String,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ledgerSchema = new Schema<EscrowLedgerEntry>(
  {
    type: {
      type: String,
      enum: ['token_received', 'commission_booked', 'escrow_released', 'refund', 'adjustment'],
      required: true,
    },
    amount: { type: Number, required: true },
    note: String,
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const bookingSchema = new Schema<IBooking>(
  {
    reference: { type: String, unique: true, index: true },
    flatId: { type: Schema.Types.ObjectId, ref: 'Flat', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    builderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    totalPrice: { type: Number, required: true, min: 0 },
    sizeSqft: { type: Number, required: true },
    pricePerSqft: { type: Number, required: true },
    tier: { type: String, required: true },
    tokenAmount: { type: Number, required: true, min: 1 },
    commissionPercent: { type: Number, required: true, min: 0 },
    /** Token × commission% — the ONLY basis for platform commission. */
    commissionAmount: { type: Number, required: true, min: 0 },
    escrowStatus: {
      type: String,
      enum: ['created', 'token_paid', 'builder_accepted', 'docs_pending', 'completed', 'refunded'],
      default: 'created',
      index: true,
    },
    escrow: {
      status: {
        type: String,
        enum: ['created', 'token_paid', 'builder_accepted', 'docs_pending', 'completed', 'refunded'],
        default: 'created',
      },
      heldAmount: { type: Number, default: 0 },
      releasedAmount: { type: Number, default: 0 },
      refundedAmount: { type: Number, default: 0 },
      releasedAt: Date,
      releasedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      builderAmount: { type: Number, default: 0 },
      platformAmount: { type: Number, default: 0 },
      agentAmount: { type: Number, default: 0 },
      agentSharePercent: { type: Number, default: 0 },
      accountId: { type: String, default: 'flattown-escrow' },
      _id: false,
    },
    loanStatus: {
      type: String,
      enum: ['not_needed', 'applied', 'approved', 'rejected'],
      default: 'not_needed',
      index: true,
    },
    loan: {
      required: { type: Boolean, default: false },
      status: { type: String, enum: ['not_needed', 'applied', 'approved', 'rejected'], default: 'not_needed' },
      partnerId: { type: Schema.Types.ObjectId, ref: 'LoanPartner' },
      partnerName: String,
      leadFeeAmount: { type: Number, default: 0 },
      appliedAt: Date,
      approvedAt: Date,
      notes: String,
      _id: false,
    },
    documents: { type: [documentSchema], default: [] },
    documentsRequested: {
      type: [
        new Schema(
          {
            type: {
              type: String,
              enum: ['aadhaar', 'pan', 'loan_approval', 'salary_proof', 'bank_statement', 'other'],
              required: true,
            },
            note: String,
            requestedAt: { type: Date, default: Date.now },
            by: { type: Schema.Types.ObjectId, ref: 'User' },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    /**
     * Payment detail is written one step after the booking is created (the
     * gateway order only exists once the token amount is settled), so these
     * fields are required from the first *paid* state onwards rather than at
     * creation time. The booking controller is the only writer and sets them
     * together.
     */
    payment: {
      orderId: {
        type: String,
        required: [
          function paymentOrderRequired(this: IBooking): boolean {
            return this.escrowStatus !== 'created';
          },
          'A payment order is required once the token has been paid',
        ],
      },
      paymentId: String,
      signature: String,
      gateway: { type: String, enum: ['razorpay', 'mock'] },
      amount: {
        type: Number,
        required: [
          function paymentAmountRequired(this: IBooking): boolean {
            return this.escrowStatus !== 'created';
          },
          'The captured amount is required once the token has been paid',
        ],
      },
      capturedAt: Date,
      _id: false,
    },
    refund: {
      amount: Number,
      refundId: String,
      reason: String,
      gateway: { type: String, enum: ['razorpay', 'mock'] },
      at: Date,
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      _id: false,
    },
    siteVisitId: { type: Schema.Types.ObjectId, ref: 'SiteVisit' },
    statusHistory: {
      type: [
        new Schema(
          {
            from: { type: String },
            to: { type: String, required: true },
            by: { type: Schema.Types.ObjectId, ref: 'User' },
            note: String,
            at: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    ledger: { type: [ledgerSchema], default: [] },
    completedAt: Date,
    agreementUrl: String,
  },
  { timestamps: true },
);

// Spec-mandated indexes.
bookingSchema.index({ buyerId: 1, escrowStatus: 1 });
bookingSchema.index({ createdAt: -1 });
// A buyer cannot hold two live bookings on the same flat.
bookingSchema.index(
  { flatId: 1, buyerId: 1 },
  { unique: true, partialFilterExpression: { escrowStatus: { $in: ['created', 'token_paid', 'builder_accepted', 'docs_pending'] } } },
);

bookingSchema.pre('validate', function assignReference(next) {
  if (!this.reference) {
    this.reference = `BK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }
  next();
});

export const Booking: Model<IBooking> = registerModel<IBooking>('Booking', bookingSchema);