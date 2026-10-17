'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/States';
import { useMarkNotificationsRead, useNotifications } from '@/hooks/useFlats';
import { useAuthStore } from '@/store/useAuthStore';
import { formatDateTime } from '@/lib/price';

/** Routes a notification to the screen where it can be acted on. */
const hrefFor = (event: string, data: Record<string, unknown> | undefined): string => {
  const bookingId = typeof data?.bookingId === 'string' ? data.bookingId : null;
  const visitId = typeof data?.visitId === 'string' ? data.visitId : null;
  switch (event) {
    case 'site_visit_requested':
    case 'site_visit_confirmed':
    case 'site_visit_cancelled':
      return visitId ? `/builder/visits?visit=${visitId}` : '/builder/visits';
    case 'booking_created':
      return '/builder/bookings';
    case 'booking_accepted':
    case 'documents_uploaded':
    case 'documents_requested':
      return bookingId ? `/buyer/bookings?booking=${bookingId}` : '/buyer/bookings';
    case 'escrow_released':
    case 'refund_issued':
      return bookingId ? `/buyer/bookings?booking=${bookingId}` : '/buyer/bookings';
    case 'rera_verified':
      return '/builder/settings';
    case 'review_moderated':
      return '/builder/reviews';
    default:
      return bookingId ? `/buyer/bookings?booking=${bookingId}` : '/buyer';
  }
};

export const NotificationBell = () => {
  const user = useAuthStore((s) => s.user);
  const enabled = Boolean(user);
  const { data } = useNotifications(enabled);
  const markAll = useMarkNotificationsRead();
  const [open, setOpen] = useState(false);

  const unread = (data ?? []).filter((n) => !n.isRead);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open && unread.length) markAll.mutate();
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread.length ? `Notifications, ${unread.length} unread` : 'Notifications'}
        className="relative grid size-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        <Bell className="size-4" aria-hidden="true" />
        {unread.length ? (
          <span className="absolute -right-1 -top-1 grid min-w-[1.1rem] place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label="Notifications"
            className="fixed inset-x-3 top-16 z-50 max-h-[70vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
              {unread.length ? (
                <Button variant="ghost" size="sm" onClick={() => markAll.mutate()}>
                  Mark all read
                </Button>
              ) : null}
            </div>
            <div className="max-h-[calc(70vh-3rem)] overflow-y-auto">
              {(data ?? []).length === 0 ? (
                <EmptyState
                  compact
                  className="border-0"
                  title="No notifications yet"
                  body="Booking and visit updates will show up here."
                  icon={Bell}
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {(data ?? []).slice(0, 20).map((item) => {
                    const id = item.id ?? item._id ?? '';
                    return (
                      <li key={id}>
                        <Link
                          href={hrefFor(item.event, item.data)}
                          onClick={() => setOpen(false)}
                          className={`block px-4 py-3 transition-colors hover:bg-slate-50 ${
                            item.isRead ? '' : 'bg-emerald-50/40'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {!item.isRead ? (
                              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-600" aria-hidden="true" />
                            ) : null}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                              <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{item.body}</p>
                              <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(item.createdAt)}</p>
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};