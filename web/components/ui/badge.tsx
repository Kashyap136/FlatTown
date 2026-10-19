import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:text-xs',
  {
    variants: {
      variant: {
        neutral: 'border-slate-200 bg-slate-50 text-slate-700',
        brand: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        // RULE: the RERA badge must be unmistakably green.
        // emerald-700 (not -600) keeps white text at 5.5:1; -600 only reached
        // 3.8:1 and failed WCAG AA.
        rera: 'border-emerald-600 bg-emerald-700 text-white',
        info: 'border-sky-200 bg-sky-50 text-sky-800',
        warning: 'border-amber-300 bg-amber-50 text-amber-800',
        danger: 'border-rose-200 bg-rose-50 text-rose-700',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        outline: 'border-slate-300 bg-white text-slate-700',
        dark: 'border-slate-800 bg-slate-900 text-white',
      },
      size: {
        sm: 'px-1.5 text-[10px]',
        md: 'px-2 py-0.5',
        lg: 'px-2.5 py-1 text-xs',
      },
    },
    defaultVariants: { variant: 'neutral', size: 'md' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, size, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
);

export { badgeVariants };