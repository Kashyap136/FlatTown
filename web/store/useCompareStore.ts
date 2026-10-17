'use client';

/**
 * Compare tray and wishlist ids.
 *
 * Compare is capped at three flats (a hard API rule); the tray persists in
 * `localStorage` so a shared/compare link survives a reload.
 */

import { create } from 'zustand';

import { wishlistApi } from '../lib/api';

const COMPARE_KEY = 'flattown.compare';
export const MAX_COMPARE = 3;

const persist = (ids: string[]): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COMPARE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota errors */
  }
};

interface CompareState {
  ids: string[];
  /** Set when the user tries to add a fourth flat. */
  limitReached: boolean;
  toggle: (id: string) => 'added' | 'removed' | 'full';
  remove: (id: string) => void;
  clear: () => void;
  clearLimitFlag: () => void;
  has: (id: string) => boolean;
  count: number;
}

export const useCompareStore = create<CompareState>((set, get) => ({
  ids: [],
  limitReached: false,

  toggle: (id) => {
    const { ids } = get();
    if (ids.includes(id)) {
      const next = ids.filter((value) => value !== id);
      persist(next);
      set({ ids: next, limitReached: false });
      return 'removed';
    }
    if (ids.length >= MAX_COMPARE) {
      set({ limitReached: true });
      return 'full';
    }
    const next = [...ids, id];
    persist(next);
    set({ ids: next, limitReached: false });
    return 'added';
  },

  remove: (id) => {
    const next = get().ids.filter((value) => value !== id);
    persist(next);
    set({ ids: next, limitReached: false });
  },

  clear: () => {
    persist([]);
    set({ ids: [], limitReached: false });
  },

  clearLimitFlag: () => set({ limitReached: false }),
  has: (id) => get().ids.includes(id),
  count: 0,
}));

/* -------------------------------- wishlist -------------------------------- */

interface WishlistState {
  ids: string[];
  loaded: boolean;
  set: (ids: string[]) => void;
  sync: () => Promise<void>;
  toggle: (flatId: string) => Promise<boolean>;
  has: (flatId: string) => boolean;
}

export const useWishlistStore = create<WishlistState>((set, get) => ({
  ids: [],
  loaded: false,

  set: (ids) => set({ ids, loaded: true }),

  sync: async () => {
    try {
      const { data } = await wishlistApi.ids();
      set({ ids: data.ids ?? [], loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  toggle: async (flatId) => {
    try {
      const { data } = await wishlistApi.toggle(flatId);
      const ids = data.wishlisted
        ? Array.from(new Set([...get().ids, flatId]))
        : get().ids.filter((id) => id !== flatId);
      set({ ids, loaded: true });
      return data.wishlisted;
    } catch {
      return !get().ids.includes(flatId);
    }
  },

  has: (flatId) => get().ids.includes(flatId),
}));

/* ------------------------------- comparison ------------------------------- */

export interface CompareRow {
  label: string;
  /** `true` when this value is the best in the row (higher/lower wins). */
  best?: boolean;
  render: (flatId: string) => string;
}

interface CompareFlat {
  id: string;
  totalPrice: number;
  pricePerSqft: number;
  sizeSqft: number;
  bhk: number;
  tokenAmount: number;
  visitCharge: number;
  possessionDate: string;
  tier: string;
  isAvailable: boolean;
  project?: { city?: string; locality?: string; isRERAVerified?: boolean };
  builder?: { name?: string; rating?: { avg: number; count: number } };
}

/** Builds the compare table rows shown on `/compare`. */
export const buildCompareRows = (
  flats: CompareFlat[],
  format: {
    price: (value: number) => string;
    rate: (value: number) => string;
    area: (value: number) => string;
    possession: (value: string) => string;
  },
): CompareRow[] => {
  const find = (id: string): CompareFlat | undefined => flats.find((f) => f.id === id);
  const location = (id: string): string => {
    const project = find(id)?.project;
    if (!project) return '—';
    return [project.locality, project.city].filter(Boolean).join(', ') || '—';
  };

  return [
    { label: 'Total price', render: (id) => format.price(find(id)?.totalPrice ?? 0) },
    { label: 'Price per sq ft', render: (id) => format.rate(find(id)?.pricePerSqft ?? 0) },
    { label: 'Carpet area', render: (id) => format.area(find(id)?.sizeSqft ?? 0) },
    { label: 'Configuration', render: (id) => `${find(id)?.bhk ?? 0} BHK` },
    { label: 'Tier', render: (id) => find(id)?.tier ?? '—' },
    { label: 'Possession', render: (id) => format.possession(find(id)?.possessionDate ?? '') },
    { label: 'Booking token', render: (id) => format.price(find(id)?.tokenAmount ?? 0) },
    { label: 'Site visit charge', render: (id) => format.price(find(id)?.visitCharge ?? 0) },
    { label: 'Location', render: location },
    { label: 'Builder', render: (id) => find(id)?.builder?.name ?? '—' },
    {
      label: 'Builder rating',
      render: (id) => {
        const rating = find(id)?.builder?.rating;
        return rating ? `${rating.avg.toFixed(1)} (${rating.count})` : '—';
      },
    },
    { label: 'RERA verified', render: (id) => (find(id)?.project?.isRERAVerified ? 'Yes' : 'No') },
    { label: 'Availability', render: (id) => (find(id)?.isAvailable ? 'Available' : 'Sold out') },
  ];
};