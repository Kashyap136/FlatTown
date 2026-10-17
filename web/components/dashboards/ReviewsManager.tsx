'use client';

import { MessageSquareWarning, Star } from 'lucide-react';

import { RatingStars } from '@/components/common/Badges';
import { EmptyState } from '@/components/common/States';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { ListSkeleton } from '@/components/ui/skeleton';
import { reviewsApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { formatDate } from '@/lib/price';
import type { Review } from '@/lib/types';

const SCORE_LABELS: Record<string, string> = {
  onTimePossession: 'On-time possession',
  constructionQuality: 'Construction quality',
  transparency: 'Pricing transparency',
};

/** Builder view of the verified-buyer reviews that make up their rating. */
export const ReviewsManager = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reviews', 'builder'],
    queryFn: () => reviewsApi.list({ builderScope: 'mine', limit: 60 }),
  });

  if (isLoading) return <ListSkeleton rows={3} />;
  if (isError) {
    return <Alert tone="error" title="Could not load your reviews">Please refresh and try again.</Alert>;
  }

  const reviews = (data?.data ?? []) as Review[];
  const avg = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  const lowest = reviews.length ? Math.min(...reviews.map((r) => r.rating)) : 0;

  const scoreAverages = reviews.reduce<Record<string, number>>((acc, review) => {
    Object.entries(review.scores ?? {}).forEach(([key, value]) => {
      acc[key] = (acc[key] ?? 0) + (value as number);
    });
    return acc;
  }, {});

  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={Star}
        preset="none"
        title="No reviews yet"
        body="Buyers can review you once a booking is completed. New builders start at a 3.5 rating so you are discoverable from day one."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Average rating" value={`${avg.toFixed(1)} / 5`} icon={<Star className="size-5" />} tone="brand" />
        <StatCard label="Verified reviews" value={reviews.length} />
        <StatCard label="Lowest score" value={`${lowest} / 5`} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Score breakdown</CardTitle>
          <p className="text-[13px] text-slate-600">
            What buyers actually rated you on, averaged across every verified review.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(scoreAverages).map(([key, total]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-700">{SCORE_LABELS[key] ?? key}</span>
              <span className="flex items-center gap-2">
                <RatingStars value={total / reviews.length} size="sm" />
                <span className="text-sm font-semibold tabular-nums text-slate-900">
                  {(total / reviews.length).toFixed(1)}
                </span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <section aria-labelledby="rm-list" className="space-y-3">
        <h2 id="rm-list" className="text-base font-bold text-slate-900">
          All reviews
        </h2>
        <ul className="space-y-3">
          {reviews.map((review) => {
            const buyer = review.buyer ?? (typeof review.buyerId === 'object' ? review.buyerId : undefined);
            return (
              <li key={review._id ?? `${review.buyerId}-${review.flatId}`}>
                <Card>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{buyer?.name ?? 'Verified buyer'}</p>
                        <p className="text-[11px] text-slate-500">{formatDate(review.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <RatingStars value={review.rating} size="sm" showValue={false} />
                        {review.isVerifiedBooking ? (
                          <Badge variant="success">Verified purchase</Badge>
                        ) : (
                          <Badge variant="neutral">Not linked to a booking</Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-[13px] leading-relaxed text-slate-700">{review.comment}</p>
                    {review.scores ? (
                      <dl className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-[11px]">
                        {Object.entries(review.scores).map(([key, value]) => (
                          <div key={key} className="flex items-center gap-1">
                            <dt className="text-slate-500">{SCORE_LABELS[key] ?? key}</dt>
                            <dd className="font-semibold tabular-nums text-slate-800">{value}/5</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <Alert tone="warning" title="Ratings are moderated by an admin">
        <p className="flex items-start gap-1.5">
          <MessageSquareWarning className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Reviews that breach the platform guidelines can be hidden by a Flat Town admin. Builders cannot moderate or
            delete their own reviews — reply through support instead.
          </span>
        </p>
      </Alert>
    </div>
  );
};