'use client';

import { EyeOff, Loader2, Star } from 'lucide-react';
import { useState } from 'react';

import { RatingStars } from '@/components/common/Badges';
import { EmptyState } from '@/components/common/States';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminActions, useAdminReviews } from '@/hooks/useFlats';
import { formatDate } from '@/lib/price';
import type { Review } from '@/lib/types';

/** Review moderation queue for admins. */
export const ReviewModeration = () => {
  const [tab, setTab] = useState('all');
  const { data, isLoading } = useAdminReviews({ limit: 100 });
  const { moderateReview } = useAdminActions();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <ListSkeleton rows={4} />;

  const all = (data ?? []) as Review[];

  const act = async (review: Review, action: 'hide' | 'publish') => {
    const id = review._id ?? review.id ?? '';
    setPending(id);
    setError(null);
    try {
      await moderateReview.mutateAsync({ id, action, note: notes[id] || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not moderate the review.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All ({all.length})</TabsTrigger>
          <TabsTrigger value="published">Published</TabsTrigger>
          <TabsTrigger value="hidden">Hidden</TabsTrigger>
        </TabsList>

        {['all', 'published', 'hidden'].map((key) => {
          const list =
            key === 'all'
              ? all
              : key === 'published'
                ? all.filter((r) => r.isPublished !== false)
                : all.filter((r) => r.isPublished === false);
          return (
            <TabsContent key={key} value={key}>
              {list.length === 0 ? (
                <EmptyState icon={Star} preset="none" title="No reviews" body="Nothing in this queue." />
              ) : (
                <ul className="space-y-3">
                  {list.map((review) => {
                    const id = review._id ?? review.id ?? '';
                    const buyer = review.buyer ?? (typeof review.buyerId === 'object' ? review.buyerId : undefined);
                    return (
                      <li key={id}>
                        <Card>
                          <CardContent className="space-y-3 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900">{buyer?.name ?? 'Buyer'}</p>
                                <p className="text-[11px] text-slate-500">
                                  {formatDate(review.createdAt)} · flat {String(review.flatId).slice(0, 8)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <RatingStars value={review.rating} size="sm" showValue={false} />
                                {review.isVerifiedBooking ? (
                                  <Badge variant="success">Verified purchase</Badge>
                                ) : (
                                  <Badge variant="warning">Not linked to a booking</Badge>
                                )}
                                <Badge variant={review.isPublished === false ? 'danger' : 'success'}>
                                  {review.isPublished === false ? 'Hidden' : 'Published'}
                                </Badge>
                              </div>
                            </div>

                            <p className="text-[13px] leading-relaxed text-slate-700">{review.comment}</p>

                            <Field label="Moderation note (optional)" htmlFor={`mod-${id}`}>
                              <Input
                                id={`mod-${id}`}
                                value={notes[id] ?? ''}
                                onChange={(event) => setNotes((current) => ({ ...current, [id]: event.target.value }))}
                                placeholder="Contains personal information"
                              />
                            </Field>

                            <div className="flex flex-wrap gap-2">
                              {review.isPublished === false ? (
                                <Button size="sm" disabled={pending === id} onClick={() => void act(review, 'publish')}>
                                  {pending === id ? <Loader2 className="animate-spin" /> : <Star />}
                                  Republish
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={pending === id}
                                  onClick={() => void act(review, 'hide')}
                                >
                                  {pending === id ? <Loader2 className="animate-spin" /> : <EyeOff />}
                                  Hide
                                </Button>
                              )}
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
    </div>
  );
};