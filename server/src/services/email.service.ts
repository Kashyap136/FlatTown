import nodemailer, { type Transporter } from 'nodemailer';
import {
  env,
} from '../config/env';
import { createLogger } from '../utils/logger';

const log = createLogger('email');

/**
 * Email transport via Nodemailer.
 *
 * When SMTP is not configured the mailer falls back to a console transport in
 * development so the notification pipeline stays observable, and is a no-op in
 * production (with an explicit warning) rather than pretending to deliver.
 */

let transporter: Transporter | null = null;

export const isEmailConfigured = (): boolean =>
  env.smtpHost.length > 0 && env.smtpUser.length > 0 && env.smtpPass.length > 0;

const getTransporter = (): Transporter => {
  if (transporter) return transporter;
  if (isEmailConfigured()) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: { user: env.smtpUser, pass: env.smtpPass },
    });
  } else {
    transporter = nodemailer.createTransport({ jsonTransport: true });
    if (env.isProd) {
      log.warn('SMTP not configured — emails will not be delivered');
    }
  }
  return transporter;
};

export interface MailResult {
  delivered: boolean;
  simulated: boolean;
  messageId?: string;
  error?: string;
}

export const sendMail = async (input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<MailResult> => {
  try {
    const info = await getTransporter().sendMail({
      from: env.emailFrom,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? input.html.replace(/<[^>]+>/g, ' '),
    });
    const simulated = !isEmailConfigured();
    if (simulated) {
      log.info(`[simulated] to=${input.to} subject="${input.subject}"`);
    }
    return { delivered: true, simulated, messageId: info.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    log.error(`failed to send to ${input.to}: ${message}`);
    return { delivered: false, simulated: false, error: message };
  }
};

export const renderTemplate = (input: {
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  footer?: string;
}): string => {
  const base = env.frontendUrl;
  const paragraphs = input.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">${p}</p>`)
    .join('');
  const cta = input.cta
    ? `<p style="margin:22px 0;"><a href="${input.cta.url.startsWith('http') ? input.cta.url : base + input.cta.url}" style="background:#0f766e;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">${input.cta.label}</a></p>`
    : '';

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:28px 18px;">
      <div style="background:#ffffff;border-radius:14px;border:1px solid #e2e8f0;padding:26px;">
        <p style="margin:0 0 18px;font-size:15px;font-weight:700;letter-spacing:.14em;color:#0f766e;">FLAT TOWN</p>
        <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a;">${input.heading}</h1>
        ${paragraphs}
        ${cta}
        <p style="margin:22px 0 0;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:14px;">
          ${input.footer ?? 'This email was sent by Flat Town. Verified flats. Real prices. No resale.'}
        </p>
      </div>
    </div>
  </body>
</html>`;
};

export const money = (value: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    value || 0,
  );