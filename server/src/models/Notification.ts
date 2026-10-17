import { Schema, type Document, type Model, type Types } from 'mongoose';
import { registerModel } from './User';

export type NotificationEvent =
  | 'inquiry_created'
  | 'site_visit_requested'
  | 'site_visit_confirmed'
  | 'site_visit_cancelled'
  | 'site_visit_completed'
  | 'site_visit_payment_received'
  | 'site_visit_payment_mismatch'
  | 'booking_created'
  | 'token_payment_successful'
  | 'builder_accepted_booking'
  | 'documents_requested'
  | 'documents_uploaded'
  | 'documents_verified'
  | 'escrow_released'
  | 'refund_processed'
  | 'loan_status_changed'
  | 'review_moderated'
  | 'project_approved'
  | 'rera_verified'
  | 'kyc_verified';

export type DeliveryChannel = 'email' | 'sms' | 'in_app';

export interface INotification extends Document {
  recipientId: Types.ObjectId;
  event: NotificationEvent;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  readAt?: Date;
  channels: DeliveryChannel[];
  delivery: Array<{
    channel: DeliveryChannel;
    status: 'queued' | 'sent' | 'failed' | 'skipped';
    providerMessageId?: string;
    error?: string;
    at: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    event: { type: String, required: true, enum: [
      'inquiry_created',
      'site_visit_requested',
      'site_visit_confirmed',
      'site_visit_cancelled',
      'site_visit_completed',
      'site_visit_payment_received',
      'site_visit_payment_mismatch',
      'booking_created',
      'token_payment_successful',
      'builder_accepted_booking',
      'documents_requested',
      'documents_uploaded',
      'documents_verified',
      'escrow_released',
      'refund_processed',
      'loan_status_changed',
      'review_moderated',
      'project_approved',
      'rera_verified',
      'kyc_verified',
    ], index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    read: { type: Boolean, default: false, index: true },
    readAt: Date,
    channels: { type: [String], default: ['in_app'] },
    delivery: {
      type: [
        new Schema(
          {
            channel: { type: String, enum: ['email', 'sms', 'in_app'] },
            status: { type: String, enum: ['queued', 'sent', 'failed', 'skipped'] },
            providerMessageId: String,
            error: String,
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

notificationSchema.index({ recipientId: 1, read: 1, createdAt: -1 });

export const Notification: Model<INotification> =
  registerModel<INotification>('Notification', notificationSchema);