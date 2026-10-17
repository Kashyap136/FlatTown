import { PlatformConfig } from '../models/PlatformConfig';
import { getPricingContext, setPricingContext } from '../utils/pricingContext';
import { sanitiseThresholds } from '../utils/tierCalculator';
import { invalidateConfig } from './cacheInvalidation';
import { createLogger } from '../utils/logger';

const log = createLogger('config');

/**
 * Loads the admin-managed PlatformConfig document into the in-memory pricing
 * context used by Mongoose validators and the booking/commission engine.
 */
export const loadPlatformConfig = async (): Promise<void> => {
  const ctx = getPricingContext();
  try {
    const config = await PlatformConfig.findOne({ key: 'default' }).lean();
    if (!config) {
      // Seed defaults from environment variables on first boot.
      const created = await PlatformConfig.create({ key: 'default' });
      setPricingContext({
        thresholds: { budget: created.tiers.budgetMax, mid: created.tiers.midMax },
        commissionPercent: created.commission.bookingTokenPercent,
        agentPlatformPercent: created.commission.agentPlatformPercent,
        agentPercent: created.commission.agentAgentPercent,
        defaultTokenAmount: created.booking.defaultTokenAmount,
      });
      log.info('created default PlatformConfig');
      return;
    }

    const thresholds = sanitiseThresholds({ budget: config.tiers?.budgetMax, mid: config.tiers?.midMax });
    setPricingContext({
      thresholds,
      commissionPercent: config.commission?.bookingTokenPercent ?? ctx.commissionPercent,
      agentPlatformPercent: config.commission?.agentPlatformPercent ?? ctx.agentPlatformPercent,
      agentPercent: config.commission?.agentAgentPercent ?? ctx.agentPercent,
      defaultTokenAmount: config.booking?.defaultTokenAmount ?? ctx.defaultTokenAmount,
      defaultVisitCharge: config.visits?.allowedCharges?.[1] ?? ctx.defaultVisitCharge,
    });
    log.info(
      `tier thresholds budget<${thresholds.budget}, mid<${thresholds.mid}; commission ${config.commission?.bookingTokenPercent}% of token`,
    );
  } catch (error) {
    log.warn('could not load PlatformConfig, using environment defaults', error);
  }
};

export const refreshPricingContext = async (): Promise<void> => {
  await loadPlatformConfig();
  await invalidateConfig();
};