'use client';

import {
  Baby,
  BatteryCharging,
  Building,
  Car,
  Camera,
  Droplets,
  Dumbbell,
  Flame,
  Gamepad2,
  Hammer,
  Landmark,
  Leaf,
  Lock,
  Phone,
  Plug,
  Trees,
  Utensils,
  Waves,
  Wind,
  type LucideIcon,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Amenity } from '@/lib/types';

/** Icon lookup keyed by amenity name, falling back to a neutral glyph. */
const ICONS: Record<string, LucideIcon> = {
  Lift: Building,
  Parking: Car,
  'Covered Parking': Car,
  'Visitor Parking': Car,
  'Swimming Pool': Waves,
  Gym: Dumbbell,
  Security: Lock,
  CCTV: Camera,
  'Power Backup': BatteryCharging,
  'Club House': Landmark,
  "Children's Play Area": Baby,
  Garden: Leaf,
  'Jogging Track': Trees,
  'Sports Area': Dumbbell,
  'Indoor Games': Gamepad2,
  'Fire Safety': Flame,
  Intercom: Phone,
  'Water Supply': Droplets,
  'Rainwater Harvesting': Wind,
  'Community Hall': Utensils,
  'EV Charging': Plug,
  'Solar Panels': Wind,
  'Ambulance Facility': Flame,
  'Multi-purpose Hall': Landmark,
};

const CATEGORY_TITLES: Record<string, string> = {
  lifestyle: 'Lifestyle',
  wellness: 'Wellness & recreation',
  security: 'Safety & security',
  parking: 'Parking',
  utility: 'Utilities',
};

/** Amenity icons grouped by category, as required on the flat detail page. */
export const AmenitiesPanel = ({
  amenities,
  className,
}: {
  amenities: Amenity[];
  className?: string;
}) => {
  if (!amenities || amenities.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Amenities</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[13px] text-slate-600">
            This builder has not published an amenity list yet. Ask them on your site visit.
          </p>
        </CardContent>
      </Card>
    );
  }

  const grouped = amenities.reduce<Record<string, Amenity[]>>((acc, amenity) => {
    const key = amenity.category ?? 'lifestyle';
    acc[key] = [...(acc[key] ?? []), amenity];
    return acc;
  }, {});

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Amenities</CardTitle>
        <p className="text-[13px] text-slate-600">
          {amenities.length} {amenities.length === 1 ? 'amenity' : 'amenities'} across the flat and its project.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {Object.entries(grouped).map(([category, list]) => (
          <section key={category}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              {CATEGORY_TITLES[category] ?? category}
            </h3>
            <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((amenity) => {
                const Icon = ICONS[amenity.name] ?? Hammer;
                return (
                  <li
                    key={amenity.id}
                    className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                    title={amenity.description}
                  >
                    <Icon className={cn('mt-0.5 size-4 shrink-0 text-emerald-700')} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-slate-800">{amenity.name}</span>
                      {amenity.description ? (
                        <span className="block text-[11px] leading-snug text-slate-500">{amenity.description}</span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </CardContent>
    </Card>
  );
};