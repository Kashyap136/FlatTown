'use client';

import { CalendarDays, CheckCircle2, Clock, IndianRupee, Loader2, MessageSquare, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { EmptyState } from '@/components/common/States';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useVisitActions, useVisitList } from '@/hooks/useFlats';
import { formatDate, formatDateTime, formatINR } from '@/lib/price';
import { errorMessage } from '@/lib/utils';
import type { SiteVisit, VisitStatus } from '@/lib/types';

const TABS: Array<{ key: VisitStatus | 'all'; label: string }> = [
  { key: 'requested', label: 'Awaiting confirmation' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];

/** Builder/agent visit management — the visit calendar's action surface. */
export const BuilderVisits = () => {
  const [tab, setTab] = useState<VisitStatus | 'all'>('requested');
  const { data, isLoading } = useVisitList({ scope: 'builder', limit: 60 });
  const { updateStatus } = useVisitActions();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = (data ?? []) as SiteVisit[];

  const act = async (visit: SiteVisit, status: VisitStatus) => {
    setPendingId(visit.id);
    setError(null);
    try {
      await updateStatus.mutateAsync({
        id: visit.id,
        status,
        notes: notes[visit.id] || undefined,
      });
    } catch (err) {
      setError(errorMessage(err, `Could not mark the visit as ${status}.`));
    } finally {
      setPendingId(null);
    }
  };

  if (isLoading) return <ListSkeleton rows={3} />;

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as VisitStatus | 'all')}>
        <TabsList>
          {TABS.map((item) => (
            <TabsTrigger key={item.key} value={item.key}>
              {item.label}
              {item.key !== 'all' ? ` (${all.filter((v) => v.status === item.key).length})` : ''}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((item) => {
          const rows = item.key === 'all' ? all : all.filter((v) => v.status === item.key);
          return (
            <TabsContent key={item.key} value={item.key}>
              {rows.length === 0 ? (
                <EmptyState preset="visits" compact title="Nothing here" body="Visit requests from buyers land on this tab." />
              ) : (
                <ul className="space-y-3">
                  {rows.map((visit) => (
                    <li key={visit.id}>
                      <Card>
                        <CardContent className="space-y-3 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h2 className="truncate text-sm font-semibold text-slate-900">
                                {visit.flat?.title ?? 'Flat'} · {visit.project?.projectName ?? 'Project'}
                              </h2>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {visit.reference} · {visit.buyer?.name ?? 'Buyer'}
                                {visit.buyer?.phone ? ` · ${visit.buyer.phone}` : ''}
                              </p>
                            </div>
                            <Badge
                              variant={
                                visit.status === 'completed'
                                  ? 'neutral'
                                  : visit.status === 'cancelled'
                                    ? 'danger'
                                    : visit.status === 'confirmed'
                                      ? 'success'
                                      : 'info'
                              }
                              className="capitalize"
                            >
                              {visit.status}
                            </Badge>
                          </div>

                          <dl className="grid gap-2 text-[13px] sm:grid-cols-4">
                            <div className="flex items-center gap-1.5">
                              <CalendarDays className="size-3.5 text-slate-500" aria-hidden="true" />
                              <span>
                                <span className="block text-[11px] text-slate-500">Date</span>
                                <span className="font-medium text-slate-800">{formatDate(visit.slot?.date)}</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Clock className="size-3.5 text-slate-500" aria-hidden="true" />
                              <span>
                                <span className="block text-[11px] text-slate-500">Slot</span>
                                <span className="font-medium text-slate-800">{visit.slot?.time}</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <IndianRupee className="size-3.5 text-slate-500" aria-hidden="true" />
                              <span>
                                <span className="block text-[11px] text-slate-500">Charge</span>
                                <span className="font-medium text-slate-800">
                                  {visit.visitCharge > 0 ? formatINR(visit.visitCharge) : 'Free'}
                                </span>
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <MessageSquare className="size-3.5 text-slate-500" aria-hidden="true" />
                              <span>
                                <span className="block text-[11px] text-slate-500">Visitors</span>
                                <span className="font-medium text-slate-800">{visit.visitorCount ?? 1}</span>
                              </span>
                            </div>
                          </dl>

                          {visit.requirements ? (
                            <p className="rounded-lg bg-slate-50 p-2.5 text-[13px] text-slate-700">
                              <span className="font-medium">Buyer note:</span> {visit.requirements}
                              {visit.loanAssistanceRequired ? (
                                <Badge variant="info" className="ml-2">
                                  Loan assistance
                                </Badge>
                              ) : null}
                            </p>
                          ) : null}

                          {visit.visitCharge > 0 && visit.paymentStatus !== 'paid' ? (
                            <Alert tone="warning" title="Charge not paid">
                              This visit cannot be confirmed until the buyer pays the {formatINR(visit.visitCharge)}{' '}
                              charge. It is credited to the platform and fully refunded if they book.
                            </Alert>
                          ) : null}

                          {visit.status === 'requested' || visit.status === 'confirmed' ? (
                            <>
                              <Field label="Note for the buyer (optional)" htmlFor={`note-${visit.id}`}>
                                <Input
                                  id={`note-${visit.id}`}
                                  value={notes[visit.id] ?? ''}
                                  onChange={(event) =>
                                    setNotes((current) => ({ ...current, [visit.id]: event.target.value }))
                                  }
                                  placeholder="Please carry your ID; gate 2."
                                />
                              </Field>

                              <div className="flex flex-wrap gap-2">
                                {visit.status === 'requested' ? (
                                  <Button
                                    size="sm"
                                    disabled={pendingId === visit.id || visit.paymentStatus === 'pending'}
                                    onClick={() => void act(visit, 'confirmed')}
                                  >
                                    {pendingId === visit.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                                    Confirm visit
                                  </Button>
                                ) : null}
                                {visit.status === 'confirmed' ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={pendingId === visit.id}
                                    onClick={() => void act(visit, 'completed')}
                                  >
                                    {pendingId === visit.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                                    Mark completed
                                  </Button>
                                ) : null}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={pendingId === visit.id}
                                  onClick={() => void act(visit, 'cancelled')}
                                >
                                  <XCircle />
                                  Decline
                                </Button>
                                {visit.flat?.id ? (
                                  <Button asChild size="sm" variant="ghost">
                                    <Link href={`/flat/${visit.flat.id}`}>View the flat</Link>
                                  </Button>
                                ) : null}
                              </div>
                            </>
                          ) : (
                            <p className="text-[12px] text-slate-500">
                              {visit.builderNotes ? `Your note: ${visit.builderNotes} · ` : ''}
                              Updated {formatDateTime(visit.updatedAt ?? visit.createdAt)}
                              {visit.bookingId ? (
                                <>
                                  {' · '}
                                  <Link href={`/builder/bookings?booking=${visit.bookingId}`} className="font-semibold underline">
                                    became a booking
                                  </Link>
                                </>
                              ) : null}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
};