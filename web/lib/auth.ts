/**
 * Token storage and session helpers.
 *
 * Access tokens live in memory + `localStorage` so a page reload keeps the
 * session; refresh tokens live in `localStorage` too because the platform has
 * no server-side cookie jar. Both are cleared together on logout, and the
 * refresh token is rotated on every refresh (see `lib/api.ts`).
 */

import type { TokenPair, User } from './types';

const ACCESS_KEY = 'flattown.accessToken';
const REFRESH_KEY = 'flattown.refreshToken';
const USER_KEY = 'flattown.user';

/** `true` when running in a browser (guards SSR). */
export const isBrowser = (): boolean => typeof window !== 'undefined';

const safeGet = (key: string): string | null => {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (key: string, value: string): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / quota — the in-memory copy still works for this tab */
  }
};

const safeRemove = (key: string): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

export const getAccessToken = (): string | null => safeGet(ACCESS_KEY);
export const getRefreshToken = (): string | null => safeGet(REFRESH_KEY);

export const getStoredUser = (): User | null => {
  const raw = safeGet(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    safeRemove(USER_KEY);
    return null;
  }
};

export const setSession = (tokens: TokenPair, user: User): void => {
  safeSet(ACCESS_KEY, tokens.accessToken);
  safeSet(REFRESH_KEY, tokens.refreshToken);
  safeSet(USER_KEY, JSON.stringify(user));
};

export const setTokens = (tokens: Pick<TokenPair, 'accessToken' | 'refreshToken'>): void => {
  safeSet(ACCESS_KEY, tokens.accessToken);
  safeSet(REFRESH_KEY, tokens.refreshToken);
};

export const setUser = (user: User): void => safeSet(USER_KEY, JSON.stringify(user));

export const clearSession = (): void => {
  safeRemove(ACCESS_KEY);
  safeRemove(REFRESH_KEY);
  safeRemove(USER_KEY);
};

/** `Authorization` header value, or `undefined` when signed out. */
export const bearerHeader = (): Record<string, string> => {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** `true` when a token is present (it may still be expired — the API decides). */
export const hasSession = (): boolean => Boolean(getAccessToken());