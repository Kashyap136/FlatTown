'use client';

import { MessageSquarePlus, Star } from 'lucide-react';
import { useState } from 'react';

import { RatingStars } from '@/components/common/Badges';
import { EmptyState } from '@/components/common/States';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { useCreateReview, useFlatReviews } from '@/hooks/useFlats';
import { formatDate } from '@/lib/price';
import type { ReviewList } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';

const SCORE_LABELS: Record<string, string> = {
  onTimePossession: 'On-time possession',
  constructionQuality: 'Construction quality',
  transparency: 'Pricing transparency',
};

/** Public review list plus the verified-buyer review form. */
export const ReviewsSection = ({
  flatId,
  bookingId,
  canReview,
  className,
}: {
  flatId: string;
  bookingId?: string;
  canReview?: boolean;
  className?: string;
}) => {
  const { data, isLoading } = useFlatReviews(flatId);
  const user = useAuthStore((s) => s.user);

  return (
    <section className={cn('space-y-4', className)} aria-labelledby="ft-reviews-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ft-reviews-heading" className="text-base font-bold text-slate-900">
          Buyer reviews
        </h2>
        {data ? <RatingStars value={data.summary.avg} count={data.summary.count} /> : null}
      </div>

      {canReview && user ? <ReviewForm flatId={flatId} bookingId={bookingId} /> : null}

      {isLoading ? (
        <div className="space-y-3" role="status" aria-label="Loading reviews">
          {[0, 1, 2].map((index) => (
            <div key={index} className="rounded-lg border border-slate-200 p-4">
              <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-3 w-full animate-pulse rounded bg-slate-100" />
              <div className="mt-1.5 h-3 w-4/5 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : !data || data.reviews.length === 0 ? (
        <EmptyState
          compact
          preset="none"
          title="No reviews yet"
          body="Only buyers with a completed booking can review a builder, so every rating here is from a real purchase."
        />
      ) : (
        <>
          <ReviewDistribution distribution={data.distribution} />
          <ul className="space-y-3">
            {data.reviews.map((review) => {
              const buyer = review.buyer ?? (typeof review.buyerId === 'object' ? review.buyerId : undefined);
              return (
                <li key={review._id ?? `${review.buyerId}-${review.flatId}`}>
                  <Card>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {buyer?.name ?? 'Verified buyer'}
                          </p>
                          <p className="text-[11px] text-slate-500">{formatDate(review.createdAt)}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <RatingStars value={review.rating} size="sm" showValue={false} />
                          {review.isVerifiedBooking ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                              Verified purchase
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <p className="text-[13px] leading-relaxed text-slate-700">{review.comment}</p>
                      {review.scores ? (
                        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-[11px] sm:grid-cols-3">
                          {Object.entries(review.scores).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between gap-2">
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
        </>
      )}
    </section>
  );
};

const ReviewDistribution = ({ distribution }: { distribution: ReviewList['distribution'] }) => {
  const total = distribution.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return null;
  return (
    <Card>
      <CardContent className="space-y-1.5 p-4">
        {[5, 4, 3, 2, 1].map((star) => {
          const row = distribution.find((entry) => entry.rating === star);
          const count = row?.count ?? 0;
          const percent = total ? Math.round((count / total) * 100) : 0;
          return (
            <div key={star} className="flex items-center gap-2 text-[11px]">
              <span className="w-8 shrink-0 tabular-nums text-slate-600">{star} ★</span>
              <span
                className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"
                role="img"
                aria-label={`${star} star: ${count} reviews (${percent}%)`}
              >
                <span className="block h-full rounded-full bg-amber-400" style={{ width: `${percent}%` }} />
              </span>
              <span className="w-8 shrink-0 text-right tabular-nums text-slate-500">{count}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

/** Review composer, shown only after a completed booking. */
const ReviewForm = ({ flatId, bookingId }: { flatId: string; bookingId?: string }) => {
  const createReview = useCreateReview(flatId, bookingId);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (rating < 1) {
      setError('Please pick a rating from 1 to 5.');
      return;
    }
    if (comment.trim().length < 10) {
      setError('Please write at least 10 characters so the review helps other buyers.');
      return;
    }
    try {
      await createReview.mutateAsync({ rating, comment: comment.trim() });
      setRating(0);
      setComment('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit the review.');
    }
  };

  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <CardContent className="space-y-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Star className="size-4 text-emerald-700" aria-hidden="true" />
          Rate this builder
        </h3>

        <div>
          <span className="text-xs font-medium text-slate-700">Your rating</span>
          <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Rating out of 5">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} star${value > 1 ? 's' : ''}`}
                onMouseEnter={() => setHovered(value)}
                onMouseLeave={() => setHovered(0)}
                onClick={() => setRating(value)}
                className="p-1 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                <Star
                  className={cn(
                    'size-7',
                    (hovered || rating) >= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300',
                  )}
                  aria-hidden="true"
                />
              </button>
            ))}
            {rating > 0 ? (
              <span className="ml-2 self-center text-sm font-semibold text-slate-800">{rating}/5</span>
            ) : null}
          </div>
        </div>

        <Field label="Your review" htmlFor="ft-review-comment" error={error ?? undefined}>
          <Textarea
            id="ft-review-comment"
            rows={4}
            maxLength={1500}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="How was construction quality? Was possession on time?"
          />
        </Field>

        <Button onClick={submit} disabled={createReview.isPending}>
          <MessageSquarePlus />
          {createReview.isPending ? 'Submitting…' : 'Submit review'}
        </Button>
      </CardContent>
    </Card>
  );
};

export { Alert };