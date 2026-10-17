'use client';

import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

export const ToastProvider = ToastPrimitive.Provider;

export const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      'fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 sm:bottom-4 sm:left-auto sm:right-4 sm:top-auto sm:w-[380px]',
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitive.Viewport.displayName;

const TONES = {
  default: 'border-slate-200 bg-white text-slate-900',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  error: 'border-rose-300 bg-rose-50 text-rose-900',
} as const;

export const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> & {
    tone?: keyof typeof TONES;
    children?: React.ReactNode;
  }
>(({ className, tone = 'default', children, ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    className={cn(
      'pointer-events-auto flex w-full items-start gap-3 rounded-lg border p-4 shadow-lg',
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:slide-in-from-bottom-full',
      TONES[tone],
      className,
    )}
    {...props}
  >
    {children}
  </ToastPrimitive.Root>
));
Toast.displayName = ToastPrimitive.Root.displayName;

export const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title ref={ref} className={cn('flex-1 text-sm font-semibold', className)} {...props} />
));
ToastTitle.displayName = ToastPrimitive.Title.displayName;

export const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description ref={ref} className={cn('text-sm opacity-90', className)} {...props} />
));
ToastDescription.displayName = ToastPrimitive.Description.displayName;

export const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    className={cn(
      'rounded-md p-1 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600',
      className,
    )}
    aria-label="Dismiss notification"
    {...props}
  >
    <X className="size-4" aria-hidden="true" />
  </ToastPrimitive.Close>
));
ToastClose.displayName = ToastPrimitive.Close.displayName;

type ToastOptions = { title: string; description?: string; tone?: keyof typeof TONES };

type Listener = (toast: ToastOptions) => void;
type ToastListener = { toasts: Listener[]; notify: (toast: ToastOptions) => void; subscribe: (l: Listener) => () => void };

/** Imperative toast API — avoids threading a hook through every component. */
export const toast: ToastListener = {
  toasts: [],
  notify: (toastOptions) => toast.toasts.forEach((listener) => listener(toastOptions)),
  subscribe: (listener) => {
    toast.toasts.push(listener);
    return () => {
      toast.toasts = toast.toasts.filter((l) => l !== listener);
    };
  },
};

export const toastSuccess = (title: string, description?: string): void =>
  toast.notify({ title, description, tone: 'success' });

export const toastError = (title: string, description?: string): void =>
  toast.notify({ title, description, tone: 'error' });

/** Renders the live region that `toast.notify` writes into. */
export const Toaster = () => {
  const [items, setItems] = React.useState<Array<ToastOptions & { id: number }>>([]);
  const counter = React.useRef(0);

  React.useEffect(
    () =>
      toast.subscribe((options) => {
        counter.current += 1;
        const id = counter.current;
        setItems((current) => [...current, { ...options, id }]);
        window.setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), 5000);
      }),
    [],
  );

  return (
    <ToastProvider swipeDirection="right">
      {items.map((item) => (
        <Toast key={item.id} tone={item.tone} duration={5000}>
          <div className="min-w-0 flex-1">
            <ToastTitle>{item.title}</ToastTitle>
            {item.description ? <ToastDescription>{item.description}</ToastDescription> : null}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
};