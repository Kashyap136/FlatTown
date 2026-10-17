'use client';

import { ExternalLink, Loader2, MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface Marker {
  lat: number;
  lng: number;
  label?: string;
  /** Small caption rendered in the info card. */
  address?: string;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

export const hasMapboxToken = (): boolean => Boolean(MAPBOX_TOKEN);

/**
 * Property / project location map.
 *
 * Production path: a real interactive Mapbox GL map with a marker, navigation
 * controls, scale and popups. The GL bundle is imported dynamically so it is
 * never part of the initial page payload for visitors without a token.
 *
 * Without a token the component degrades to a coordinate panel with
 * Google Maps / OpenStreetMap deep links — honest about not having a live map,
 * and never a broken iframe. The address is always reachable without the map.
 */
export const MapView = ({
  marker,
  markers,
  className,
  height = 'h-72',
  zoom = 14,
}: {
  marker?: Marker | null;
  /** Multiple pins (e.g. a project's available flats). */
  markers?: Marker[];
  className?: string;
  height?: string;
  zoom?: number;
}) => {
  const all = markers?.length ? markers : marker ? [marker] : [];

  if (!all.length || all.every((m) => m.lat === 0 && m.lng === 0)) {
    return (
      <div className={cn('rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center', height, className)}>
        <p className="text-sm font-medium text-slate-700">Location not available</p>
        <p className="mt-1 text-xs text-slate-500">
          This builder has not published an exact map position yet.
        </p>
      </div>
    );
  }

  const primary = marker ?? all[0];

  return (
    <div className={cn('space-y-3', className)}>
      {MAPBOX_TOKEN ? (
        <MapboxCanvas markers={all} height={height} zoom={zoom} primary={primary} />
      ) : (
        <MapFallback marker={primary} height={height} />
      )}
    </div>
  );
};

/** Live Mapbox GL canvas, loaded lazily so the bundle stays out of the first paint. */
const MapboxCanvas = ({
  markers,
  height,
  zoom,
  primary,
}: {
  markers: Marker[];
  height: string;
  zoom: number;
  primary: Marker;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        await import('mapbox-gl/dist/mapbox-gl.css');
        if (cancelled || !containerRef.current || mapRef.current) return;

        mapboxgl.accessToken = MAPBOX_TOKEN;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [primary.lng, primary.lat],
          zoom,
          attributionControl: true,
        });

        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
        map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

        // A DOM marker is used rather than a GeoJSON source so the popup can
        // carry real markup (address + label) and stay accessible.
        const popup = new mapboxgl.Popup({ offset: 18, closeButton: false }).setHTML(
          `<strong>${escapeHtml(primary.label ?? primary.address ?? 'Project location')}</strong>` +
            (primary.address && primary.label ? `<br/><span>${escapeHtml(primary.address)}</span>` : '') +
            `<br/><span>${primary.lat.toFixed(5)}, ${primary.lng.toFixed(5)}</span>`,
        );

        for (const m of markers) {
          const el = document.createElement('button');
          el.type = 'button';
          el.setAttribute('aria-label', m.label ?? m.address ?? 'Map marker');
          el.style.cssText =
            'width:30px;height:30px;border-radius:9999px;border:3px solid #fff;background:#047857;' +
            'box-shadow:0 2px 6px rgba(0,0,0,.35);cursor:pointer;';
          new mapboxgl.Marker(el).setLngLat([m.lng, m.lat]).setPopup(popup).addTo(map);
        }

        map.on('load', () => setFailed(false));
        mapRef.current = map;
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    void boot();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [markers, primary, zoom]);

  if (failed) {
    return <MapFallback marker={primary} height={height} />;
  }

  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100', height)}>
      <div ref={containerRef} className="size-full" role="application" aria-label="Property location map" />
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm">
        {primary.label ?? primary.address ?? 'Project location'}
      </div>
    </div>
  );
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/**
 * Token-free fallback.
 *
 * Renders the coordinates with "open in maps" links rather than pretending to
 * be a live map.
 */
const MapFallback = ({ marker, height }: { marker: Marker; height: string }) => {
  const googleMapsHref = `https://www.google.com/maps/search/?api=1&query=${marker.lat},${marker.lng}`;
  const openStreetMapHref = `https://www.openstreetmap.org/?mlat=${marker.lat}&mlon=${marker.lng}#map=15/${marker.lat}/${marker.lng}`;

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-100')}>
      <div className={cn('flex flex-col justify-center gap-1 p-4', height)}>
        <div className="flex items-center gap-2 text-slate-400">
          <MapPin className="size-5 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium text-slate-700">
            {marker.label ?? 'Project location'}
          </span>
        </div>
        {marker.address ? <p className="pl-7 text-xs text-slate-600">{marker.address}</p> : null}
        <p className="pl-7 text-[11px] tabular-nums text-slate-400">
          {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
        </p>
        <p className="pl-7 flex items-center gap-1.5 text-[11px] text-slate-400">
          <Loader2 className="size-3" aria-hidden="true" />
          Interactive map off — coordinates above
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white p-3">
        <Button asChild size="sm" variant="outline">
          <a href={googleMapsHref} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden="true" />
            Open in Google Maps
          </a>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <a href={openStreetMapHref} target="_blank" rel="noopener noreferrer">
            OpenStreetMap
          </a>
        </Button>
        {!MAPBOX_TOKEN ? (
          <p className="w-full text-[11px] text-slate-500">
            Set <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> for the interactive
            Mapbox GL view with markers and controls.
          </p>
        ) : null}
      </div>
    </div>
  );
};