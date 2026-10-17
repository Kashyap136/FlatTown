import { env } from '../config/env';
import { createLogger } from '../utils/logger';

const log = createLogger('sms');

/**
 * Provider-agnostic SMS abstraction.
 *
 * The specification does not fix an SMS vendor, so the integration is defined
 * as an interface. A real vendor adapter can be registered with
 * `registerSmsProvider()` at boot without touching call sites. Until then the
 * built-in `log` provider records the message so the pipeline is testable.
 */

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsResult {
  delivered: boolean;
  simulated: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface SmsProvider {
  name: string;
  send(message: SmsMessage): Promise<SmsResult>;
}

const logProvider: SmsProvider = {
  name: 'log',
  async send(message) {
    log.info(`[simulated:${env.smsProvider}] to=${message.to} body="${message.body}"`);
    return { delivered: true, simulated: true, providerMessageId: `log_${Date.now()}` };
  },
};

let provider: SmsProvider = logProvider;

export const registerSmsProvider = (impl: SmsProvider): void => {
  provider = impl;
};

export const smsProviderName = (): string => provider.name;

export const sendSms = async (message: SmsMessage): Promise<SmsResult> => {
  if (!message.to) return { delivered: false, simulated: false, error: 'No destination number' };
  try {
    return await provider.send({ to: message.to, body: message.body.slice(0, 480) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'unknown error';
    console.error(`[sms] failed: ${msg}`);
    return { delivered: false, simulated: false, error: msg };
  }
};

export const isSmsConfigured = (): boolean => env.smsProvider !== 'log' && env.smsApiKey.length > 0;