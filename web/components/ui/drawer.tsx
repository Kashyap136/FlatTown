'use client';

import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Drawer / side sheet.
 *
 * On mobile it slides in from the bottom, on larger screens from the side —
 * the same component serves both the filter drawer and the dashboard nav.
 */
export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetPortal = SheetPrimitive.Portal;

export const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-slate-900/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> {
  side?: 'left' | 'right' | 'bottom';
  title: string;
  description?: string;
  footer?: React.ReactNode;
}

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ className, children, side = 'bottom', title, description, footer, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 flex flex-col bg-white shadow-2xl transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out',
        side === 'bottom' &&
          'inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl border-t border-slate-200 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        side === 'left' &&
          'inset-y-0 left-0 w-[86vw] max-w-sm border-r border-slate-200 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
        side === 'right' &&
          'inset-y-0 right-0 w-[86vw] max-w-sm border-l border-slate-200 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
        className,
      )}
      {...props}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div className="min-w-0">
          <SheetPrimitive.Title className="text-base font-semibold text-slate-900">{title}</SheetPrimitive.Title>
          {description ? (
            <SheetPrimitive.Description className="mt-0.5 text-sm text-slate-600">
              {description}
            </SheetPrimitive.Description>
          ) : (
            // Radix requires a description or an explicit aria override.
            <SheetPrimitive.Description className="sr-only">{title}</SheetPrimitive.Description>
          )}
        </div>
        <SheetPrimitive.Close
          className="-mr-1 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          aria-label="Close"
        >
          <X className="size-5" aria-hidden="true" />
        </SheetPrimitive.Close>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      {footer ? <div className="shrink-0 border-t border-slate-200 p-4">{footer}</div> : null}
    </SheetPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = SheetPrimitive.Content.displayName;

/** Convenience wrapper matching the shadcn `drawer` API surface. */
export const Drawer = Sheet;
export const DrawerTrigger = SheetTrigger;
export const DrawerClose = SheetClose;
export const DrawerContent = SheetContent;