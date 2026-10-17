import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/db';
import { assertProductionEnv, env, placeholderFlags } from './config/env';
import { disconnectRedis, initRedis } from './config/redis';
import { gatewayInfo } from './utils/razorpay';
import { storageMode } from './utils/storage';
import { loadPlatformConfig } from './services/platformConfig.service';
import { createLogger } from './utils/logger';

const log = createLogger('boot');

const bootstrap = async (): Promise<void> => {
  try {
    // Fail fast rather than serve traffic with a forgeable signing key.
    assertProductionEnv();
    if (placeholderFlags.jwt || placeholderFlags.jwtRefresh) {
      log.warn('JWT_SECRET / JWT_REFRESH_SECRET are using insecure defaults — set real values before deploying.');
    }
    await connectDatabase();
    await loadPlatformConfig();
    await initRedis();

    const app = createApp();
    const server = app.listen(env.port, () => {
      const payments = gatewayInfo();
      const banner = [
        '',
        '  FLAT TOWN API',
        `  -> http://localhost:${env.port}${env.apiPrefix}`,
        `  -> env: ${env.nodeEnv}`,
        `  -> payments: ${payments.gateway}${payments.mockEnabled ? ' (SIMULATED - not real money)' : ''}`,
        `  -> storage: ${storageMode()}`,
        '',
      ].join('\n');
      log.info(banner);
    });

    const shutdown = async (signal: string): Promise<void> => {
      log.info(`${signal} received, shutting down`);
      server.close(async () => {
        await Promise.allSettled([disconnectDatabase(), disconnectRedis()]);
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  } catch (error) {
    log.error('failed to start Flat Town API', error);
    process.exit(1);
  }
};

void bootstrap();
