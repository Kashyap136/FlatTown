'use client';

import { CheckCircle2, FileCheck2, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { EmptyState } from '@/components/common/States';
import { BookingStatusTimeline, EscrowBreakdown } from '@/components/dashboards/EscrowBreakdown';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBookingActions, useBookings } from '@/hooks/useFlats';
import { formatDate, formatDateTime, formatINR } from '@/lib/price';
import { errorMessage } from '@/lib/utils';
import type { Booking } from '@/lib/types';

const TABS = [
  { key: 'token_paid', label: 'Awaiting your acceptance' },
  { key: 'builder_accepted', label: 'Documents requested' },
  { key: 'docs_pending', label: 'Docs verified' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
];

export const BuilderBookings = () => {
  const [tab, setTab] = useState('token_paid');
  const { data, isLoading } = useBookings({ scope: 'builder', limit: 60 });
  const { accept, verifyDocument } = useBookingActions();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = (data ?? []) as Booking[];

  const doAccept = async (booking: Booking) => {
    setPendingId(booking.id);
    setError(null);
    try {
      await accept.mutateAsync({ id: booking.id });
    } catch (err) {
      setError(errorMessage(err, 'Could not accept the booking.'));
    } finally {
      setPendingId(null);
    }
  };

  const verify = async (booking: Booking, index: number, verified: boolean) => {
    setPendingId(booking.id);
    setError(null);
    try {
      await verifyDocument.mutateAsync({ id: booking.id, index, verified });
    } catch (err) {
      setError(errorMessage(err, 'Could not verify the document.'));
    } finally {
      setPendingId(null);
    }
  };

  if (isLoading) return <ListSkeleton rows={3} />;

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {TABS.map((item) => (
            <TabsTrigger key={item.key} value={item.key}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((item) => {
          const rows = item.key === 'all' ? all : all.filter((b) => b.escrowStatus === item.key);
          return (
            <TabsContent key={item.key} value={item.key}>
              {rows.length === 0 ? (
                <EmptyState
                  preset="bookings"
                  compact
                  title="No bookings here"
                  body="Bookings appear once a buyer pays a booking token."
                />
              ) : (
                <ul className="space-y-4">
                  {rows.map((booking) => {
                    const docs = booking.documents ?? [];
                    return (
                      <li key={booking.id}>
                        <Card>
                          <CardHeader>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <CardTitle className="truncate">
                                  {booking.flat?.title ?? 'Flat'} · {booking.project?.projectName ?? 'Project'}
                                </CardTitle>
                                <p className="text-[13px] text-slate-600">
                                  {booking.reference} · {booking.buyer?.name ?? 'Buyer'}
                                  {booking.buyer?.phone ? ` · ${booking.buyer.phone}` : ''}
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

                            <p className="text-[12px] text-slate-500">
                              Booked {formatDate(booking.createdAt)} · Total price{' '}
                              {formatINR(booking.totalPrice)} · Commission {formatINR(booking.commissionAmount)} (
                              {booking.commissionPercent}% of the {formatINR(booking.tokenAmount)} token)
                              {booking.agent ? ` · Agent ${booking.agent.name}` : ''}
                            </p>

                            {booking.escrowStatus === 'token_paid' ? (
                              <Alert tone="info" title="Token is in escrow">
                                Accept the request to move the booking into documentation. Your 90% share is released only
                                after an admin verifies the buyer&rsquo;s documents.
                              </Alert>
                            ) : null}

                            {booking.escrowStatus === 'completed' ? (
                              <Alert tone="success" title="Escrow released">
                                {formatINR(booking.escrow?.releasedAmount ?? 0)} was released to you on{' '}
                                {formatDateTime(booking.escrow?.releasedAt)}
                              </Alert>
                            ) : null}

                            {/* --------------------------- documents -------------------------- */}
                            {docs.length > 0 ? (
                              <section className="rounded-lg border border-slate-200 p-3">
                                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                                  <FileCheck2 className="size-4 text-slate-500" aria-hidden="true" />
                                  Buyer documents
                                </h3>
                                <ul className="mt-2 space-y-2">
                                  {docs.map((doc, index) => (
                                    <li
                                      key={`${doc.type}-${index}`}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5"
                                    >
                                      <span className="min-w-0">
                                        <span className="block text-[13px] font-medium capitalize text-slate-800">
                                          {doc.type.replace(/_/g, ' ')}
                                        </span>
                                        <span className="block text-[11px] text-slate-500">
                                          Uploaded {formatDate(doc.uploadedAt)}
                                        </span>
                                      </span>
                                      <span className="flex shrink-0 items-center gap-2">
                                        <Badge variant={doc.verified ? 'success' : 'warning'}>
                                          {doc.verified ? 'Verified' : 'Pending'}
                                        </Badge>
                                        {!doc.verified && booking.escrowStatus !== 'completed' ? (
                                          <>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              disabled={pendingId === booking.id}
                                              onClick={() => void verify(booking, index, true)}
                                            >
                                              <CheckCircle2 />
                                              Verify
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              disabled={pendingId === booking.id}
                                              onClick={() => void verify(booking, index, false)}
                                            >
                                              <XCircle />
                                              Reject
                                            </Button>
                                          </>
                                        ) : null}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                                <p className="mt-2 text-[11px] text-slate-500">
                                  Document files are never sent to the browser — you verify the type and the paper the
                                  buyer shared with the builder directly.
                                </p>
                              </section>
                            ) : null}

                            <div className="flex flex-wrap gap-2">
                              {booking.escrowStatus === 'token_paid' ? (
                                <Button size="sm" disabled={pendingId === booking.id} onClick={() => void doAccept(booking)}>
                                  {pendingId === booking.id ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                                  Accept booking
                                </Button>
                              ) : null}
                              {booking.flat?.id ? (
                                <Button asChild size="sm" variant="outline">
                                  <Link href={`/flat/${booking.flat.id}`}>View the flat</Link>
                                </Button>
                              ) : null}
                              {booking.loanStatus !== 'not_needed' ? (
                                <Badge variant="info" className="self-center capitalize">
                                  Loan: {booking.loanStatus.replace(/_/g, ' ')}
                                </Badge>
                              ) : null}
                            </div>
                          </CardContent>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>How payouts work</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-[13px] leading-relaxed text-slate-600">
            <li>
              <strong className="text-slate-800">1. Token paid.</strong> Held by the platform in escrow — not by you.
            </li>
            <li>
              <strong className="text-slate-800">2. You accept</strong> and verify the buyer&rsquo;s documents.
            </li>
            <li>
              <strong className="text-slate-800">3. An admin releases escrow:</strong> 90% of the token is allocated to
              you, 10% is retained as platform commission, and an agent&rsquo;s share (30% of the commission by default)
              is carved out of that commission — never from your 90%.
            </li>
            <li>
              <strong className="text-slate-800">4. Final sale commission</strong> is settled offline against an invoice.
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};