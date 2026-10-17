'use client';

import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';

import { cn } from '@/lib/utils';

export const RadioGroup = RadioGroupPrimitive.Root;

export const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      'aspect-square size-5 shrink-0 rounded-full border border-slate-400 bg-white text-emerald-700 transition-colors',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1',
      'disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-emerald-700',
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <span className="block size-2.5 rounded-full bg-current" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

/** A radio styled as a full-width selectable card (token picker, role picker). */
export const RadioCard = ({
  id,
  value,
  title,
  description,
  disabled,
  className,
}: {
  id: string;
  value: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) => (
  <label
    htmlFor={id}
    className={cn(
      'flex cursor-pointer items-start gap-3 rounded-lg border border-slate-300 bg-white p-3 transition-colors',
      'hover:border-emerald-600 has-[:checked]:border-emerald-700 has-[:checked]:bg-emerald-50/60',
      disabled && 'cursor-not-allowed opacity-50 hover:border-slate-300',
      className,
    )}
  >
    <RadioGroupItem id={id} value={value} disabled={disabled} className="mt-0.5" />
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold text-slate-900">{title}</span>
      {description ? <span className="mt-0.5 block text-xs text-slate-600">{description}</span> : null}
    </span>
  </label>
);