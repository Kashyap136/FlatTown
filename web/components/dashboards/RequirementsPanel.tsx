'use client';

import { Loader2, Plus, Target, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/common/States';
import { FlatCard } from '@/components/marketplace/FlatCard';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckboxRow } from '@/components/ui/checkbox';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { POSSESSION_OPTIONS } from '@/lib/filters';
import { formatINR } from '@/lib/price';
import { useCreateRequirement, useRequirementMatches, useRequirements } from '@/hooks/useFlats';
import { requirementsApi } from '@/lib/api';
import { errorMessage } from '@/lib/utils';
import type { ProjectStatus } from '@/lib/types';

const BHK_OPTIONS = [1, 2, 3, 4];

const LAKH = 100_000;

export const RequirementsPanel = () => {
  const { data: requirements, isLoading } = useRequirements();
  const { data: matches } = useRequirementMatches();
  const createRequirement = useCreateRequirement();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const [bhk, setBhk] = useState<number[]>([2]);
  const [budgetMin, setBudgetMin] = useState(40);
  const [budgetMax, setBudgetMax] = useState(80);
  const [city, setCity] = useState('Pune');
  const [locality, setLocality] = useState('');
  const [loanNeeded, setLoanNeeded] = useState(false);
  const [possession, setPossession] = useState<ProjectStatus[]>(['under_construction', 'ready_to_move']);
  const [notes, setNotes] = useState('');

  const submit = async () => {
    setError(null);
    if (bhk.length === 0) {
      setError('Pick at least one configuration.');
      return;
    }
    if (budgetMin * LAKH >= budgetMax * LAKH) {
      setError('Your maximum budget must be higher than your minimum.');
      return;
    }
    try {
      await createRequirement.mutateAsync({
        bhk,
        budgetMin: budgetMin * LAKH,
        budgetMax: budgetMax * LAKH,
        city,
        locality: locality || undefined,
        loanNeeded,
        possessionPreference: possession,
        notes: notes || undefined,
        isActive: true,
        amenities: [],
      });
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the requirement.'));
    }
  };

  const remove = async (id: string) => {
    setRemoving(id);
    try {
      await requirementsApi.remove(id);
      window.location.reload();
    } catch {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* --------------------------- match results -------------------------- */}
      <section aria-labelledby="req-matches" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="req-matches" className="text-base font-bold text-slate-900">
            Matching flats
          </h2>
          <Badge variant={matches?.matches?.length ? 'success' : 'neutral'}>
            {matches?.matches?.length ?? 0} found
          </Badge>
        </div>

        {!matches?.matches?.length ? (
          <EmptyState
            icon={Target}
            compact
            title="No matches yet"
            body="Create a requirement and we will match it against every available flat in your budget."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {matches.matches.map((flat) => (
              <li key={flat.id} className="flex">
                <FlatCard flat={flat} className="w-full" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------ my list ----------------------------- */}
      <section aria-labelledby="req-list" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="req-list" className="text-base font-bold text-slate-900">
            My requirements
          </h2>
          <Button size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? <Loader2 /> : <Plus />}
            {open ? 'Cancel' : 'New requirement'}
          </Button>
        </div>

        {open ? (
          <Card>
            <CardHeader>
              <CardTitle>What are you looking for?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error ? <Alert tone="error">{error}</Alert> : null}

              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold text-slate-900">Configuration</legend>
                <div className="grid grid-cols-4 gap-2">
                  {BHK_OPTIONS.map((value) => {
                    const active = bhk.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setBhk(active ? bhk.filter((v) => v !== value) : [...bhk, value])}
                        aria-pressed={active}
                        className={`rounded-lg border px-2 py-2 text-sm font-semibold transition-colors ${
                          active ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                        }`}
                      >
                        {value} BHK
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Budget from (₹ lakh)" htmlFor="req-min" required>
                  <Input
                    id="req-min"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={budgetMin}
                    onChange={(event) => setBudgetMin(Number(event.target.value))}
                  />
                </Field>
                <Field label="Budget to (₹ lakh)" htmlFor="req-max" required>
                  <Input
                    id="req-max"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={budgetMax}
                    onChange={(event) => setBudgetMax(Number(event.target.value))}
                  />
                </Field>
                <Field label="City" htmlFor="req-city">
                  <Input id="req-city" value={city} onChange={(event) => setCity(event.target.value)} />
                </Field>
                <Field label="Preferred locality (optional)" htmlFor="req-locality">
                  <Input
                    id="req-locality"
                    placeholder="Wakad"
                    value={locality}
                    onChange={(event) => setLocality(event.target.value)}
                  />
                </Field>
              </div>

              <fieldset>
                <legend className="mb-1 text-sm font-semibold text-slate-900">Possession preference</legend>
                {POSSESSION_OPTIONS.map((option) => (
                  <CheckboxRow
                    key={option.value}
                    id={`req-possession-${option.value}`}
                    label={option.label}
                    checked={possession.includes(option.value)}
                    onCheckedChange={() =>
                      setPossession(
                        possession.includes(option.value)
                          ? possession.filter((v) => v !== option.value)
                          : [...possession, option.value],
                      )
                    }
                  />
                ))}
              </fieldset>

              <CheckboxRow
                id="req-loan"
                label="I need loan assistance"
                hint="A Flat Town loan partner will be assigned"
                checked={loanNeeded}
                onCheckedChange={setLoanNeeded}
              />

              <Field label="Notes (optional)" htmlFor="req-notes">
                <Textarea
                  id="req-notes"
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Need possession before March, prefer 10th floor or above"
                />
              </Field>

              <p className="text-xs text-slate-500">
                Budget range: {formatINR(budgetMin * LAKH)} – {formatINR(budgetMax * LAKH)}
              </p>

              <Button onClick={submit} disabled={createRequirement.isPending}>
                {createRequirement.isPending ? <Loader2 className="animate-spin" /> : <Target />}
                Save requirement
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? (
          <div className="h-20 animate-pulse rounded-lg bg-slate-100" role="status" aria-label="Loading requirements" />
        ) : requirements && requirements.length > 0 ? (
          <ul className="space-y-2">
            {requirements.map((requirement) => {
              const id = requirement._id ?? requirement.id ?? '';
              return (
                <li key={id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {requirement.bhk?.join(', ')} BHK · {requirement.city ?? 'Any city'}
                          {requirement.locality ? `, ${requirement.locality}` : ''}
                        </p>
                        <p className="text-xs text-slate-600">
                          {formatINR(requirement.budgetMin)} – {formatINR(requirement.budgetMax)}
                          {requirement.loanNeeded ? ' · Loan needed' : ''}
                        </p>
                        {requirement.notes ? (
                          <p className="mt-0.5 text-[11px] text-slate-500">{requirement.notes}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant={requirement.isActive ? 'success' : 'neutral'}>
                          {requirement.isActive ? 'Active' : 'Paused'}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={removing === id}
                          onClick={() => void remove(id)}
                          aria-label="Delete requirement"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            compact
            title="No requirements saved"
            body="Save your budget and BHK preference to get matched against new inventory."
          />
        )}
      </section>
    </div>
  );
};