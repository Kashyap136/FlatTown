'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SORT_OPTIONS } from '@/lib/filters';
import { cn } from '@/lib/utils';
import type { SortKey } from '@/lib/types';

/** Compact pagination: first / prev / page indicator / next / last. */
export const Pagination = ({
  page,
  totalPages,
  total,
  onChange,
  className,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
  className?: string;
}) => {
  if (totalPages <= 1) {
    return total > 0 ? (
      <p className={cn('text-center text-xs text-slate-500', className)}>
        Showing all {total} {total === 1 ? 'result' : 'results'}
      </p>
    ) : null;
  }

  const window = 2;
  const pages: Array<number | 'gap'> = [];
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || (i >= page - window && i <= page + window)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== 'gap') {
      pages.push('gap');
    }
  }

  return (
    <nav aria-label="Pagination" className={cn('flex items-center justify-center gap-1.5', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft />
        <span className="hidden sm:inline">Previous</span>
      </Button>

      <ol className="hidden items-center gap-1 sm:flex">
        {pages.map((entry, index) =>
          entry === 'gap' ? (
            <li key={`gap-${index}`} className="px-1 text-xs text-slate-400">
              …
            </li>
          ) : (
            <li key={entry}>
              <button
                type="button"
                onClick={() => onChange(entry)}
                aria-current={entry === page ? 'page' : undefined}
                className={cn(
                  'size-9 rounded-lg text-sm font-semibold transition-colors',
                  entry === page ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100',
                )}
              >
                {entry}
              </button>
            </li>
          ),
        )}
      </ol>

      <span className="text-xs font-medium text-slate-600 sm:hidden">
        Page {page} of {totalPages}
      </span>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight />
      </Button>
    </nav>
  );
};

/** Sort control for the results bar. */
export const SortSelect = ({
  value,
  onChange,
  className,
}: {
  value: SortKey;
  onChange: (value: SortKey) => void;
  className?: string;
}) => (
  <div className={cn('flex items-center gap-2', className)}>
    <label htmlFor="ft-sort" className="hidden text-xs font-medium text-slate-600 sm:block">
      Sort by
    </label>
    <Select value={value} onValueChange={(next) => onChange(next as SortKey)}>
      <SelectTrigger id="ft-sort" aria-label="Sort results" className="h-9 w-full min-w-[11rem] text-[13px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);