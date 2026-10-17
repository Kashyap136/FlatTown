/**
 * Minimal structured logger.
 *
 * Replaces direct `console` use so that operational output is tagged and
 * level-filtered in one place. In production only `warn` and `error` reach
 * stdout, which keeps the Render / container logs readable.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

/* eslint-disable no-console -- this module is the single sanctioned console boundary. */

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const isProd = (): boolean => process.env.NODE_ENV === 'production';

const minLevel = (): number => {
  const raw = (process.env.LOG_LEVEL ?? (isProd() ? 'info' : 'debug')).toLowerCase() as Level;
  return LEVEL_ORDER[raw] ?? LEVEL_ORDER.info;
};

const emit = (level: Level, scope: string, message: string, meta?: unknown): void => {
  if (LEVEL_ORDER[level] < minLevel()) return;
  const time = new Date().toISOString();
  const line = `${time} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
  const args: unknown[] = meta === undefined ? [line] : [line, meta];
  if (level === 'error') console.error(...args);
  else if (level === 'warn') console.warn(...args);
  else console.info(...args);
};

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

/** Returns a logger bound to a scope name, e.g. `createLogger('payments')`. */
export const createLogger = (scope: string): Logger => ({
  debug: (message, meta) => emit('debug', scope, message, meta),
  info: (message, meta) => emit('info', scope, message, meta),
  warn: (message, meta) => emit('warn', scope, message, meta),
  error: (message, meta) => emit('error', scope, message, meta),
});

export const logger = createLogger('app');
