import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn-compatible class combiner. */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

/** Deterministic-ish placeholder colour so cards never render as grey boxes. */
export const imageTone = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${hash} 32% 88%)`;
};

export const initials = (name: string | undefined | null): string =>
  (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const titleCase = (value: string): string =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/** Joins a list into `a, b and c`. */
export const listSentence = (items: string[]): string => {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
};

/** A readable, human-friendly error message from anything axios/zod throws. */
export const errorMessage = (error: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  const candidate = error as {
    response?: { data?: { message?: string; errors?: Array<{ field: string; message: string }> } };
    message?: string;
  };
  const details = candidate.response?.data;
  if (details?.message) {
    if (details.errors?.length) {
      const fieldErrors = details.errors
        .filter((e) => e && e.field && e.field !== 'request')
        .map((e) => `${e.field}: ${e.message}`);
      return fieldErrors.length ? `${details.message} — ${fieldErrors.join(', ')}` : details.message;
    }
    return details.message;
  }
  if (candidate.message) return candidate.message;
  return fallback;
};

/** Maps an unknown throwable to a field-error record for react-hook-form. */
export const fieldErrors = (
  error: unknown,
): Record<string, string> => {
  const details = (error as { response?: { data?: { errors?: Array<{ field: string; message: string }> } } })
    ?.response?.data;
  if (!details?.errors?.length) return {};
  return details.errors.reduce<Record<string, string>>((acc, e) => {
    if (e.field && e.field !== 'request') acc[e.field] = e.message;
    return acc;
  }, {});
};

/** Returns the absolute URL for a site-relative path (Open Graph, canonical). */
export const absoluteUrl = (path: string, base = process.env.NEXT_PUBLIC_SITE_URL ?? ''): string => {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (base) return `${base.replace(/\/$/, '')}${clean}`;
  if (typeof window !== 'undefined') return `${window.location.origin}${clean}`;
  return clean;
};

/** Copy-to-clipboard that degrades gracefully. */
export const copyToClipboard = async (value: string): Promise<boolean> => {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to the failure below */
  }
  return false;
};

/** A stable id for form fields without pulling in `useId` everywhere. */
export const fieldId = (name: string): string => `ft-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`;