'use client';

import { BadgeCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * The green RERA Verified badge.
 *
 * RULE 5/6: only a Flat Town admin can set `isRERAVerified` (via
 * `PUT /admin/verify-rera/:builderId`), and verified listings receive priority
 * ranking in discovery — so the badge must be unmistakable.
 */
export const RERABadge = ({
  verified,
  reraNumber,
  size = 'md',
  className,
}: {
  verified?: boolean | null;
  reraNumber?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) => {
  if (!verified) {
    return (
      <Badge
        variant="neutral"
        size={size}
        className={className}
        title={reraNumber ? `RERA ${reraNumber} submitted — awaiting admin verification` : 'No RERA registration submitted'}
      >
        RERA pending
      </Badge>
    );
  }

  return (
    <Badge
      variant="rera"
      size={size}
      className={cn('gap-1', className)}
      title={reraNumber ? `RERA ${reraNumber} — verified by the Flat Town admin` : 'RERA verified'}
    >
      <BadgeCheck className="size-3.5" aria-hidden="true" />
      RERA Verified
    </Badge>
  );
};