'use client';

import { Scale, X } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { MAX_COMPARE, useCompareStore } from '@/store/useCompareStore';

/**
 * A sticky tray that follows the user once one or more flats are queued for
 * comparison. The hard limit of three is enforced in the store and the API.
 */
export const CompareTray = () => {
  const ids = useCompareStore((s) => s.ids);
  const remove = useCompareStore((s) => s.remove);
  const clear = useCompareStore((s) => s.clear);

  if (ids.length === 0) return null;

  return (
    <div className="border-t border-slate-200 bg-slate-900 text-white">
      <div className="ft-container flex items-center gap-3 py-2.5">
        <Scale className="size-4 shrink-0 text-emerald-400" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[13px]">
          <span className="font-semibold">Comparing {ids.length}</span>
          <span className="text-slate-400"> of {MAX_COMPARE} flats</span>
        </p>
        <div className="hidden items-center gap-1.5 sm:flex">
          {ids.map((id, index) => (
            <span key={id} className="rounded bg-slate-800 px-2 py-1 text-[11px] font-medium">
              Flat {index + 1}
              <button
                type="button"
                onClick={() => remove(id)}
                className="ml-1 text-slate-400 hover:text-white"
                aria-label={`Remove flat ${index + 1} from comparison`}
              >
                <X className="inline size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
        <Button asChild size="sm" variant="primary" className="shrink-0">
          <Link href="/compare">Compare now</Link>
        </Button>
        <Button variant="ghost" size="sm" className="shrink-0 text-slate-300 hover:bg-slate-800 hover:text-white" onClick={clear}>
          Clear
        </Button>
      </div>
    </div>
  );
};