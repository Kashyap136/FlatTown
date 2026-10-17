import { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { Amenity } from '../models/Amenity';
import { Flat, type FlatType, type Facing } from '../models/Flat';
import { PlatformConfig } from '../models/PlatformConfig';
import { Project, type ProjectStatus } from '../models/Project';
import { Requirement } from '../models/Requirement';
import { Review } from '../models/Review';
import { User } from '../models/User';
import { Wishlist } from '../models/Wishlist';
import { DEFAULT_CITIES } from './data';
import { EXTERIORS, INTERIORS, AMENITY_SHOTS, buildUrl, mediaList, pickImages } from './images';
import { loadPlatformConfig } from '../services/platformConfig.service';
import { recalculateProjectStats } from '../services/project.service';
import { recalculateBuilderRating } from '../controllers/reviews.controller';
import { seedAmenities } from './seedAmenities';
import { seedCities } from './seedCities';
import { DEMO_USERS, upsertDemoUser, DEMO_PASSWORD } from './seedUsers';

/**
 * Deterministic demo marketplace.
 *
 * Everything is expressed relative to "today" so the possession-status rules
 * (ready_to_move ⇔ possessionDate <= now) always hold, and re-seeding is
 * idempotent: projects are matched on slug and flats on their deterministic
 * `title`, so running this twice does not duplicate inventory.
 */

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number): Date => new Date(Date.now() + days * DAY);
const inMonths = (months: number): Date => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d;
};

/* -------------------------------------------------------------------------- */
/* Project + flat definitions                                                 */
/* -------------------------------------------------------------------------- */

interface FlatSpec {
  title: string;
  bhk: number;
  type: FlatType;
  sizeSqft: number;
  pricePerSqft: number;
  floorRise?: number;
  parkingCharges?: number;
  floor: number;
  tower: string;
  facing: Facing;
  amenities: string[];
  possessionInDays: number;
  /** Overrides the possession-derived status when you want a deliberate mix. */
  status?: ProjectStatus;
  isAvailable?: boolean;
  visitCharge?: 0 | 199 | 499;
  tokenAmount?: number;
}

interface ProjectSpec {
  projectName: string;
  builderKey: 'builder1' | 'builder2';
  description: string;
  city: string;
  locality: string;
  fullAddress: string;
  geo: { lat: number; lng: number };
  reraNumber?: string;
  isRERAVerified: boolean;
  isApproved: boolean;
  possessionInMonths: number;
  status: ProjectStatus;
  amenities: string[];
  flats: FlatSpec[];
}

const PROJECTS: ProjectSpec[] = [
  {
    projectName: 'Deshmukh Heights',
    builderKey: 'builder1',
    description:
      'A 14-storey residential tower in Baner offering thoughtfully planned 2 and 3 BHK homes with panoramic western views over the Baner–Pashan hills. The project wraps a podium garden and includes a temperature-controlled pool, a fully equipped gym and a dedicated toddler play area.',
    city: 'Pune',
    locality: 'Baner',
    fullAddress: 'Survey No. 112, Baner–Pashan Link Road, Baner, Pune 411045',
    geo: { lat: 18.5642, lng: 73.7869 },
    reraNumber: 'P52100012345',
    isRERAVerified: true,
    isApproved: true,
    possessionInMonths: 0,
    status: 'ready_to_move',
    amenities: [
      'Lift',
      'Parking',
      'Swimming Pool',
      'Gym',
      'Security',
      'CCTV',
      'Power Backup',
      "Children's Play Area",
      'Garden',
      'Jogging Track',
      'Indoor Games',
      'Rainwater Harvesting',
      'Club House',
      'Fire Safety',
    ],
    flats: [
      {
        title: 'Deshmukh Heights — 2 BHK Compact',
        bhk: 2,
        type: 'apartment',
        sizeSqft: 720,
        pricePerSqft: 6300,
        floorRise: 150000,
        parkingCharges: 250000,
        floor: 4,
        tower: 'A',
        facing: 'east',
        amenities: ['Lift', 'Parking', 'Power Backup', 'Security', 'Garden', 'Rainwater Harvesting'],
        possessionInDays: -90,
        isAvailable: true,
        visitCharge: 0,
      },
      {
        title: 'Deshmukh Heights — 3 BHK Signature',
        bhk: 3,
        type: 'apartment',
        sizeSqft: 1150,
        pricePerSqft: 7200,
        floorRise: 250000,
        parkingCharges: 350000,
        floor: 9,
        tower: 'A',
        facing: 'west',
        amenities: [
          'Lift',
          'Parking',
          'Swimming Pool',
          'Gym',
          'Security',
          'CCTV',
          'Power Backup',
          'Club House',
          'Garden',
          'Jogging Track',
          "Children's Play Area",
        ],
        possessionInDays: -30,
        isAvailable: true,
        visitCharge: 0,
      },
      {
        title: 'Deshmukh Heights — 4 BHC Sky Residence',
        bhk: 4,
        type: 'penthouse',
        sizeSqft: 2150,
        pricePerSqft: 8600,
        floorRise: 500000,
        parkingCharges: 500000,
        floor: 13,
        tower: 'B',
        facing: 'south_west',
        amenities: [
          'Lift',
          'Parking',
          'Visitor Parking',
          'Swimming Pool',
          'Gym',
          'Security',
          'CCTV',
          'Power Backup',
          'Club House',
          'Garden',
          'Indoor Games',
          'Intercom',
          'EV Charging',
        ],
        possessionInDays: -60,
        isAvailable: true,
        visitCharge: 0,
      },
      {
        title: 'Deshmukh Heights — 2 BHK Sold Out',
        bhk: 2,
        type: 'apartment',
        sizeSqft: 745,
        pricePerSqft: 6400,
        floorRise: 150000,
        parkingCharges: 250000,
        floor: 6,
        tower: 'B',
        facing: 'north_east',
        amenities: ['Lift', 'Parking', 'Security', 'Power Backup'],
        possessionInDays: -120,
        isAvailable: false,
        visitCharge: 0,
      },
    ],
  },
  {
    projectName: 'Green Vista',
    builderKey: 'builder1',
    description:
      'Affordable, RERA-registered homes in Pimpri aimed at first-time buyers. Two towers of 11 storeys with 1 and 2 BHK layouts, a landscaped central courtyard, indoor games room and 24×7 water and power backup.',
    city: 'Pune',
    locality: 'Pimpri',
    fullAddress: 'Gat No. 44, Pimpri-Chinchwad Link Road, Pimpri, Pune 411017',
    geo: { lat: 18.6298, lng: 73.7997 },
    reraNumber: 'P52100012346',
    isRERAVerified: true,
    isApproved: true,
    possessionInMonths: 4,
    status: 'under_construction',
    amenities: [
      'Lift',
      'Parking',
      'Security',
      'CCTV',
      'Power Backup',
      'Water Supply',
      "Children's Play Area",
      'Indoor Games',
      'Rainwater Harvesting',
      'Fire Safety',
    ],
    flats: [
      {
        title: 'Green Vista — 1 BHK Starter',
        bhk: 1,
        type: 'apartment',
        sizeSqft: 455,
        pricePerSqft: 4900,
        floorRise: 90000,
        parkingCharges: 150000,
        floor: 3,
        tower: 'C',
        facing: 'east',
        amenities: ['Lift', 'Parking', 'Security', 'Power Backup', 'Water Supply'],
        possessionInDays: 120,
        isAvailable: true,
        visitCharge: 0,
      },
      {
        title: 'Green Vista — 2 BHK Family',
        bhk: 2,
        type: 'apartment',
        sizeSqft: 690,
        pricePerSqft: 5200,
        floorRise: 120000,
        parkingCharges: 180000,
        floor: 5,
        tower: 'C',
        facing: 'south',
        amenities: [
          'Lift',
          'Parking',
          'Visitor Parking',
          'Security',
          'CCTV',
          'Power Backup',
          "Children's Play Area",
          'Indoor Games',
        ],
        possessionInDays: 150,
        isAvailable: true,
        visitCharge: 0,
      },
    ],
  },
  {
    projectName: 'Aurum Bay',
    builderKey: 'builder1',
    description:
      'Premium sea-facing towers at Koregaon Park with private balconies, sky lounge and concierge services. Limited inventory of 3 and 4 BHK residences with imported marble finishes and floor-to-ceiling glazing.',
    city: 'Pune',
    locality: 'Koregaon Park',
    fullAddress: 'North Main Road, Koregaon Park, Pune 411001',
    geo: { lat: 18.5362, lng: 73.894 },
    reraNumber: 'P52100012347',
    isRERAVerified: true,
    isApproved: true,
    possessionInMonths: 9,
    status: 'new_launch',
    amenities: [
      'Lift',
      'Parking',
      'Visitor Parking',
      'Swimming Pool',
      'Gym',
      'Security',
      'CCTV',
      'Power Backup',
      'Club House',
      'Garden',
      'Jogging Track',
      'Sports Area',
      'Indoor Games',
      'Intercom',
      'Community Hall',
      'EV Charging',
      'Fire Safety',
    ],
    flats: [
      {
        title: 'Aurum Bay — 3 BHK Horizon',
        bhk: 3,
        type: 'apartment',
        sizeSqft: 1480,
        pricePerSqft: 11800,
        floorRise: 400000,
        parkingCharges: 450000,
        floor: 18,
        tower: 'T1',
        facing: 'north',
        amenities: [
          'Lift',
          'Parking',
          'Visitor Parking',
          'Swimming Pool',
          'Gym',
          'Security',
          'CCTV',
          'Power Backup',
          'Club House',
          'Garden',
          'Indoor Games',
          'Intercom',
        ],
        possessionInDays: 270,
        isAvailable: true,
        visitCharge: 499,
      },
      {
        title: 'Aurum Bay — 4 BHC Sky Lounge',
        bhk: 4,
        type: 'penthouse',
        sizeSqft: 2650,
        pricePerSqft: 13400,
        floorRise: 600000,
        parkingCharges: 600000,
        floor: 26,
        tower: 'T2',
        facing: 'south_east',
        amenities: [
          'Lift',
          'Parking',
          'Visitor Parking',
          'Swimming Pool',
          'Gym',
          'Security',
          'CCTV',
          'Power Backup',
          'Club House',
          'Garden',
          'Sports Area',
          'Indoor Games',
          'Community Hall',
          'EV Charging',
          'Intercom',
        ],
        possessionInDays: 300,
        isAvailable: true,
        visitCharge: 499,
        tokenAmount: 200000,
      },
      {
        title: 'Aurum Bay — 3 BHK Reserved',
        bhk: 3,
        type: 'apartment',
        sizeSqft: 1520,
        pricePerSqft: 11800,
        floorRise: 400000,
        parkingCharges: 450000,
        floor: 21,
        tower: 'T1',
        facing: 'west',
        amenities: ['Lift', 'Parking', 'Gym', 'Security', 'Power Backup', 'Club House'],
        possessionInDays: 270,
        isAvailable: false,
        visitCharge: 499,
      },
    ],
  },
  {
    projectName: 'Kulkarni Residency',
    builderKey: 'builder2',
    description:
      'A mid-rise development in Wakad with 2 and 3 BHK homes designed around a central podium garden. RERA registration is in progress, so listings currently display without the verification badge.',
    city: 'Pune',
    locality: 'Wakad',
    fullAddress: 'S.no. 78/2, Wakad–Baner Road, Wakad, Pune 411057',
    geo: { lat: 18.5975, lng: 73.7628 },
    reraNumber: 'P52100098765',
    isRERAVerified: false,
    isApproved: true,
    possessionInMonths: 6,
    status: 'under_construction',
    amenities: [
      'Lift',
      'Parking',
      'Gym',
      'Security',
      'CCTV',
      'Power Backup',
      'Garden',
      "Children's Play Area",
      'Water Supply',
    ],
    flats: [
      {
        title: 'Kulkarni Residency — 2 BHK Comfort',
        bhk: 2,
        type: 'apartment',
        sizeSqft: 760,
        pricePerSqft: 5900,
        floorRise: 120000,
        parkingCharges: 200000,
        floor: 7,
        tower: 'A',
        facing: 'east',
        amenities: ['Lift', 'Parking', 'Gym', 'Security', 'Power Backup', 'Garden'],
        possessionInDays: 180,
        isAvailable: true,
        visitCharge: 199,
      },
      {
        title: 'Kulkarni Residency — 3 BHC Premium',
        bhk: 3,
        type: 'apartment',
        sizeSqft: 1080,
        pricePerSqft: 6400,
        floorRise: 180000,
        parkingCharges: 280000,
        floor: 11,
        tower: 'A',
        facing: 'south_west',
        amenities: [
          'Lift',
          'Parking',
          'Visitor Parking',
          'Gym',
          'Security',
          'CCTV',
          'Power Backup',
          'Garden',
          "Children's Play Area",
        ],
        possessionInDays: 200,
        isAvailable: true,
        visitCharge: 199,
      },
      {
        title: 'Kulkarni Residency — 2 BHK Corner',
        bhk: 2,
        type: 'apartment',
        sizeSqft: 810,
        pricePerSqft: 6100,
        floorRise: 130000,
        parkingCharges: 200000,
        floor: 2,
        tower: 'B',
        facing: 'north_west',
        amenities: ['Lift', 'Parking', 'Security', 'CCTV', 'Power Backup'],
        possessionInDays: 180,
        isAvailable: true,
        visitCharge: 199,
      },
    ],
  },
  {
    projectName: 'Prestige Meadows',
    builderKey: 'builder2',
    description:
      'Large-format 3 and 4 BHC residences in Hinjewadi with a 1-acre central park, clubhouse, business lounge and a dedicated sports arena. Possession expected in the second half of the year.',
    city: 'Pune',
    locality: 'Hinjewadi',
    fullAddress: 'Rajiv Gandhi Infotech Park, Phase 2, Hinjewadi, Pune 411057',
    geo: { lat: 18.5913, lng: 73.7389 },
    reraNumber: 'P52100098766',
    isRERAVerified: false,
    isApproved: true,
    possessionInMonths: 14,
    status: 'new_launch',
    amenities: [
      'Lift',
      'Parking',
      'Visitor Parking',
      'Swimming Pool',
      'Gym',
      'Security',
      'CCTV',
      'Power Backup',
      'Club House',
      'Garden',
      'Jogging Track',
      'Sports Area',
      'Indoor Games',
      'Community Hall',
      'Fire Safety',
      'EV Charging',
    ],
    flats: [
      {
        title: 'Prestige Meadows — 3 BHK Grand',
        bhk: 3,
        type: 'apartment',
        sizeSqft: 1290,
        pricePerSqft: 7600,
        floorRise: 280000,
        parkingCharges: 320000,
        floor: 15,
        tower: 'W1',
        facing: 'north_east',
        amenities: [
          'Lift',
          'Parking',
          'Swimming Pool',
          'Gym',
          'Security',
          'CCTV',
          'Power Backup',
          'Club House',
          'Garden',
          'Jogging Track',
          'Sports Area',
        ],
        possessionInDays: 420,
        isAvailable: true,
        visitCharge: 499,
      },
      {
        title: 'Prestige Meadows — 4 BHC Signature',
        bhk: 4,
        type: 'apartment',
        sizeSqft: 1890,
        pricePerSqft: 8200,
        floorRise: 380000,
        parkingCharges: 420000,
        floor: 22,
        tower: 'W2',
        facing: 'south',
        amenities: [
          'Lift',
          'Parking',
          'Visitor Parking',
          'Swimming Pool',
          'Gym',
          'Security',
          'CCTV',
          'Power Backup',
          'Club House',
          'Garden',
          'Jogging Track',
          'Sports Area',
          'Indoor Games',
          'Community Hall',
          'EV Charging',
        ],
        possessionInDays: 450,
        isAvailable: true,
        visitCharge: 499,
        tokenAmount: 100000,
      },
      {
        title: 'Prestige Meadows — 4 BHC Park View',
        bhk: 4,
        type: 'apartment',
        sizeSqft: 1980,
        pricePerSqft: 8400,
        floorRise: 400000,
        parkingCharges: 420000,
        floor: 8,
        tower: 'W2',
        facing: 'east',
        amenities: [
          'Lift',
          'Parking',
          'Visitor Parking',
          'Gym',
          'Security',
          'CCTV',
          'Power Backup',
          'Club House',
          'Garden',
          'Community Hall',
        ],
        possessionInDays: 450,
        isAvailable: false,
        visitCharge: 499,
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Reviews                                                                     */
/* -------------------------------------------------------------------------- */

interface ReviewSpec {
  builderKey: 'builder1' | 'builder2';
  buyerKey: 'buyer' | 'buyer2';
  rating: number;
  onTimePossession: number;
  constructionQuality: number;
  transparency: number;
  comment: string;
  helpfulCount: number;
  moderation: 'approved' | 'pending';
}

const REVIEWS: ReviewSpec[] = [
  {
    builderKey: 'builder1',
    buyerKey: 'buyer',
    rating: 5,
    onTimePossession: 5,
    constructionQuality: 5,
    transparency: 4,
    comment:
      'Moved in three months after the promised handover date. The team kept us updated at every stage and the finishing quality is genuinely good. Only knock is that the clubhouse opened a month late.',
    helpfulCount: 42,
    moderation: 'approved',
  },
  {
    builderKey: 'builder1',
    buyerKey: 'buyer2',
    rating: 4,
    onTimePossession: 4,
    constructionQuality: 5,
    transparency: 4,
    comment:
      'Construction quality is excellent and the staff is helpful. There were a couple of delays on the landscape work, but they were upfront about it and fixed the issues quickly.',
    helpfulCount: 27,
    moderation: 'approved',
  },
  {
    builderKey: 'builder1',
    buyerKey: 'buyer',
    rating: 4,
    onTimePossession: 4,
    constructionQuality: 4,
    transparency: 5,
    comment:
      'Very transparent pricing — the area statement matched the final bill almost exactly. Site visits were easy to book and the sales team never pushed a harder sell.',
    helpfulCount: 18,
    moderation: 'approved',
  },
  {
    builderKey: 'builder2',
    buyerKey: 'buyer2',
    rating: 3,
    onTimePossession: 3,
    constructionQuality: 4,
    transparency: 3,
    comment:
      'Design and layout are good for the price, though progress has slipped twice against the original timeline. Communication could be better — I had to follow up to get revised dates.',
    helpfulCount: 11,
    moderation: 'approved',
  },
  {
    builderKey: 'builder2',
    buyerKey: 'buyer',
    rating: 2,
    onTimePossession: 2,
    constructionQuality: 3,
    transparency: 2,
    comment:
      'Not happy with how the payment milestones were communicated. Repeated delays and a different revision of the carpet area each time. Requesting a refund review.',
    helpfulCount: 6,
    moderation: 'pending',
  },
];

/* -------------------------------------------------------------------------- */
/* Seeder                                                                      */
/* -------------------------------------------------------------------------- */

/** Ensures the admin-managed PlatformConfig exists before flats are validated. */
const ensurePlatformConfig = async (adminId: Types.ObjectId): Promise<void> => {
  const existing = await PlatformConfig.findOne({ key: 'default' });
  if (existing) {
    existing.cities = DEFAULT_CITIES.map((c) => ({ name: c.name, localities: [...c.localities], isActive: true }));
    existing.updatedBy = adminId;
    await existing.save();
    return;
  }
  await PlatformConfig.create({
    key: 'default',
    cities: DEFAULT_CITIES.map((c) => ({ name: c.name, localities: [...c.localities], isActive: true })),
    updatedBy: adminId,
  });
};

/** Amenity name -> ObjectId, so flat amenity arrays reference real documents. */
const buildAmenityIndex = async (): Promise<Map<string, Types.ObjectId>> => {
  const amenities = await Amenity.find({}).lean();
  return new Map(amenities.map((a) => [a.name, new Types.ObjectId(String(a._id))]));
};

export const seedAll = async (): Promise<void> => {
  /* 1. Reference data --------------------------------------------------- */
  await seedAmenities();
  await seedCities();

  /* 2. Users ----------------------------------------------------------- */
  const users = new Map<string, Types.ObjectId>();
  for (const spec of DEMO_USERS) {
    const user = await upsertDemoUser(spec);
    users.set(spec.key, new Types.ObjectId(String(user._id)));
  }
  const adminId = users.get('admin')!;
  const buyerId = users.get('buyer')!;
  const agentId = users.get('agent')!;

  await ensurePlatformConfig(adminId);
  // Tier thresholds must be live before any flat runs its validate hook.
  await loadPlatformConfig();

  const amenityIndex = await buildAmenityIndex();
  const resolveAmenities = (names: string[]): Types.ObjectId[] =>
    names.map((n) => amenityIndex.get(n)).filter((id): id is Types.ObjectId => Boolean(id));

  /* 3. Projects -------------------------------------------------------- */
  const projectIds: Types.ObjectId[] = [];
  for (const spec of PROJECTS) {
    const builderId = users.get(spec.builderKey)!;
    const builder = await User.findById(builderId).lean();

    // Idempotent: match by slug, which is derived from the project name.
    const slug = spec.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const existing = await Project.findOne({ slug });

    const possessionDate = inDays(spec.flats[0]?.possessionInDays ?? spec.possessionInMonths * 30);
    const photos = pickImages(EXTERIORS, 5, spec.projectName.length + spec.projectName.charCodeAt(0));
    const floorPlans = pickImages(INTERIORS, 2, spec.city.length + spec.locality.length);

    const payload = {
      builderId,
      builderName: builder?.companyName || builder?.name || spec.builderKey,
      projectName: spec.projectName,
      slug,
      description: spec.description,
      city: spec.city,
      locality: spec.locality,
      fullAddress: spec.fullAddress,
      geo: spec.geo,
      reraNumber: spec.reraNumber,
      isRERAVerified: spec.isRERAVerified,
      reraVerifiedAt: spec.isRERAVerified ? inDays(-120) : undefined,
      reraDocuments: spec.isRERAVerified
        ? [{ url: `/uploads/seed/${slug}-rera-certificate.pdf`, kind: 'brochure' as const }]
        : [],
      amenities: resolveAmenities(spec.amenities),
      possessionDate,
      status: spec.status,
      isApproved: spec.isApproved,
      approvedAt: spec.isApproved ? inDays(-150) : undefined,
      approvedBy: spec.isApproved ? adminId : undefined,
      images: mediaList(photos, 'image'),
      floorPlans: mediaList(floorPlans, 'floor_plan'),
      brochureUrl: `/uploads/seed/${slug}-brochure.pdf`,
      tour360Url: `https://my.matterport.com/show/?m=${slug}demo`,
    };

    const project = existing
      ? (Object.assign(existing, payload), await existing.save())
      : await Project.create(payload);

    projectIds.push(new Types.ObjectId(String(project._id)));

    /* 4. Flats ------------------------------------------------------- */
    for (const [flatIndex, flat] of spec.flats.entries()) {
      const flatPhotos = pickImages(INTERIORS, 5, flat.sizeSqft + flatIndex * 13 + spec.projectName.length);
      const planPhoto = pickImages(INTERIORS, 1, flat.bhk * 31 + flatIndex)[0];

      const flatPayload = {
        projectId: project._id,
        builderId,
        agentId: flatIndex % 3 === 2 ? agentId : undefined,
        title: flat.title,
        bhk: flat.bhk,
        type: flat.type,
        sizeSqft: flat.sizeSqft,
        pricePerSqft: flat.pricePerSqft,
        floorRise: flat.floorRise ?? 0,
        parkingCharges: flat.parkingCharges ?? 0,
        floor: flat.floor,
        tower: flat.tower,
        facing: flat.facing,
        amenities: resolveAmenities(flat.amenities),
        possessionDate: inDays(flat.possessionInDays),
        isAvailable: flat.isAvailable ?? true,
        visitCharge: flat.visitCharge ?? 0,
        tokenAmount: flat.tokenAmount ?? 50000,
        images: mediaList(flatPhotos, 'image'),
        floorPlan: planPhoto ? { url: buildUrl(planPhoto), kind: 'floor_plan' as const } : undefined,
        tour360Url: flatIndex === 0 ? `https://my.matterport.com/show/?m=${slug}-${flatIndex}` : undefined,
        views: 120 + flat.sizeSqft * 3 + flatIndex * 37,
        inquiriesCount: 4 + flatIndex * 5,
        visitCount: flatIndex === 0 ? 2 : flatIndex,
      };

      const existingFlat = await Flat.findOne({ title: flat.title });
      if (existingFlat) {
        Object.assign(existingFlat, flatPayload);
        await existingFlat.save();
      } else {
        await Flat.create(flatPayload);
      }
    }

    await recalculateProjectStats(project._id);
    console.log(`[seed:all] project "${spec.projectName}" — ${spec.flats.length} flats`);
  }

  /* 5. Reviews — recompute ratings through the real service -------------- */
  const inventory = await Flat.find({}).select('_id projectId builderId').lean();
  // (buyerId, flatId) is uniquely indexed, so each review claims a distinct flat.
  const claimed = new Set<string>();

  for (const review of REVIEWS) {
    const builderId = users.get(review.builderKey)!;
    const buyer = users.get(review.buyerKey)!;
    const candidate = inventory.find(
      (f) => String(f.builderId) === String(builderId) && !claimed.has(`${buyer}|${f._id}`),
    );
    if (!candidate) {
      console.warn(`[seed:all] no free flat for review by ${review.buyerKey} on ${review.builderKey} — skipped`);
      continue;
    }
    claimed.add(`${buyer}|${candidate._id}`);

    const payload = {
      flatId: candidate._id,
      projectId: candidate.projectId,
      builderId,
      buyerId: buyer,
      rating: review.rating,
      scores: {
        onTimePossession: review.onTimePossession,
        constructionQuality: review.constructionQuality,
        transparency: review.transparency,
      },
      comment: review.comment,
      isVerifiedBooking: false,
      isPublished: review.moderation === 'approved',
      moderation: {
        status: review.moderation,
        ...(review.moderation === 'pending' ? { note: 'Flagged for admin review by moderation queue' } : {}),
      },
      helpfulCount: review.helpfulCount,
    };

    const existing = await Review.findOne({ buyerId: buyer, flatId: candidate._id });
    if (existing) {
      Object.assign(existing, payload);
      await existing.save();
    } else {
      await Review.create(payload);
    }
  }

  for (const key of ['builder1', 'builder2'] as const) {
    const rating = await recalculateBuilderRating(String(users.get(key)));
    console.log(`[seed:all] builder ${key} rating → ${rating.avg} (${rating.count} reviews)`);
  }

  /* 6. Wishlist + buyer requirement -------------------------------------- */
  // One document per saved flat: the schema is { buyerId, flatId }, so writing
  // an `items` array here produced schema-invalid rows and left the demo
  // buyer's GET /wishlist/me permanently empty.
  const firstFlats = await Flat.find({ isAvailable: true }).sort({ totalPrice: 1 }).limit(3).select('_id').lean();
  // Remove rows written by older seeder versions that used an `items` array.
  await Wishlist.deleteMany({ buyerId, flatId: { $exists: false } });
  for (const flat of firstFlats) {
    await Wishlist.updateOne(
      { buyerId, flatId: flat._id },
      { $setOnInsert: { buyerId, flatId: flat._id } },
      { upsert: true },
    );
  }
  console.log(`[seed:all] wishlist → ${firstFlats.length} saved flats for the demo buyer`);

  const requirement = await Requirement.findOne({ buyerId, locality: 'Baner' });
  const requirementPayload = {
    buyerId,
    bhk: 3,
    budgetMin: 7000000,
    budgetMax: 12000000,
    city: 'Pune',
    locality: 'Baner',
    loanNeeded: true,
    preferredTiers: ['mid'],
    amenities: resolveAmenities(['Parking', 'Lift', 'Security', 'Gym']),
    possessionPreference: ['ready_to_move', 'under_construction'],
    notes: 'Looking for a 3 BHK in Baner with covered parking. Prefer a RERA-verified builder and possession within a year.',
    isActive: true,
  };
  if (requirement) {
    Object.assign(requirement, requirementPayload);
    await requirement.save();
  } else {
    await Requirement.create(requirementPayload);
  }

  /* 7. Summary ----------------------------------------------------------- */
  const [projectCount, flatCount, availableCount, reviewCount] = await Promise.all([
    Project.countDocuments(),
    Flat.countDocuments(),
    Flat.countDocuments({ isAvailable: true }),
    Review.countDocuments(),
  ]);

  const tierBreakdown = await Flat.aggregate([{ $group: { _id: '$tier', count: { $sum: 1 } } }]);
  const statusBreakdown = await Flat.aggregate([
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$possessionDate' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  console.log('\n─────────────────────────────────────────────');
  console.log('[seed:all] FLAT TOWN demo data ready');
  console.log('─────────────────────────────────────────────');
  console.log(`  projects : ${projectCount}`);
  console.log(`  flats    : ${flatCount} (${availableCount} available)`);
  console.log(`  reviews  : ${reviewCount}`);
  console.log(`  tiers    : ${tierBreakdown.map((t) => `${t._id}=${t.count}`).join(', ')}`);
  console.log(`  monthly  : ${statusBreakdown.map((t) => `${t._id}=${t.count}`).join(', ')}`);
  console.log('');
  console.log('  Demo accounts (development only):');
  for (const spec of DEMO_USERS) {
    console.log(`    ${spec.role.padEnd(7)} ${spec.email.padEnd(24)} ${DEMO_PASSWORD}`);
  }
  console.log('─────────────────────────────────────────────\n');
};

if (require.main === module) {
  (async () => {
    await connectDatabase();
    await seedAll();
    await disconnectDatabase();
    process.exit(0);
  })().catch((error) => {
    console.error('[seed:all] failed', error);
    process.exit(1);
  });
}