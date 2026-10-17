'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Calculator, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'next/navigation';
import { z } from 'zod';

import { TierBadge } from '@/components/common/Badges';
import { EmptyState } from '@/components/common/States';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { formatArea, formatINR, formatPossession, formatRate, priceBreakdown } from '@/lib/price';
import { useAmenities, useCreateFlat, useProjects } from '@/hooks/useFlats';
import { errorMessage, fieldErrors } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';

const schema = z.object({
  projectId: z.string().min(1, 'Choose a project'),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(140),
  bhk: z.coerce.number().int().min(1).max(4),
  type: z.enum(['apartment', 'villa', 'penthouse']),
  sizeSqft: z.coerce.number().min(200, 'Minimum size is 200 sq ft').max(20000),
  pricePerSqft: z.coerce.number().min(100, 'Minimum rate is ₹100 per sq ft').max(1000000),
  floorRise: z.coerce.number().min(0).default(0),
  parkingCharges: z.coerce.number().min(0).default(0),
  floor: z.coerce.number().int().min(0).max(200),
  tower: z.string().trim().max(40).optional(),
  facing: z
    .enum(['east', 'west', 'north', 'south', 'north_east', 'north_west', 'south_east', 'south_west'])
    .optional(),
  possessionDate: z.string().min(1, 'Possession date is required'),
  visitCharge: z.coerce.number().min(0).default(0),
  tokenAmount: z.coerce.number().min(1000).default(50_000),
});

type FormValues = z.infer<typeof schema>;

const addDays = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const FACINGS = ['east', 'west', 'north', 'south', 'north_east', 'north_west', 'south_east', 'south_west'];

/**
 * Flat creation.
 *
 * Only the inputs that affect price are collected. `totalPrice` and `tier`
 * are recomputed server-side (RULE 2/3) — the preview below mirrors that math
 * purely so the builder sees the number before submitting.
 */
export const FlatForm = () => {
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const { data: projects } = useProjects({ limit: 50, approvedOnly: user?.role === 'builder' ? undefined : undefined });
  const { data: amenities } = useAmenities();
  const createFlat = useCreateFlat();

  const [amenityIds, setAmenityIds] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; title: string; total: number; tier: string } | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      projectId: searchParams.get('projectId') ?? '',
      title: '',
      bhk: 2,
      type: 'apartment',
      sizeSqft: 1000,
      pricePerSqft: 7000,
      floorRise: 0,
      parkingCharges: 0,
      floor: 4,
      tower: '',
      facing: 'east',
      possessionDate: addDays(540),
      visitCharge: 0,
      tokenAmount: 50_000,
    },
  });

  const values = watch();

  const preview = useMemo(
    () =>
      priceBreakdown({
        sizeSqft: Number(values.sizeSqft) || 0,
        pricePerSqft: Number(values.pricePerSqft) || 0,
        floorRise: Number(values.floorRise) || 0,
        parkingCharges: Number(values.parkingCharges) || 0,
      }),
    [values.sizeSqft, values.pricePerSqft, values.floorRise, values.parkingCharges],
  );

  const onSubmit = handleSubmit(async (form) => {
    setServerError(null);
    try {
      const response = await createFlat.mutateAsync({
        projectId: form.projectId,
        title: form.title,
        bhk: form.bhk,
        type: form.type,
        sizeSqft: form.sizeSqft,
        pricePerSqft: form.pricePerSqft,
        floorRise: form.floorRise,
        parkingCharges: form.parkingCharges,
        floor: form.floor,
        tower: form.tower || undefined,
        facing: form.facing,
        possessionDate: new Date(form.possessionDate).toISOString(),
        visitCharge: form.visitCharge,
        tokenAmount: form.tokenAmount,
        amenities: amenityIds,
        images: [],
        isAvailable: true,
      });
      const flat = response.data.flat;
      setCreated({ id: flat.id, title: flat.title, total: flat.totalPrice, tier: flat.tier });
    } catch (error) {
      const fields = fieldErrors(error);
      Object.entries(fields).forEach(([field, message]) => {
        setError(field as keyof FormValues, { message });
      });
      setServerError(errorMessage(error, 'Could not list the flat.'));
    }
  });

  if (created) {
    return (
      <Card>
        <CardContent className="space-y-4 p-5">
          <Alert tone="success" title="Flat listed">
            <strong>{created.title}</strong> is live at {formatINR(created.total)} — tier{' '}
            <TierBadge tier={created.tier} size="sm" />, calculated by the platform from{' '}
            {formatArea(Number(values.sizeSqft))} × {formatRate(Number(values.pricePerSqft))}.
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={`/flat/${created.id}`}>View the listing</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCreated(null)}>
              List another flat
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="size-4 text-emerald-700" aria-hidden="true" />
            Flat details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {serverError ? <Alert tone="error">{serverError}</Alert> : null}

            <Field label="Project" htmlFor="ff-project" error={errors.projectId?.message} required>
              <select
                id="ff-project"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                aria-invalid={Boolean(errors.projectId)}
                {...register('projectId')}
              >
                <option value="">Select a project</option>
                {(projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.projectName} — {project.locality}, {project.city}
                    {project.isApproved ? '' : ' (awaiting admin approval)'}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Listing title"
              htmlFor="ff-title"
              error={errors.title?.message}
              required
              hint="Buyers see this first — for example “2BHK Sky View”."
            >
              <Input id="ff-title" placeholder="2BHK Sky View" aria-invalid={Boolean(errors.title)} {...register('title')} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="BHK" htmlFor="ff-bhk" error={errors.bhk?.message} required>
                <select id="ff-bhk" className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" {...register('bhk')}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n} BHK
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Type" htmlFor="ff-type" error={errors.type?.message} required>
                <select id="ff-type" className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" {...register('type')}>
                  <option value="apartment">Apartment</option>
                  <option value="villa">Villa</option>
                  <option value="penthouse">Penthouse</option>
                </select>
              </Field>
              <Field label="Floor" htmlFor="ff-floor" error={errors.floor?.message} required hint="0 = ground">
                <Input id="ff-floor" type="number" min={0} {...register('floor')} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tower (optional)" htmlFor="ff-tower">
                <Input id="ff-tower" placeholder="A" {...register('tower')} />
              </Field>
              <Field label="Facing" htmlFor="ff-facing">
                <select id="ff-facing" className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" {...register('facing')}>
                  <option value="">Not specified</option>
                  {FACINGS.map((facing) => (
                    <option key={facing} value={facing}>
                      {facing.replace('_', '-')}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* ------------------------ price inputs ----------------------- */}
            <fieldset className="rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-bold uppercase tracking-wider text-slate-900">Pricing</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Carpet area (sq ft)" htmlFor="ff-size" error={errors.sizeSqft?.message} required>
                  <Input id="ff-size" type="number" min={200} step={1} {...register('sizeSqft')} />
                </Field>
                <Field label="Price per sq ft (₹)" htmlFor="ff-rate" error={errors.pricePerSqft?.message} required>
                  <Input id="ff-rate" type="number" min={100} step={50} {...register('pricePerSqft')} />
                </Field>
                <Field label="Floor rise (₹, optional)" htmlFor="ff-floorrise" error={errors.floorRise?.message}>
                  <Input id="ff-floorrise" type="number" min={0} step={1000} {...register('floorRise')} />
                </Field>
                <Field label="Parking charges (₹, optional)" htmlFor="ff-parking" error={errors.parkingCharges?.message}>
                  <Input id="ff-parking" type="number" min={0} step={1000} {...register('parkingCharges')} />
                </Field>
              </div>

              {/* Live mirror of the server calculation. */}
              <div className="mt-3 rounded-lg bg-slate-50 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <Calculator className="size-3" aria-hidden="true" />
                  Calculated by the platform
                </p>
                <dl className="mt-2 space-y-1 text-[13px]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-600">
                      Base total ({Number(values.sizeSqft || 0).toLocaleString('en-IN')} ×{' '}
                      {formatINR(Number(values.pricePerSqft || 0))})
                    </dt>
                    <dd className="font-medium tabular-nums text-slate-900">{formatINR(preview.baseTotal)}</dd>
                  </div>
                  {preview.floorRise > 0 ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-600">Floor rise</dt>
                      <dd className="font-medium tabular-nums text-slate-900">+{formatINR(preview.floorRise)}</dd>
                    </div>
                  ) : null}
                  {preview.parkingCharges > 0 ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-600">Parking charges</dt>
                      <dd className="font-medium tabular-nums text-slate-900">+{formatINR(preview.parkingCharges)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-2 border-t border-slate-200 pt-1">
                    <dt className="font-semibold text-slate-800">Total price</dt>
                    <dd className="text-lg font-bold tabular-nums text-slate-900">{formatINR(preview.totalPrice)}</dd>
                  </div>
                </dl>
                <div className="mt-2 flex items-center gap-2">
                  <TierBadge tier={preview.tier} showRange />
                  <span className="text-[11px] text-slate-500">
                    {preview.tier === 'budget'
                      ? 'Under ₹50 lakh'
                      : preview.tier === 'mid'
                        ? '₹50 lakh – ₹1.5 crore'
                        : '₹1.5 crore and above'}
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  {formatRate(Number(values.pricePerSqft || 0))} per sq ft. These figures are recomputed on the server —
                  whatever is submitted is ignored, so the listing can never disagree with this panel.
                </p>
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Possession date" htmlFor="ff-possession" error={errors.possessionDate?.message} required>
                <Input id="ff-possession" type="date" {...register('possessionDate')} />
              </Field>
              <Field
                label="Site visit charge (₹)"
                htmlFor="ff-visit"
                error={errors.visitCharge?.message}
                hint="0, 199 or 499. Verified builders get 2 free visits first."
              >
                <select
                  id="ff-visit"
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  {...register('visitCharge')}
                >
                  <option value={0}>Free (₹0)</option>
                  <option value={199}>₹199</option>
                  <option value={499}>₹499</option>
                </select>
              </Field>
            </div>

            <Field
              label="Booking token (₹)"
              htmlFor="ff-token"
              error={errors.tokenAmount?.message}
              hint="The amount buyers pay into escrow. Commission is 10% of this, never of the property price."
            >
              <select
                id="ff-token"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                {...register('tokenAmount')}
              >
                {[50_000, 100_000, 200_000, 500_000].map((amount) => (
                  <option key={amount} value={amount}>
                    {formatINR(amount)}
                  </option>
                ))}
              </select>
            </Field>

            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-slate-900">Amenities</legend>
              <div className="grid max-h-48 grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto rounded-lg border border-slate-200 p-3 sm:grid-cols-3">
                {(amenities ?? []).map((amenity) => (
                  <label key={amenity.id} className="flex items-center gap-2 text-[13px] text-slate-700">
                    <input
                      type="checkbox"
                      checked={amenityIds.includes(amenity.id)}
                      onChange={(event) =>
                        setAmenityIds((current) =>
                          event.target.checked ? [...current, amenity.id] : current.filter((id) => id !== amenity.id),
                        )
                      }
                      className="size-4 rounded border-slate-400 text-emerald-700 focus:ring-emerald-600"
                    />
                    {amenity.name}
                  </label>
                ))}
              </div>
            </fieldset>

            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : <Plus />}
              {isSubmitting ? 'Listing…' : 'List this flat'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <aside className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>How pricing works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-[13px] leading-relaxed text-slate-600">
            <p>
              <strong className="text-slate-800">Total price</strong> = carpet area × price per sq ft + optional floor
              rise + optional parking charges.
            </p>
            <p>
              <strong className="text-slate-800">Tier</strong> is derived from that total: Budget below ₹50 lakh, Mid up
              to ₹1.5 crore, Luxury above. You cannot choose a tier.
            </p>
            <p>
              <strong className="text-slate-800">Commission</strong> is 10% of the booking token only. On a ₹1.2 crore
              flat with a ₹50,000 token, the platform earns ₹5,000 — not ₹12 lakh.
            </p>
          </CardContent>
        </Card>

        {!projects || projects.length === 0 ? (
          <EmptyState
            preset="projects"
            compact
            title="No projects yet"
            body="Add and get a project approved before listing flats."
            actionLabel="Add a project"
            actionHref="/builder/projects/new"
          />
        ) : null}

        {values.possessionDate ? (
          <Card>
            <CardContent className="p-4 text-[12px] text-slate-600">
              Possession on {formatPossession(values.possessionDate)}. A possession date on or before today means the
              flat shows as <strong>Ready to move</strong> in the marketplace filter.
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="p-4 text-[12px] text-slate-600">
            <Badge variant="info">Tip</Badge>{' '}
            Transparent rate cards convert better: listing ₹7,000/sq ft with a 1,000 sq ft unit shows as ₹70 lakh, Mid
            tier, straight away.
          </CardContent>
        </Card>
      </aside>
    </div>
  );
};