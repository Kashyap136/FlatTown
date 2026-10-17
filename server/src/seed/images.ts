import { DEFAULT_BUILDER_RATING } from '../models/User';

/**
 * Seed imagery.
 *
 * Photos are served from the public Unsplash image CDN so the seed database is
 * useful immediately without any Cloudinary account. Every ID below was
 * verified to return HTTP 200 `image/jpeg` at build time.
 *
 * These are stock photos of Indian housing stock supplied by Unsplash's free
 * licence. Swap them for Cloudinary-hosted assets by uploading through the
 * builder dashboard — the app stores only URLs, so nothing else changes.
 */

const UNSPLASH = 'https://images.unsplash.com';

/** Full-size project / hero photography. */
export const EXTERIORS = [
  'photo-1545324418-cc1a3fa10c00',
  'photo-1541971875076-8f970d573be6',
  'photo-1512917774080-9991f1c4c750',
  'photo-1484154218962-a197022b5858',
  'photo-1564013799919-ab600027ffc6',
  'photo-1518780664697-55e3ad937233',
  'photo-1570129477492-45c003edd2be',
  'photo-1449844908441-8829872d2607',
  'photo-1568605114967-8130f3a36994',
  'photo-1600596542815-ffad4c1539a9',
  'photo-1600585154340-be6161a56a0c',
  'photo-1605276374104-dee2a0ed3cd6',
] as const;

/** Interior photography used for flat galleries. */
export const INTERIORS = [
  'photo-1600596542815-ffad4c1539a9',
  'photo-1600607687939-ce8a6c25118c',
  'photo-1600607687920-4e2a09cf159d',
  'photo-1600566753086-00f18fb6b3ea',
  'photo-1600573472550-8090b5e0745e',
  'photo-1600047509807-ba8f99d2cdde',
  'photo-1600585154526-990dced4db0d',
  'photo-1502672260266-1c1ef2d93688',
  'photo-1522708323590-d24dbb6b0267',
  'photo-1560448204-e02f11c3d0e2',
  'photo-1560185007-cde436f6a4d0',
  'photo-1600210492486-724fe5c67fb0',
  'photo-1616486338812-3dadae4b4ace',
  'photo-1493809842364-78817add7ffb',
  'photo-1502005229762-cf1b2da7c5d6',
  'photo-1580587771525-78b9dba3b914',
  'photo-1600047509358-9dc75507daeb',
  'photo-1600566753190-17f0baa2a6c3',
  'photo-1600121848594-d8644e57abab',
] as const;

/** Amenity / lifestyle photography used on project pages. */
export const AMENITY_SHOTS = [
  'photo-1530549387789-4c1017266635',
  'photo-1576013551627-0cc20b96c2a7',
  'photo-1517649763962-0c623066013b',
  'photo-1550340499-a6c60fc8287c',
  'photo-1558618666-fcd25c85cd64',
  'photo-1561283890-5d858c23b2ea',
  'photo-1517836357463-d25dfeac3438',
  'photo-1540497077202-7c8a3999166f',
  'photo-1571902943202-507ec2618e8f',
  'photo-1582268611958-ebfd161ef9cf',
] as const;

/** Deterministic pseudo-random so re-seeding produces identical galleries. */
export const pickImages = (pool: readonly string[], count: number, seed: number): string[] => {
  const out: string[] = [];
  const taken = new Set<number>();
  let cursor = seed * 7919;
  while (out.length < count && taken.size < pool.length) {
    cursor = (cursor * 31 + 17) % 9973;
    const idx = cursor % pool.length;
    if (taken.has(idx)) continue;
    taken.add(idx);
    out.push(pool[idx]);
  }
  return out;
};

export const buildUrl = (photoId: string): string =>
  `${UNSPLASH}/${photoId}?auto=format&fit=crop&w=1200&q=70`;

export const buildThumbUrl = (photoId: string): string =>
  `${UNSPLASH}/${photoId}?auto=format&fit=crop&w=800&q=70`;

export const buildWideUrl = (photoId: string): string =>
  `${UNSPLASH}/${photoId}?auto=format&fit=crop&w=1600&q=75`;

/** Amenity names, kept in sync with `DEFAULT_AMENITIES` in ./data.ts. */
export const AMENITY_LOOKUP = [
  'Lift',
  'Parking',
  'Swimming Pool',
  'Gym',
  'Security',
  'CCTV',
  'Power Backup',
  'Club House',
  "Children's Play Area",
  'Garden',
  'Jogging Track',
  'Sports Area',
  'Indoor Games',
  'Visitor Parking',
  'Fire Safety',
  'Intercom',
  'Water Supply',
  'Rainwater Harvesting',
  'Community Hall',
  'EV Charging',
] as const;

/** The 20 documented amenities referenced by the seed inventory. */
export const pickAmenities = (names: readonly string[]): string[] => [...names];

export const mediaList = (
  photoIds: readonly string[],
  kind: 'image' | 'floor_plan' = 'image',
): Array<{ url: string; kind: 'image' | 'floor_plan' }> =>
  photoIds.map((id) => ({ url: kind === 'image' ? buildWideUrl(id) : buildUrl(id), kind }));

export const DEFAULT_RATING = DEFAULT_BUILDER_RATING;