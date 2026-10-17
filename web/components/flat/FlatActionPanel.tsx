'use client';

import { ArrowRight, CalendarDays, Heart, IndianRupee, Loader2, Scale, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckboxRow } from '@/components/ui/checkbox';
import { InquiryForm } from '@/components/flat/InquiryForm';
import { SiteVisitModal } from '@/components/flat/SiteVisitModal';
import { useToggleWishlist } from '@/hooks/useFlats';
import { formatINR } from '@/lib/price';
import { MAX_COMPARE, useCompareStore, useWishlistStore } from '@/store/useCompareStore';
import { useAuthStore } from '@/store/useAuthStore';
import { toastError } from '@/components/ui/toast';
import type { FlatDetail } from '@/lib/types';

/**
 * The sticky conversion panel on the flat page: price, wishlist, compare, site
 * visit and the booking entry point.
 */
export const FlatActionPanel = ({ flat }: { flat: FlatDetail }) => {
  const user = useAuthStore((s) => s.user);
  const toggleWishlist = useToggleWishlist();
  const wishlisted = useWishlistStore((s) => s.ids.includes(flat.id));
  const compareIds = useCompareStore((s) => s.ids);
  const toggleCompare = useCompareStore((s) => s.toggle);
  const inCompare = compareIds.includes(flat.id);

  const [visitOpen, setVisitOpen] = useState(false);
  const [loanNeeded, setLoanNeeded] = useState(false);
  const [inquiryDone, setInquiryDone] = useState(false);

  const onCompare = () => {
    const result = toggleCompare(flat.id);
    if (result === 'full') toastError('You can compare up to 3 flats', 'Remove one from the compare tray first.');
  };

  return (
    <>
      <Card className="border-slate-300">
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="text-3xl font-black tabular-nums leading-none text-slate-900">
              {formatINR(flat.totalPrice)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Booking token {formatINR(flat.tokenAmount)} · held in escrow
            </p>
          </div>

          {!flat.isAvailable ? (
            <Alert tone="warning" title="This flat is sold out">
              It stays visible for reference, but you can no longer reserve it.
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={wishlisted ? 'primary' : 'outline'}
              onClick={() => (user ? toggleWishlist.mutate(flat.id) : undefined)}
              disabled={!user || toggleWishlist.isPending}
              aria-pressed={wishlisted}
            >
              {toggleWishlist.isPending ? <Loader2 className="animate-spin" /> : <Heart className={wishlisted ? 'fill-current' : ''} />}
              {wishlisted ? 'Saved' : 'Save'}
            </Button>
            <Button variant={inCompare ? 'primary' : 'outline'} onClick={onCompare} aria-pressed={inCompare}>
              <Scale />
              {inCompare ? 'In compare' : 'Compare'}
            </Button>
          </div>

          <Button
            block
            variant="outline"
            onClick={() => {
              if (navigator.share) {
                void navigator.share({ title: flat.title, url: window.location.href }).catch(() => undefined);
              } else {
                void navigator.clipboard?.writeText(window.location.href);
              }
            }}
          >
            <Share2 />
            Share this flat
          </Button>

          {flat.isAvailable ? (
            <>
              <Button block size="lg" onClick={() => setVisitOpen(true)}>
                <CalendarDays />
                Book a site visit
              </Button>
              <Button asChild block size="lg" variant="secondary">
                <Link href={`/booking/${flat.id}`}>
                  <IndianRupee />
                  Reserve with a token
                </Link>
              </Button>
              <p className="text-center text-[11px] text-slate-500">
                In escrow: 90% to the builder after admin verification, 10% platform commission on the token only.
              </p>
            </>
          ) : null}

          <CheckboxRow
            id="ft-panel-loan"
            label="I want loan assistance"
            hint="A Flat Town loan partner is assigned after the booking progresses"
            checked={loanNeeded}
            onCheckedChange={setLoanNeeded}
            className="border-t border-slate-100 pt-3"
          />

          {inquiryDone ? null : (
            <InquiryForm
              flatId={flat.id}
              onSubmitted={() => setInquiryDone(true)}
              className="border-t border-slate-100 pt-1"
            />
          )}

          {inquiryDone ? (
            <p className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 p-3 text-[13px] text-emerald-900">
              Inquiry sent — book a visit next.
              <Link href="/buyer" className="shrink-0 font-semibold underline">
                Dashboard
              </Link>
            </p>
          ) : null}

          <p className="text-[11px] text-slate-400">
            You can compare up to {MAX_COMPARE} flats at a time
            {compareIds.length ? ` (${compareIds.length} selected)` : ''}.
          </p>
          <Link
            href="/compare"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
          >
            Open the compare tray
            <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        </CardContent>
      </Card>

      <SiteVisitModal
        open={visitOpen}
        onOpenChange={setVisitOpen}
        flatId={flat.id}
        flatTitle={flat.title}
        visitCharge={flat.visitCharge}
        loanAssistanceRequired={loanNeeded}
      />
    </>
  );
};