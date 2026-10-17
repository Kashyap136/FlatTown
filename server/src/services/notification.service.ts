import type { Types } from 'mongoose';
import { Notification, type NotificationEvent } from '../models/Notification';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { renderTemplate, sendMail, type MailResult } from './email.service';
import { sendSms, type SmsResult } from './sms.service';

/**
 * Notification architecture.
 *
 * One entry point (`notify`) records an in-app notification (always persisted so
 * the UI has a single source of truth) and fans out to email/SMS. Delivery
 * failures are recorded but never roll back the business transaction that
 * triggered them.
 */

export interface NotifyInput {
  recipientId: string | Types.ObjectId;
  event: NotificationEvent;
  title: string;
  body: string;
  email?: { subject: string; cta?: { label: string; url: string } };
  sms?: string;
  data?: Record<string, unknown>;
  /** Skip email/SMS fan-out for purely internal events. */
  inAppOnly?: boolean;
}

export interface NotifyResult {
  notificationId: string;
  email?: MailResult;
  sms?: SmsResult;
}

export const notify = async (input: NotifyInput): Promise<NotifyResult> => {
  const recipientId = String(input.recipientId);
  const user = await User.findById(recipientId).select('email phone name');
  if (!user) throw ApiError.notFound('Notification recipient not found');

  const channels: Array<'email' | 'sms' | 'in_app'> = ['in_app'];
  if (!input.inAppOnly) {
    if (input.email) channels.push('email');
    if (input.sms) channels.push('sms');
  }

  const delivery: Array<{
    channel: 'email' | 'sms' | 'in_app';
    status: 'queued' | 'sent' | 'failed' | 'skipped';
    providerMessageId?: string;
    error?: string;
    at: Date;
  }> = [{ channel: 'in_app', status: 'sent', at: new Date() }];

  let emailResult: MailResult | undefined;
  let smsResult: SmsResult | undefined;

  if (input.email) {
    emailResult = await sendMail({
      to: user.email,
      subject: input.email.subject,
      html: renderTemplate({
        heading: input.title,
        paragraphs: [input.body, ...(input.email.cta ? [] : [])],
        cta: input.email.cta,
      }),
    });
    delivery.push({
      channel: 'email',
      status: emailResult.delivered ? 'sent' : 'failed',
      providerMessageId: emailResult.messageId,
      error: emailResult.error,
      at: new Date(),
    });
  }

  if (input.sms) {
    smsResult = await sendSms({ to: user.phone ?? '', body: input.sms });
    delivery.push({
      channel: 'sms',
      status: smsResult.delivered ? 'sent' : 'failed',
      providerMessageId: smsResult.providerMessageId,
      error: smsResult.error,
      at: new Date(),
    });
  }

  const notification = await Notification.create({
    recipientId: user._id,
    event: input.event,
    title: input.title,
    body: input.body,
    data: input.data,
    channels,
    delivery,
  });

  return { notificationId: String(notification._id), email: emailResult, sms: smsResult };
};

/** Best-effort fan-out: never throws into the caller's transaction. */
export const notifySafe = async (input: NotifyInput): Promise<void> => {
  try {
    await notify(input);
  } catch (error) {
    console.error('[notify] failed', error instanceof Error ? error.message : error);
  }
};

export const notifyMany = async (inputs: NotifyInput[]): Promise<void> => {
  await Promise.all(inputs.map((i) => notifySafe(i)));
};