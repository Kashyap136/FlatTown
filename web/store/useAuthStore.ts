'use client';

/**
 * Session store.
 *
 * Holds the signed-in user and token bookkeeping, bootstrapped from
 * `localStorage` and revalidated against `GET /auth/me` on mount so a revoked
 * or expired session never leaves a stale UI.
 */

import { create } from 'zustand';

import { authApi } from '../lib/api';
import { clearSession, getRefreshToken, getStoredUser, setSession as persistSession, setUser as persistUser } from '../lib/auth';
import type { User } from '../lib/types';

interface AuthState {
  user: User | null;
  /** `true` until the initial `GET /auth/me` settles. */
  initialising: boolean;
  error: string | null;
  setSession: (payload: { user: User; accessToken: string; refreshToken: string }) => void;
  setUser: (user: User) => void;
  signOut: (options?: { notifyServer?: boolean }) => Promise<void>;
  bootstrap: () => Promise<void>;
  refreshProfile: () => Promise<User | null>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  initialising: true,
  error: null,

  setSession: ({ user, accessToken, refreshToken }) => {
    persistSession({ accessToken, refreshToken, expiresIn: '15m', refreshExpiresIn: '7d' }, user);
    set({ user, initialising: false, error: null });
  },

  setUser: (user) => {
    persistUser(user);
    set({ user });
  },

  signOut: async (options) => {
    const refreshToken = getRefreshToken();
    if (options?.notifyServer !== false && refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // A failed logout call must never trap the user in the app.
      }
    }
    clearSession();
    set({ user: null, initialising: false, error: null });
  },

  bootstrap: async () => {
    const stored = getStoredUser();
    if (!stored) {
      set({ user: null, initialising: false });
      return;
    }
    set({ user: stored, initialising: true });
    try {
      const { data } = await authApi.me();
      persistUser(data.user);
      set({ user: data.user, initialising: false, error: null });
    } catch {
      // The interceptor already attempted a refresh; if that failed the
      // session is gone.
      if (getStoredUser()) {
        set({ user: getStoredUser(), initialising: false });
      } else {
        clearSession();
        set({ user: null, initialising: false });
      }
    }
  },

  refreshProfile: async () => {
    try {
      const { data } = await authApi.me();
      persistUser(data.user);
      set({ user: data.user });
      return data.user;
    } catch {
      return null;
    }
  },
}));

/* -------------------------------- selectors -------------------------------- */

export const useUser = (): User | null => useAuthStore((s) => s.user);
export const useRole = (): User['role'] | null => useAuthStore((s) => s.user?.role ?? null);
export const useIsAuthenticated = (): boolean => useAuthStore((s) => Boolean(s.user));

/** Dashboard route for each role, used by the header and post-login redirects. */
export const homeRouteFor = (role: User['role'] | null | undefined): string => {
  switch (role) {
    case 'builder':
      return '/builder';
    case 'buyer':
      return '/buyer';
    case 'agent':
      return '/agent';
    case 'admin':
      return '/admin';
    default:
      return '/';
  }
};

/** Navigation entries a given role may see. */
export const navForRole = (role: User['role'] | null | undefined): Array<{ href: string; label: string }> => {
  if (!role) {
    return [
      { href: '/', label: 'Marketplace' },
      { href: '/auth/login', label: 'Sign in' },
    ];
  }
  const common = [{ href: '/', label: 'Marketplace' }];
  switch (role) {
    case 'builder':
      return [
        ...common,
        { href: '/builder', label: 'Dashboard' },
        { href: '/builder/projects/new', label: 'Add project' },
        { href: '/builder/flats/new', label: 'Add flat' },
        { href: '/builder/visits', label: 'Visits' },
        { href: '/builder/bookings', label: 'Bookings' },
        { href: '/builder/payouts', label: 'Payouts' },
      ];
    case 'buyer':
      return [
        ...common,
        { href: '/buyer', label: 'Dashboard' },
        { href: '/buyer/bookings', label: 'Bookings' },
        { href: '/buyer/visits', label: 'Visits' },
        { href: '/buyer/wishlist', label: 'Saved' },
        { href: '/buyer/requirements', label: 'Requirements' },
      ];
    case 'agent':
      return [
        ...common,
        { href: '/agent', label: 'Dashboard' },
        { href: '/builder/flats/new', label: 'List a flat' },
        { href: '/buyer/visits', label: 'Visits' },
      ];
    case 'admin':
      return [
        ...common,
        { href: '/admin', label: 'Dashboard' },
        { href: '/admin/verifications', label: 'Verifications' },
        { href: '/admin/escrow', label: 'Escrow' },
        { href: '/admin/config', label: 'Configuration' },
        { href: '/admin/disputes', label: 'Disputes' },
      ];
    default:
      return common;
  }
};