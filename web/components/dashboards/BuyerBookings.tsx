'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { EmptyState } from '@/components/common/States';
import { BookingStatusTimeline, EscrowBreakdown } from '@/components/dashboards/EscrowBreakdown';
import { DocumentUpload } from '@/components/flat/InquiryForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBookings, useBookingActions } from '@/hooks/useFlats';
import { formatDate, formatDateTime, formatINR } from '@/lib/price';
import { DEFAULT_DOCUMENT_TYPES } from '@/store/useBookingStore';
import type { Booking } from '@/lib/types';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'token_paid', label: 'Token paid' },
  { key: 'builder_accepted', label: 'Accepted' },
  { key: 'docs_pending', label: 'Documents' },
  { key: 'completed', label: 'Completed' },
  { key: 'refunded', label: 'Refunded' },
];

export const BuyerBookings = () => {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('booking');
  const [tab, setTab] = useState('all');

  const { data, isLoading } = useBookings({ scope: 'mine', limit: 50 });
  const { uploadDocuments, cancel } = useBookingActions();

  const all = (data ?? []) as Booking[];
  const filtered = tab === 'all' ? all : all.filter((b) => b.escrowStatus === tab);

  return (
    <Suspense fallback={<ListSkeleton rows={3} />}>
      <div className="space-y-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {TABS.map((item) => (
              <TabsTrigger key={item.key} value={item.key}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map((item) => (
            <TabsContent key={item.key} value={item.key}>
              {isLoading ? (
                <ListSkeleton rows={2} />
              ) : filtered.length === 0 ? (
                <EmptyState preset="bookings" compact actionLabel="Browse new flats" actionHref="/" />
              ) : (
                <ul className="space-y-4">
                  {filtered.map((booking) => (
                    <li key={booking.id}>
                      <BookingCard
                        booking={booking}
                        highlighted={booking.id === focusId}
                        onUpload={async (files, types) => {
                          await uploadDocuments.mutateAsync({ id: booking.id, files, types });
                        }}
                        onCancel={() => {
                          void cancel.mutateAsync({ id: booking.id });
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          ))}
        </Tabs>

        {all.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>How escrow works on Flat Town</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2.5 text-[13px] leading-relaxed text-slate-600">
                <li>
                  <strong className="text-slate-800">1. You pay the token.</strong> The amount is captured by Razorpay
                  and held by the platform — the escrow account. The platform never marks a booking paid on the basis of
                  a browser callback.
                </li>
                <li>
                  <strong className="text-slate-800">2. The builder accepts</strong> and requests your documents.
                </li>
                <li>
                  <strong className="text-slate-800">3. You upload Aadhaar and PAN</strong> (plus a loan approval letter
                  if you asked for loan assistance). The builder verifies them.
                </li>
                <li>
                  <strong className="text-slate-800">4. An admin releases escrow:</strong> 90% of the token goes to the
                  builder, 10% is retained as the platform commission, and any agent share is carved out of that
                  commission — never from the builder.
                </li>
              </ol>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Suspense>
  );
};

const BookingCard = ({
  booking,
  highlighted,
  onUpload,
  onCancel,
}: {
  booking: Booking;
  highlighted: boolean;
  onUpload: (files: File[], types: string[]) => Promise<void>;
  onCancel: () => void;
}) => {
  const [cancelOpen, setCancelOpen] = useState(false);
  const docs = booking.documents ?? [];
  const requested = booking.documentsRequested ?? [];
  const allDocsVerified = docs.length > 0 && docs.every((doc) => doc.verified);
  const canCancel = ['created', 'token_paid', 'builder_accepted'].includes(booking.escrowStatus);

  return (
    <Card className={highlighted ? 'border-emerald-600 ring-2 ring-emerald-100' : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate">{booking.flat?.title ?? 'Flat'}</CardTitle>
            <p className="text-[13px] text-slate-600">
              {booking.project?.projectName} · {booking.reference}
            </p>
          </div>
          <Badge variant="brand" className="capitalize">
            {booking.escrowStatus.replace(/_/g, ' ')}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <BookingStatusTimeline booking={booking} />
        <EscrowBreakdown booking={booking} />

        <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Total price</dt>
            <dd className="font-medium tabular-nums text-slate-900">{formatINR(booking.totalPrice)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Commission ({booking.commissionPercent}% of token)</dt>
            <dd className="font-medium tabular-nums text-slate-900">{formatINR(booking.commissionAmount)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Loan status</dt>
            <dd className="font-medium capitalize text-slate-900">{booking.loanStatus.replace(/_/g, ' ')}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Payment</dt>
            <dd className="font-medium text-slate-900">
              {booking.payment?.gateway ?? '—'}
              {booking.payment?.paymentId ? ' · captured' : ''}
            </dd>
          </div>
        </dl>

        {booking.escrow.accountId ? (
          <p className="text-[11px] text-slate-500">
            Held in escrow account <code>{booking.escrow.accountId}</code>
          </p>
        ) : null}

        {/* --------------------------- documents -------------------------- */}
        <section className="rounded-lg border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-900">Documents</h3>
          {docs.length === 0 ? (
            <p className="mt-1 text-[13px] text-slate-600">
              No documents uploaded yet. Aadhaar and PAN are required before escrow can be released.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {docs.map((doc) => (
                <li key={doc.type} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="capitalize text-slate-700">{doc.type.replace(/_/g, ' ')}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant={doc.verified ? 'success' : 'warning'}>
                      {doc.verified ? 'Verified' : 'Awaiting review'}
                    </Badge>
                    <span className="text-[11px] text-slate-500">{formatDate(doc.uploadedAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {requested.length > 0 && !allDocsVerified && booking.escrowStatus !== 'completed' ? (
            <div className="mt-3">
              <DocumentUpload
                onUpload={onUpload}
                types={booking.loan?.required ? DEFAULT_DOCUMENT_TYPES : DEFAULT_DOCUMENT_TYPES.slice(0, 2)}
              />
            </div>
          ) : null}
        </section>

        {/* ---------------------------- history ---------------------------- */}
        {booking.statusHistory?.length ? (
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              Escrow history ({booking.statusHistory.length} events)
            </summary>
            <ol className="mt-2 space-y-1.5">
              {booking.statusHistory.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="flex items-start gap-2 text-[12px]">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                  <span>
                    <span className="font-medium capitalize text-slate-800">
                      {entry.from.replace(/_/g, ' ')} → {entry.to.replace(/_/g, ' ')}
                    </span>
                    <span className="ml-1 text-slate-500">{formatDateTime(entry.at)}</span>
                    {entry.note ? <span className="block text-slate-600">{entry.note}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {canCancel ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setCancelOpen((v) => !v)}>
                Cancel booking
              </Button>
              {cancelOpen ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    onCancel();
                    setCancelOpen(false);
                  }}
                >
                  Confirm cancellation
                </Button>
              ) : null}
            </>
          ) : null}
          {booking.flat?.id ? (
            <Button asChild variant="ghost" size="sm">
              <a href={`/flat/${booking.flat.id}`}>View the flat</a>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};