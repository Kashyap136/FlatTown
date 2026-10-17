'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Loader2, Plus, Save } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { POSSESSION_OPTIONS } from '@/lib/filters';
import { useAmenities, useCreateProject, useProjects } from '@/hooks/useFlats';
import { errorMessage, fieldErrors } from '@/lib/utils';

/**
 * Project creation.
 *
 * A new project is created unpublished: it appears publicly only after an admin
 * approves it, and `isRERAVerified` is never set from here (RULE 5).
 */
const schema = z.object({
  projectName: z.string().trim().min(3, 'Project name must be at least 3 characters').max(160),
  city: z.string().trim().min(2, 'City is required').max(80),
  locality: z.string().trim().min(2, 'Locality is required').max(120),
  fullAddress: z.string().trim().min(10, 'Give a full, searchable address').max(500),
  description: z.string().trim().max(4000).optional(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  possessionDate: z.string().min(1, 'Possession date is required'),
  status: z.enum(['new_launch', 'under_construction', 'ready_to_move']),
  reraNumber: z.string().trim().max(40).optional(),
});

type FormValues = z.infer<typeof schema>;

const addDays = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export const ProjectForm = () => {
  const createProject = useCreateProject();
  const { data: existing } = useProjects({ builderScope: 'mine', limit: 5 });
  const { data: amenities } = useAmenities();
  const [amenityIds, setAmenityIds] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      projectName: '',
      city: 'Pune',
      locality: '',
      fullAddress: '',
      description: '',
      lat: 18.53,
      lng: 73.89,
      possessionDate: addDays(540),
      status: 'under_construction',
      reraNumber: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const response = await createProject.mutateAsync({
        projectName: values.projectName,
        city: values.city,
        locality: values.locality,
        fullAddress: values.fullAddress,
        description: values.description,
        geo: { lat: values.lat, lng: values.lng },
        possessionDate: new Date(values.possessionDate).toISOString(),
        status: values.status,
        reraNumber: values.reraNumber || undefined,
        amenities: amenityIds,
        images: [],
      });
      setCreated({ id: response.data.project.id, name: response.data.project.projectName });
    } catch (error) {
      const fields = fieldErrors(error);
      Object.entries(fields).forEach(([field, message]) => {
        setError(field as keyof FormValues, { message });
      });
      setServerError(errorMessage(error, 'Could not create the project.'));
    }
  });

  if (created) {
    return (
      <Card>
        <CardContent className="space-y-4 p-5">
          <Alert tone="success" title="Project created">
            <strong>{created.name}</strong> has been saved. An admin will review it before it goes live on the
            marketplace.
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={`/builder/flats/new?projectId=${created.id}`}>Add a flat to this project</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/project/${created.id}`}>View the project page</Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
              Create another
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
            <Building2 className="size-4 text-emerald-700" aria-hidden="true" />
            Project details
          </CardTitle>
          <p className="text-[13px] text-slate-600">
            Total price and tier are never entered here — they are calculated per flat from size × price per sq ft.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {serverError ? <Alert tone="error">{serverError}</Alert> : null}

            <Field label="Project name" htmlFor="pf-name" error={errors.projectName?.message} required>
              <Input id="pf-name" placeholder="Sahyadri Heights" aria-invalid={Boolean(errors.projectName)} {...register('projectName')} />
            </Field>

            <Field
              label="Description"
              htmlFor="pf-desc"
              error={errors.description?.message}
              hint="What makes this project different? Buyers read this on the project page."
            >
              <Textarea id="pf-desc" rows={4} {...register('description')} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="City" htmlFor="pf-city" error={errors.city?.message} required>
                <Input id="pf-city" aria-invalid={Boolean(errors.city)} {...register('city')} />
              </Field>
              <Field label="Locality" htmlFor="pf-locality" error={errors.locality?.message} required>
                <Input
                  id="pf-locality"
                  placeholder="Wakad"
                  list="pf-locality-options"
                  aria-invalid={Boolean(errors.locality)}
                  {...register('locality')}
                />
                <datalist id="pf-locality-options">
                  {['Pimpri', 'Wakad', 'Baner', 'Koregaon Park', 'Viman Nagar', 'Hinjewadi'].map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </Field>
            </div>

            <Field label="Full address" htmlFor="pf-address" error={errors.fullAddress?.message} required>
              <Input
                id="pf-address"
                placeholder="Survey 118/2, Baner–Pashan Link Road, Pune 411045"
                aria-invalid={Boolean(errors.fullAddress)}
                {...register('fullAddress')}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Latitude" htmlFor="pf-lat" error={errors.lat?.message} hint="Used for the map location">
                <Input id="pf-lat" type="number" step="0.00001" aria-invalid={Boolean(errors.lat)} {...register('lat')} />
              </Field>
              <Field label="Longitude" htmlFor="pf-lng" error={errors.lng?.message}>
                <Input id="pf-lng" type="number" step="0.00001" aria-invalid={Boolean(errors.lng)} {...register('lng')} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Possession date" htmlFor="pf-possession" error={errors.possessionDate?.message} required>
                <Input
                  id="pf-possession"
                  type="date"
                  aria-invalid={Boolean(errors.possessionDate)}
                  {...register('possessionDate')}
                />
              </Field>
              <Field label="Status" htmlFor="pf-status" error={errors.status?.message} required>
                <select
                  id="pf-status"
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  {...register('status')}
                >
                  {POSSESSION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field
              label="RERA registration number"
              htmlFor="pf-rera"
              error={errors.reraNumber?.message}
              hint="Submitting a number does not verify it — an admin checks it against the state registry."
            >
              <Input id="pf-rera" placeholder="P52100012345" {...register('reraNumber')} />
            </Field>

            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-slate-900">Project amenities</legend>
              <p className="mb-2 text-[11px] text-slate-500">
                Buyers filter on these with all-required matching, so pick everything you genuinely offer.
              </p>
              <div className="grid max-h-56 grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto rounded-lg border border-slate-200 p-3 sm:grid-cols-3">
                {(amenities ?? []).map((amenity) => (
                  <label key={amenity.id} className="flex items-center gap-2 text-[13px] text-slate-700">
                    <input
                      type="checkbox"
                      checked={amenityIds.includes(amenity.id)}
                      onChange={(event) =>
                        setAmenityIds((current) =>
                          event.target.checked
                            ? [...current, amenity.id]
                            : current.filter((id) => id !== amenity.id),
                        )
                      }
                      className="size-4 rounded border-slate-400 text-emerald-700 focus:ring-emerald-600"
                    />
                    {amenity.name}
                  </label>
                ))}
              </div>
            </fieldset>

            <Button type="submit" disabled={isSubmitting} size="lg">
              {isSubmitting ? <Loader2 className="animate-spin" /> : <Plus />}
              {isSubmitting ? 'Creating…' : 'Create project'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <aside className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>What happens next</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2.5 text-[13px] leading-relaxed text-slate-600">
              <li>
                <strong className="text-slate-800">1. Admin approval.</strong> Your project stays hidden from the
                marketplace until an admin approves it.
              </li>
              <li>
                <strong className="text-slate-800">2. RERA verification.</strong> An admin verifies your RERA number
                against the state registry. Verified projects rank above unverified ones in search.
              </li>
              <li>
                <strong className="text-slate-800">3. Add flats.</strong> Enter size, price per sq ft and optional floor
                rise or parking charges — the total and tier are calculated for you.
              </li>
            </ol>
          </CardContent>
        </Card>

        {existing && existing.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Your recent projects</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {existing.map((project) => (
                  <li key={project.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="min-w-0 truncate text-slate-700">{project.projectName}</span>
                    <Badge variant={project.isApproved ? 'success' : 'warning'}>
                      {project.isApproved ? 'Live' : 'Pending'}
                    </Badge>
                  </li>
                ))}
              </ul>
              <Button asChild size="sm" variant="outline" block className="mt-3">
                <Link href="/builder">
                  <Save />
                  Back to dashboard
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="p-4 text-[12px] leading-relaxed text-slate-600">
            Listing price range on the project page is derived from your flats: minimum total price to maximum. Nothing
            is typed in by hand, so the two can never disagree.
          </CardContent>
        </Card>
      </aside>
    </div>
  );
};