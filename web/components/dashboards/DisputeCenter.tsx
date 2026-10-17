'use client';

import { Loader2, Scale } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/common/States';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminActions, useDisputes } from '@/hooks/useFlats';
import { formatDateTime } from '@/lib/price';
import { errorMessage } from '@/lib/utils';

interface Dispute {
  _id?: string;
  id?: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  resolution?: string;
  createdAt: string;
  updatedAt?: string;
  raisedByRole?: string;
  bookingId?: string;
  flatId?: string;
  siteVisitId?: string;
}

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'under_review', label: 'Under review' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

/** The admin dispute centre. */
export const DisputeCenter = () => {
  const [tab, setTab] = useState('open');
  const { data, isLoading } = useDisputes({ limit: 100 }, true);
  const { resolveDispute } = useAdminActions();
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  void error;

  if (isLoading) return <ListSkeleton rows={3} />;

  const all = (data ?? []) as Dispute[];

  const act = async (dispute: Dispute, status: 'resolved' | 'rejected') => {
    const key = dispute._id ?? dispute.id ?? '';
    const resolution = resolutions[key] ?? '';
    if (status === 'resolved' && resolution.trim().length < 5) {
      setError('Record the resolution before closing a dispute.');
      return;
    }
    setPending(key);
    setError(null);
    try {
      await resolveDispute.mutateAsync({ id: key, status, resolution: resolution || undefined });
    } catch (err) {
      setError(errorMessage(err, 'Could not update the dispute.'));
    } finally {
      setPending(null);
    }
  };

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        {TABS.map((item) => (
          <TabsTrigger key={item.key} value={item.key}>
            {item.label}
            {item.key !== 'all' ? ` (${all.filter((d) => d.status === item.key).length})` : ''}
          </TabsTrigger>
        ))}
      </TabsList>

      {TABS.map((item) => {
        const list = item.key === 'all' ? all : all.filter((d) => d.status === item.key);
        return (
          <TabsContent key={item.key} value={item.key}>
            {list.length === 0 ? (
              <EmptyState icon={Scale} preset="none" title="No disputes" body="Nothing in this queue right now." />
            ) : (
              <ul className="space-y-3">
                {list.map((dispute) => {
                  const key = dispute._id ?? dispute.id ?? '';
                  return (
                    <li key={key}>
                      <Card>
                        <CardContent className="space-y-3 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-slate-900">{dispute.subject}</h3>
                              <p className="text-xs text-slate-500">
                                Raised by {dispute.raisedByRole ?? 'a user'} · {formatDateTime(dispute.createdAt)}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <Badge variant="info" className="capitalize">
                                {dispute.category}
                              </Badge>
                              <Badge
                                variant={
                                  dispute.status === 'resolved'
                                    ? 'success'
                                    : dispute.status === 'rejected'
                                      ? 'danger'
                                      : 'warning'
                                }
                                className="capitalize"
                              >
                                {dispute.status.replace(/_/g, ' ')}
                              </Badge>
                            </div>
                          </div>

                          <p className="text-[13px] leading-relaxed text-slate-700">{dispute.description}</p>

                          <div className="flex flex-wrap gap-1.5 text-[11px]">
                            {dispute.bookingId ? <Badge variant="neutral">Booking {dispute.bookingId.slice(0, 8)}</Badge> : null}
                            {dispute.flatId ? <Badge variant="neutral">Flat {dispute.flatId.slice(0, 8)}</Badge> : null}
                            {dispute.siteVisitId ? <Badge variant="neutral">Visit {dispute.siteVisitId.slice(0, 8)}</Badge> : null}
                          </div>

                          {dispute.resolution ? (
                            <Alert tone="success" title="Resolution">
                              {dispute.resolution}
                              {dispute.updatedAt ? ` · ${formatDateTime(dispute.updatedAt)}` : ''}
                            </Alert>
                          ) : null}

                          {['open', 'under_review'].includes(dispute.status) ? (
                            <>
                              <Field label="Resolution" htmlFor={`res-${key}`} hint="Required to resolve, optional to reject.">
                                <Textarea
                                  id={`res-${key}`}
                                  rows={3}
                                  value={resolutions[key] ?? ''}
                                  onChange={(event) =>
                                    setResolutions((current) => ({ ...current, [key]: event.target.value }))
                                  }
                                  placeholder="Refunded the duplicate visit charge and explained the escrow policy."
                                />
                              </Field>
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" disabled={pending === key} onClick={() => void act(dispute, 'resolved')}>
                                  {pending === key ? <Loader2 className="animate-spin" /> : <Scale />}
                                  Resolve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={pending === key}
                                  onClick={() => void act(dispute, 'rejected')}
                                >
                                  Reject
                                </Button>
                              </div>
                            </>
                          ) : null}
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
  );
};