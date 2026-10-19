'use client';

import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';

import { RERABadge } from '@/components/common/Badges';
import { Button } from '@/components/ui/button';
import { CheckboxRow } from '@/components/ui/checkbox';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { SwitchRow } from '@/components/ui/switch';
import { FACING_OPTIONS, POSSESSION_OPTIONS, TIER_OPTIONS, TYPE_OPTIONS } from '@/lib/filters';
import { LAKH, formatCompactINR } from '@/lib/price';
import { useAmenities } from '@/hooks/useFlats';
import { countActiveFilters, useFilterStore } from '@/store/useFilterStore';
import type { Amenity } from '@/lib/types';

/** Token caps offered alongside the price bands. */
const TOKEN_CAP_OPTIONS = [
  { label: 'Token up to ₹50,000', hint: 'Lowest upfront commitment', max: 50_000 },
  { label: 'Token up to ₹1,00,000', hint: 'Most popular', max: 100_000 },
  { label: 'Token up to ₹2,00,000', hint: 'Stronger negotiation position', max: 200_000 },
];

/** Price bands offered by the drawer — aligned with the tier thresholds. */
const PRICE_BANDS = [
  { label: 'Under ₹40L', min: 0, max: 4_000_000 },
  { label: '₹40L – ₹50L', min: 4_000_000, max: 5_000_000 },
  { label: '₹50L – ₹1Cr', min: 5_000_000, max: 10_000_000 },
  { label: '₹1Cr – ₹1.5Cr', min: 10_000_000, max: 15_000_000 },
  { label: '₹1.5Cr – ₹3Cr', min: 15_000_000, max: 30_000_000 },
  { label: 'Above ₹3Cr', min: 30_000_000, max: 0 },
];

const AMENITY_ICON: Record<string, string> = {
  Lift: '🛗',
  Parking: '🅿️',
  'Covered Parking': '🅿️',
  'Visitor Parking': '🅿️',
  'Swimming Pool': '🏊',
  Gym: '🏋️',
  Security: '🛡️',
  CCTV: '📹',
  'Power Backup': '🔋',
  'Club House': '🏛️',
  "Children's Play Area": '🛝',
  Garden: '🌿',
  'Jogging Track': '🏃',
  'Sports Area': '⚽',
  'Indoor Games': '🎾',
  'Fire Safety': '🧯',
  Intercom: '📞',
  'Water Supply': '💧',
  'Rainwater Harvesting': '🌧️',
  'Community Hall': '🏛️',
  'EV Charging': '🔌',
};

/**
 * The filter drawer.
 *
 * Rendered as a bottom sheet on mobile and as an inline sidebar from `lg` up,
 * so the same filter logic serves every viewport without a second component.
 */
export const FilterDrawer = ({ localities = [] }: { localities?: string[] }) => {
  const state = useFilterStore();
  const { data: amenities } = useAmenities();
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  // The Radix Drawer is controlled here: the "Show results" button must be able
  // to close it. Writing to the filter store alone could not do that, because
  // the Radix root had no `open` binding.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeCount = countActiveFilters(state);

  const priceBounds = useMemo(() => {
    const min = state.priceMin || 0;
    const max = state.priceMax || 60_000_000;
    return max > min ? [min, max] : [min, Math.min(60_000_000, min + 5_000_000)];
  }, [state.priceMin, state.priceMax]);

  const visibleAmenities: Amenity[] = (amenities ?? []).slice(0, showAllAmenities ? 40 : 8);

  const setBand = (band: { min: number; max: number }) => {
    state.patch({ priceMin: band.min, priceMax: band.max, page: 1 });
  };

  const activeBand = PRICE_BANDS.find(
    (band) => band.min === state.priceMin && band.max === state.priceMax,
  );

  const body = (
    <div className="space-y-6">
      {/* ------------------------------ price ----------------------------- */}
      <fieldset>
        <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-900">Price range</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {PRICE_BANDS.map((band) => {
            const active = activeBand?.label === band.label;
            return (
              <button
                key={band.label}
                type="button"
                onClick={() => (active ? state.patch({ priceMin: 0, priceMax: 0, page: 1 }) : setBand(band))}
                aria-pressed={active}
                className={`rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                  active
                    ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {band.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
            <label htmlFor="ft-price-min" className="font-medium">
              Custom range
            </label>
            <span className="tabular-nums">
              {formatCompactINR(priceBounds[0])} – {formatCompactINR(priceBounds[1])}
            </span>
          </div>
          <Slider
            id="ft-price-min"
            min={0}
            max={60_000_000}
            step={LAKH}
            value={priceBounds}
            onValueChange={(value) => {
              const [min, max] = value;
              state.patch({ priceMin: min, priceMax: max > 55_000_000 ? 0 : max, page: 1 });
            }}
            aria-label="Price range"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input
              id="ft-price-min-input"
              type="number"
              min={0}
              step={LAKH}
              inputMode="numeric"
              aria-label="Minimum price in rupees"
              defaultValue={state.priceMin || ''}
              placeholder="Min ₹"
              onBlur={(event) => state.patch({ priceMin: Number(event.target.value) || 0, page: 1 })}
            />
            <Input
              type="number"
              min={0}
              step={LAKH}
              inputMode="numeric"
              aria-label="Maximum price in rupees"
              defaultValue={state.priceMax || ''}
              placeholder="Max ₹"
              onBlur={(event) => state.patch({ priceMax: Number(event.target.value) || 0, page: 1 })}
            />
          </div>
        </div>
      </fieldset>

      {/* ---------------------------- possession --------------------------- */}
      <fieldset>
        <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-900">Possession</legend>
        <div className="space-y-0.5">
          {POSSESSION_OPTIONS.map((option) => (
            <CheckboxRow
              key={option.value}
              id={`ft-possession-${option.value}`}
              label={option.label}
              checked={state.possession.includes(option.value)}
              onCheckedChange={() => state.toggleIn('possession', option.value)}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          Ready to move means the possession date is today or earlier.
        </p>
      </fieldset>

      {/* ----------------------------- amenities --------------------------- */}
      <fieldset>
        <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-900">Amenities</legend>
        <p className="mb-1.5 text-[11px] text-slate-500">Every selected amenity must be present in the flat.</p>
        <div className="space-y-0.5">
          {visibleAmenities.map((amenity) => (
            <CheckboxRow
              key={amenity.id}
              id={`ft-amenity-${amenity.id}`}
              label={`${AMENITY_ICON[amenity.name] ? `${AMENITY_ICON[amenity.name]} ` : ''}${amenity.name}`}
              hint={amenity.description}
              checked={state.amenities.includes(amenity.id)}
              onCheckedChange={() => state.toggleIn('amenities', amenity.id)}
            />
          ))}
        </div>
        {(amenities?.length ?? 0) > 8 ? (
          <Button variant="link" size="sm" className="mt-1 px-0" onClick={() => setShowAllAmenities((v) => !v)}>
            {showAllAmenities ? 'Show fewer amenities' : `Show all ${amenities?.length} amenities`}
          </Button>
        ) : null}
      </fieldset>

      {/* ------------------------------ builder ---------------------------- */}
      <fieldset>
        <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-900">Builder trust</legend>
        <SwitchRow
          id="ft-rera-only"
          label="RERA verified only"
          hint="Only projects verified by the platform admin"
          checked={state.reraOnly}
          onCheckedChange={(value) => state.patch({ reraOnly: value, page: 1 })}
        />
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <label htmlFor="ft-rating" className="font-medium text-slate-700">
              Minimum builder rating
            </label>
            <span className="font-semibold tabular-nums text-slate-900">
              {state.builderRatingMin > 0 ? `${state.builderRatingMin.toFixed(1)}+` : 'Any'}
            </span>
          </div>
          <Slider
            id="ft-rating"
            min={0}
            max={5}
            step={0.5}
            value={[state.builderRatingMin]}
            onValueChange={([value]) => state.patch({ builderRatingMin: value, page: 1 })}
            aria-label="Minimum builder rating"
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>Any</span>
            <span>5.0</span>
          </div>
        </div>
      </fieldset>

      {/* ----------------------------- token cap --------------------------- */}
      <fieldset>
        <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-900">Booking token</legend>
        {TOKEN_CAP_OPTIONS.map((option) => (
          <CheckboxRow
            key={option.label}
            id={`ft-token-${option.max}`}
            label={option.label}
            hint={option.hint}
            checked={state.tokenMax === option.max}
            onCheckedChange={(checked) => state.patch({ tokenMax: checked ? option.max : 0, page: 1 })}
          />
        ))}
      </fieldset>

      {/* ------------------------------ location --------------------------- */}
      <fieldset>
        <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-900">Location</legend>
        {localities.length ? (
          <div className="space-y-0.5">
            {localities.slice(0, 12).map((locality) => (
              <CheckboxRow
                key={locality}
                id={`ft-locality-${locality}`}
                label={locality}
                checked={state.locality === locality}
                onCheckedChange={(checked) => state.patch({ locality: checked ? locality : '', page: 1 })}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Select a city from the header to see its localities.</p>
        )}

        <div className="mt-3 space-y-0.5">
          {TYPE_OPTIONS.map((option) => (
            <CheckboxRow
              key={option.value}
              id={`ft-type-${option.value}`}
              label={option.label}
              checked={state.type.includes(option.value)}
              onCheckedChange={() => state.toggleIn('type', option.value)}
            />
          ))}
        </div>

        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">Facing</summary>
          <div className="mt-1 space-y-0.5">
            {FACING_OPTIONS.map((option) => (
              <CheckboxRow
                key={option.value}
                id={`ft-facing-${option.value}`}
                label={option.label}
                checked={state.facing.includes(option.value)}
                onCheckedChange={() => state.toggleIn('facing', option.value)}
              />
            ))}
          </div>
        </details>

        <SwitchRow
          id="ft-include-sold"
          label="Include sold-out units"
          hint="Show flats that are no longer available"
          checked={state.includeUnavailable}
          onCheckedChange={(value) => state.patch({ includeUnavailable: value, page: 1 })}
          className="mt-2"
        />
      </fieldset>

      <div className="flex gap-2 border-t border-slate-200 pt-4">
        <Button
          variant="outline"
          block
          onClick={() => state.resetAdvanced()}
          disabled={activeCount === 0}
        >
          <RotateCcw />
          Clear filters
        </Button>
        <DrawerCloseButton onClose={() => setDrawerOpen(false)} />
      </div>

      {state.reraOnly ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-600">
          <RERABadge verified size="sm" />
          Showing RERA-verified projects only.
        </p>
      ) : null}
    </div>
  );

  return (
    <>
      {/* Mobile / tablet: a bottom sheet triggered from the results bar. */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerTrigger asChild>
          <Button variant="outline" size="sm" className="lg:hidden">
            <SlidersHorizontal />
            Filters
            {activeCount > 0 ? (
              <span className="ml-1 rounded-full bg-slate-900 px-1.5 text-[11px] font-bold text-white">
                {activeCount}
              </span>
            ) : null}
          </Button>
        </DrawerTrigger>
        <DrawerContent
          side="bottom"
          title="Filters"
          description="Refine your search — every filter applies to all results"
          className="sm:max-w-lg"
        >
          {body}
        </DrawerContent>
      </Drawer>

      {/* Desktop: a persistent sidebar. */}
      <aside className="hidden w-[280px] shrink-0 lg:block xl:w-[300px]">
        <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Filters
            </h2>
            {activeCount > 0 ? (
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">
                {activeCount}
              </span>
            ) : null}
          </div>
          {body}
        </div>
      </aside>
    </>
  );
};

/** Closes the enclosing drawer once filters are applied (mobile only). */
const DrawerCloseButton = ({ onClose }: { onClose: () => void }) => (
  <Button block onClick={onClose} className="lg:hidden">
    Show results
  </Button>
);

/** Tier chips used above the results grid. */
export const TierChips = () => {
  const tiers = useFilterStore((s) => s.tier);
  const toggleIn = useFilterStore((s) => s.toggleIn);

  return (
    <div className="ft-scroll-x" role="group" aria-label="Filter by price tier">
      {TIER_OPTIONS.map((option) => {
        const active = tiers.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggleIn('tier', option.value)}
            aria-pressed={active}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              active
                ? 'border-emerald-700 bg-emerald-700 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {option.label}
            <span className={`ml-1.5 font-medium ${active ? 'text-emerald-100' : 'text-slate-500'}`}>
              {option.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
};

/** BHK tabs. */
export const BhkTabs = () => {
  const bhk = useFilterStore((s) => s.bhk);
  const toggleIn = useFilterStore((s) => s.toggleIn);

  return (
    <div className="ft-scroll-x" role="group" aria-label="Filter by configuration">
      <button
        type="button"
        onClick={() => bhk.forEach((v) => toggleIn('bhk', v))}
        aria-pressed={bhk.length === 0}
        className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
          bhk.length === 0 ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
        } border border-slate-200`}
      >
        All
      </button>
      {[1, 2, 3, 4].map((value) => {
        const active = bhk.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => toggleIn('bhk', value)}
            aria-pressed={active}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              active ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
            } border border-slate-200`}
          >
            {value} BHK
          </button>
        );
      })}
    </div>
  );
};