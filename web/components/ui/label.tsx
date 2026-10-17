'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';

import { cn } from '@/lib/utils';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-sm font-medium text-slate-800 peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className,
    )}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

/** A labelled form control with inline validation messaging. */
export const Field = ({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn('space-y-1.5', className)}>
    <Label htmlFor={htmlFor}>
      {label}
      {required ? (
        <span className="ml-0.5 text-rose-600" aria-hidden="true">
          *
        </span>
      ) : null}
    </Label>
    {children}
    {error ? (
      <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-rose-600">
        {error}
      </p>
    ) : hint ? (
      <p id={`${htmlFor}-hint`} className="text-xs text-slate-500">
        {hint}
      </p>
    ) : null}
  </div>
);