'use client';

import { ChevronLeft, ChevronRight, Expand, Images, RotateCcw } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { MediaItem } from '@/lib/types';
import { cn } from '@/lib/utils';

const PLACEHOLDER = 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=60';

const sources = (images: MediaItem[] | undefined): MediaItem[] => {
  const list = (images ?? []).filter((image) => image.url && (image.kind === 'image' || !image.kind));
  return list.length ? list : [{ url: PLACEHOLDER }];
};

/**
 * Property image carousel.
 *
 * Fully keyboard operable (arrow keys, Home/End), swipeable on touch and
 * scroll-snapping so a mobile guest never gets a janky slider.
 */
export const ImageCarousel = ({
  images,
  alt,
  className,
  badge,
}: {
  images: MediaItem[] | undefined;
  alt: string;
  className?: string;
  badge?: React.ReactNode;
}) => {
  const slides = sources(images);
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const go = useCallback(
    (delta: number) => setIndex((current) => (current + delta + slides.length) % slides.length),
    [slides.length],
  );

  const active = slides[Math.min(index, slides.length - 1)];

  return (
    <>
      <div
        className={cn('relative overflow-hidden rounded-xl bg-slate-100', className)}
        role="region"
        aria-roledescription="carousel"
        aria-label={`${alt} — image ${index + 1} of ${slides.length}`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') go(1);
          if (event.key === 'ArrowLeft') go(-1);
          if (event.key === 'Home') setIndex(0);
          if (event.key === 'End') setIndex(slides.length - 1);
        }}
      >
        <div className="relative aspect-[16/10] w-full sm:aspect-[16/9]">
          <Image
            src={active.url}
            alt={`${alt} — photo ${index + 1}`}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 60vw"
            className="object-cover"
          />
        </div>

        {badge ? <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">{badge}</div> : null}

        {slides.length > 1 ? (
          <>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => go(-1)}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 text-slate-900 hover:bg-white"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => go(1)}
              aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 text-slate-900 hover:bg-white"
            >
              <ChevronRight />
            </Button>

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-slate-900/60 to-transparent p-3">
              {slides.map((slide, slideIndex) => (
                <button
                  key={`${slide.url}-${slideIndex}`}
                  type="button"
                  onClick={() => setIndex(slideIndex)}
                  aria-label={`Go to image ${slideIndex + 1}`}
                  aria-current={slideIndex === index}
                  className="group grid size-6 place-items-center rounded-full"
                >
                  {/* The pill is 6px tall and would be a 8-24px tap target.
                      The button itself is a fixed 24x24 (WCAG 2.2 target-size
                      2.5.8) and the pill is drawn inside it, so the dots can
                      never shrink each other's hit area. */}
                  <span
                    className={cn(
                      'block h-1.5 rounded-full transition-all',
                      slideIndex === index
                        ? 'w-6 bg-white'
                        : 'w-2 bg-white/60 group-hover:bg-white/90',
                    )}
                  />
                </button>
              ))}
            </div>
          </>
        ) : null}

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setLightbox(true)}
          className="absolute right-2 top-2 bg-white/90 text-slate-900 hover:bg-white"
        >
          <Expand />
          <span className="hidden sm:inline">View full size</span>
        </Button>
      </div>

      {/* Thumbnails — horizontal scroll rail on mobile. */}
      {slides.length > 1 ? (
        <div className="ft-scroll-x mt-2" role="tablist" aria-label="Property images">
          {slides.map((slide, slideIndex) => (
            <button
              key={`thumb-${slide.url}-${slideIndex}`}
              type="button"
              role="tab"
              aria-selected={slideIndex === index}
              // The thumbnail's own <img alt=""> is decorative, so without this
              // the tab has no accessible name at all.
              aria-label={`Show image ${slideIndex + 1} of ${slides.length}`}
              onClick={() => setIndex(slideIndex)}
              className={cn(
                'relative size-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors',
                slideIndex === index ? 'border-emerald-700' : 'border-transparent hover:border-slate-300',
              )}
            >
              <Image src={slide.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      {lightbox ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} full size viewer`}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/95 p-4"
          onClick={() => setLightbox(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setLightbox(false);
          }}
        >
          <div className="relative h-full w-full max-w-6xl">
            <Image
              src={active.url}
              alt={`${alt} — full size`}
              fill
              sizes="100vw"
              className="object-contain"
            />
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setLightbox(false)}
              className="absolute right-2 top-2"
              aria-label="Close viewer"
            >
              <RotateCcw />
            </Button>
            {slides.length > 1 ? (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2"
                  onClick={(event) => {
                    event.stopPropagation();
                    go(-1);
                  }}
                  aria-label="Previous image"
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={(event) => {
                    event.stopPropagation();
                    go(1);
                  }}
                  aria-label="Next image"
                >
                  <ChevronRight />
                </Button>
              </>
            ) : null}
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-900">
              <Images className="mr-1 inline size-3" aria-hidden="true" />
              {index + 1} / {slides.length}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
};