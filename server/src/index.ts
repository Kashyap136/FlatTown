import { createApp } from './app';
import { setTimeout } from 'node:timers';
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
      log.warn('JWT_SECRET / JWT_REFRESH_SECRET are using insecure defaults - set real values before deploying.');
    }
    await connectDatabase();
    await loadPlatformConfig();

    const app = createApp();
    // Bind explicitly to 0.0.0.0 so the platform (Render) can detect and reach
    // the service. Redis is NOT on the critical path for opening the port: a
    // slow/unreachable Redis must not delay or prevent the HTTP listener from
    // starting. It is initialised afterwards (best effort).
    const server = app.listen(env.port, '0.0.0.0', () => {
      const payments = gatewayInfo();
      const banner = [
        '',
        '  FLAT TOWN API',
        `  -> http://0.0.0.0:${env.port}${env.apiPrefix}`,
        `  -> env: ${env.nodeEnv}`,
        `  -> payments: ${payments.gateway}${payments.mockEnabled ? ' (SIMULATED - not real money)' : ''}`,
        `  -> storage: ${storageMode()}`,
        '',
      ].join('\n');
      log.info(banner);
    });

    server.on('error', (error: Error) => {
      log.error('HTTP server failed to start', error);
      process.exit(1);
    });

    void initRedis().catch((error) => {
      log.warn('Redis initialisation failed; continuing without cache', error);
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