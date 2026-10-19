/**
 * Shared API types.
 *
 * These mirror the Flat Town API envelope (`server/src/utils/response.ts`) and
 * the response shapes produced by `server/src/services/flatSearch.service.ts`.
 * Keeping them in one place means a server contract change surfaces as a
 * TypeScript error rather than an `any` creeping through the UI.
 */

/* --------------------------------- envelope -------------------------------- */

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
  sortBy?: string;
  filters?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data?: T;
  meta?: ApiMeta;
}

export interface ApiFailure {
  success: false;
  message: string;
  errors: Array<{ field: string; message: string }>;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/* ---------------------------------- enums --------------------------------- */

export type UserRole = 'builder' | 'buyer' | 'agent' | 'admin';

export type Tier = 'budget' | 'mid' | 'luxury';

export type ProjectStatus = 'new_launch' | 'under_construction' | 'ready_to_move';

export type FlatType = 'apartment' | 'villa' | 'penthouse';

export type Facing =
  | 'east'
  | 'west'
  | 'north'
  | 'south'
  | 'north_east'
  | 'north_west'
  | 'south_east'
  | 'south_west';

export type EscrowStatus =
  | 'created'
  | 'token_paid'
  | 'builder_accepted'
  | 'docs_pending'
  | 'completed'
  | 'refunded';

export type LoanStatus = 'not_needed' | 'applied' | 'approved' | 'rejected';

export type VisitStatus = 'requested' | 'confirmed' | 'completed' | 'cancelled';

export type PaymentStatus = 'not_required' | 'pending' | 'paid' | 'failed' | 'refunded';

export type GatewayName = 'razorpay' | 'mock';

export type SortKey =
  | 'relevance'
  | 'price:asc'
  | 'price:desc'
  | 'pricePerSqft:asc'
  | 'pricePerSqft:desc'
  | 'possessionDate:asc'
  | 'possessionDate:desc'
  | 'rating:desc'
  | 'views:desc'
  | 'newest';

/* ---------------------------------- auth ---------------------------------- */

export interface KycDoc {
  type: string;
  verified: boolean;
  uploadedAt: string;
  url?: string;
}

export interface RatingSummary {
  avg: number;
  count: number;
}

export interface UserLocation {
  city?: string;
  locality?: string;
  pincode?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  avatar?: string;
  companyName?: string;
  bio?: string;
  isVerified: boolean;
  isAdminVerified: boolean;
  isRERAVerified: boolean;
  reraNumber?: string;
  reraVerifiedAt?: string;
  kycStatus: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  kycDocs: KycDoc[];
  rating: RatingSummary;
  commissionSharePercent?: number;
  location: UserLocation;
  createdAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  refreshExpiresIn: string;
}

export interface AuthPayload extends TokenPair {
  user: User;
}

/* -------------------------------- amenities ------------------------------- */

export type AmenityCategory = 'lifestyle' | 'parking' | 'security' | 'wellness' | 'utility';

export interface Amenity {
  id: string;
  name: string;
  icon: string;
  category: AmenityCategory;
  description?: string;
  usageCount?: number;
  isActive?: boolean;
}

/* -------------------------------- projects -------------------------------- */

export interface ProjectSummary {
  id: string;
  projectName: string;
  slug: string;
  builderId: string;
  builderName?: string;
  city: string;
  locality: string;
  fullAddress: string;
  reraNumber?: string;
  isRERAVerified: boolean;
  status: ProjectStatus;
  isApproved: boolean;
  images: MediaItem[];
  possessionDate: string;
  rating: RatingSummary;
  tierStats: { budget: number; mid: number; luxury: number };
  totalFlats: number;
  availableFlats: number;
  minPrice: number;
  maxPrice: number;
  brochureUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/** Project reference embedded in flat and booking payloads. */
export interface ProjectRef {
  id?: string;
  _id?: string;
  projectName: string;
  slug: string;
  city: string;
  locality: string;
  fullAddress?: string;
  geo?: { lat: number; lng: number };
  reraNumber?: string;
  isRERAVerified: boolean;
  status: ProjectStatus;
  builderName?: string;
  rating?: RatingSummary;
  isApproved?: boolean;
  tour360Url?: string | null;
  brochureUrl?: string | null;
  images?: MediaItem[];
}

export interface ProjectDetail extends ProjectSummary {
  description?: string;
  geo?: { lat: number; lng: number };
  reraVerifiedAt?: string;
  floorPlans: MediaItem[];
  tour360Url?: string;
  rejectedReason?: string;
  amenities: Amenity[];
  builder: BuilderSummary | null;
  flats: FlatSummary[];
  flatCount: number;
  tierDistribution: Array<{ tier: Tier; count: number }>;
  reviews: Review[];
}

/* ---------------------------------- flats --------------------------------- */

export interface MediaItem {
  url: string;
  publicId?: string;
  caption?: string;
  kind?: 'image' | 'floor_plan' | 'video' | 'tour360' | 'document';
}

export interface PriceBreakdown {
  baseTotal: number;
  floorRise: number;
  parkingCharges: number;
  totalPrice: number;
  tier: Tier;
  tierThresholds?: { budget: number; mid: number };
}

export interface CommissionSummary {
  percent: number;
  basis: 'booking_token';
  amountOnDefaultToken?: number;
  amountOnToken?: number;
  note: string;
}

export interface BuilderSummary {
  id: string;
  name: string;
  companyName?: string;
  avatar?: string;
  rating: RatingSummary;
  isRERAVerified: boolean;
  reraNumber?: string;
  isVerified?: boolean;
  /** Populated on booking payloads where the admin checks builder KYC. */
  kycStatus?: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  email?: string;
  phone?: string;
}

export interface FlatSummary {
  id: string;
  title: string;
  bhk: number;
  type: FlatType;
  sizeSqft: number;
  pricePerSqft: number;
  totalPrice: number;
  tier: Tier;
  floorRise?: number;
  parkingCharges?: number;
  floor: number;
  tower?: string;
  facing?: Facing;
  possessionDate: string;
  isAvailable: boolean;
  visitCharge: number;
  tokenAmount: number;
  commissionPercent?: number;
  images: MediaItem[];
  floorPlan?: MediaItem | null;
  tour360Url?: string | null;
  views?: number;
  inquiriesCount?: number;
  visitCount?: number;
  isWishlisted?: boolean;
  amenities?: Amenity[];
  project?: ProjectRef | null;
  builder?: BuilderSummary | null;
  commission?: CommissionSummary;
}

export interface FlatDetail extends FlatSummary {
  priceBreakdown: PriceBreakdown;
  project: ProjectRef | null;
  builder: BuilderSummary | null;
  isWishlisted: boolean;
  inquiryId?: string;
  similar: FlatSummary[];
}

/* --------------------------------- reviews -------------------------------- */

export interface Review {
  _id?: string;
  id?: string;
  flatId: string;
  projectId: string;
  builderId: string;
  buyerId: string | { _id: string; name: string; avatar?: string };
  rating: number;
  comment: string;
  scores?: { onTimePossession: number; constructionQuality: number; transparency: number };
  isVerifiedBooking?: boolean;
  isPublished?: boolean;
  createdAt: string;
  buyer?: { id?: string; _id?: string; name: string; avatar?: string };
}

export interface ReviewList {
  reviews: Review[];
  summary: { avg: number; count: number };
  distribution: Array<{ rating: number; count: number }>;
}

/* ------------------------------- site visits ------------------------------ */

export interface SiteVisit {
  id: string;
  reference: string;
  status: VisitStatus;
  slot: { date: string; time: string };
  visitCharge: number;
  paymentStatus: PaymentStatus;
  payment?: {
    orderId: string;
    amount: number;
    gateway: GatewayName;
    refundId?: string;
    paymentId?: string;
    /** Simulated-gateway proof. Only present when Razorpay is not configured. */
    mockSignature?: string;
  };
  requirements?: string;
  loanAssistanceRequired: boolean;
  visitorCount?: number;
  builderNotes?: string;
  cancellationReason?: string;
  bookingId?: string;
  flat?: FlatSummary;
  project?: { id?: string; projectName: string; slug?: string; city?: string; locality?: string };
  builder?: BuilderSummary;
  buyer?: { id?: string; name: string; phone?: string; email?: string; avatar?: string };
  agent?: BuilderSummary;
  createdAt: string;
  updatedAt?: string;
}

/* -------------------------------- bookings -------------------------------- */

export interface BookingDocument {
  type: string;
  verified: boolean;
  verifiedAt?: string;
  uploadedAt: string;
  rejectionReason?: string;
}

export interface EscrowSummary {
  status: EscrowStatus;
  heldAmount: number;
  builderAmount: number;
  platformAmount: number;
  agentAmount: number;
  agentSharePercent?: number;
  releasedAmount?: number;
  refundedAmount?: number;
  releasedAt?: string;
  accountId?: string;
}

export interface Booking {
  id: string;
  reference: string;
  escrowStatus: EscrowStatus;
  loanStatus: LoanStatus;
  totalPrice: number;
  sizeSqft: number;
  pricePerSqft: number;
  tier: Tier;
  tokenAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  escrow: EscrowSummary;
  loan: {
    required?: boolean;
    status?: LoanStatus;
    partnerId?: string;
    partnerName?: string;
    leadFeeAmount?: number;
    notes?: string;
    appliedAt?: string;
    approvedAt?: string;
  };
  documents: BookingDocument[];
  documentsRequested: Array<{ type: string; requestedAt: string }>;
  payment: {
    orderId: string;
    paymentId?: string;
    amount: number;
    gateway: GatewayName;
    capturedAt?: string;
  } | null;
  refund?: {
    amount: number;
    refundId: string;
    reason: string;
    gateway: GatewayName;
    at: string;
  };
  statusHistory: Array<{ from: EscrowStatus; to: EscrowStatus; by: string; note?: string; at: string }>;
  ledger?: Array<{ type: string; amount: number; note?: string; at: string }>;
  flat?: FlatSummary;
  project?: ProjectRef;
  builder?: BuilderSummary;
  buyer?: { id?: string; name: string; phone?: string; email?: string; avatar?: string };
  agent?: BuilderSummary | null;
  agentId?: string | null;
  siteVisitId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/** Response of `POST /bookings/token`. */
export interface TokenOrderResponse {
  booking: Booking;
  payment: {
    required: boolean;
    amount: number;
    orderId: string;
    gateway: GatewayName;
    /** True only for the clearly-labelled simulated development gateway. */
    simulated: boolean;
    keyId?: string;
    mockSignature?: string;
    escrow: { status: EscrowStatus; note: string };
    commission: {
      percent: number;
      amount: number;
      basis: 'booking_token';
      note: string;
    };
    split: {
      commissionAmount: number;
      platformAmount: number;
      agentAmount: number;
      agentSharePercent?: number;
      builderAmount: number;
      hasAgent: boolean;
    };
  };
}

/* --------------------------------- search --------------------------------- */

export interface FlatFilters {
  city?: string;
  locality?: string;
  bhk: number[];
  tier: Tier[];
  possession: ProjectStatus[];
  type: FlatType[];
  amenities: string[];
  priceMin?: number;
  priceMax?: number;
  facing: Facing[];
  reraVerified?: boolean;
  builderRatingMin?: number;
  tokenMax?: number;
  q?: string;
  sortBy: SortKey;
  page: number;
  limit: number;
  includeUnavailable: boolean;
}

export interface FlatSearchPage {
  items: FlatSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/* --------------------------------- meta ----------------------------------- */

export interface CityOption {
  name: string;
  localities: string[];
  projectCount?: number;
}

/**
 * Public pricing policy served by `GET /tiers/config`.
 *
 * Mirrors what the API actually returns — the `tiers` map keyed by tier, plus
 * the booking and visit policy the marketplace advertises. The booking wizard
 * reads `booking.allowedTokenAmounts` from here so it only ever offers a token
 * the server will accept.
 */
export interface TierConfig {
  thresholds: { budget: number; mid: number };
  tiers: Record<
    Tier,
    {
      label: string;
      description: string;
      minInclusive?: number;
      maxExclusive?: number;
    }
  >;
  commission: {
    percent: number;
    basis: 'booking_token';
    note: string;
  };
  visits: {
    freeVisitsForVerifiedBuilders: number;
    freeVisitsForAll: number;
    allowedCharges: number[];
    chargeGoesToPlatform: boolean;
    refundableOnBooking: boolean;
  };
  booking: {
    defaultTokenAmount: number;
    allowedTokenAmounts: number[];
    requireDocumentsBeforeRelease: boolean;
  };
}

export interface MarketplaceStats {
  totalFlats: number;
  totalProjects: number;
  totalBuilders: number;
  cities: number;
  byTier: Record<Tier, number>;
  startingPrice?: number;
}

export interface LoanPartner {
  _id?: string;
  id?: string;
  name: string;
  code: string;
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  interestRateMin: number;
  interestRateMax: number;
  maxTenureYears: number;
  minLoanAmount: number;
  maxLoanAmount: number;
  leadFeeAmount: number;
  avgDisbursalDays: number;
  isActive: boolean;
}

export interface LoanApplication {
  _id?: string;
  id?: string;
  buyerId: string;
  flatId?: string;
  loanAmount: number;
  employmentType?: string;
  annualIncome?: number;
  status: 'applied' | 'assigned' | 'approved' | 'rejected' | 'disbursed';
  partnerId?: string;
  leadFeeAmount?: number;
  notes?: string;
  createdAt: string;
}

export interface Requirement {
  _id?: string;
  id?: string;
  buyerId: string;
  /**
   * A single BHK count (1-4), NOT an array.
   *
   * The server stores `bhk` as a scalar Number enum (see `Requirement.ts`), and
   * only wraps it in an array inside the match engine. This was typed as
   * `number[]`, so `.bhk?.join()` threw "join is not a function" at runtime —
   * `?.` guards null/undefined, never a number.
   */
  bhk?: number;
  budgetMin: number;
  budgetMax: number;
  city?: string;
  locality?: string;
  loanNeeded: boolean;
  possessionPreference: ProjectStatus[];
  amenities: string[];
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

/** A dispute raised against a booking, flat or site visit. */
export interface Dispute {
  _id?: string;
  id?: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  resolution?: string;
  createdAt: string;
  updatedAt?: string;
  raisedByRole?: string;
  bookingId?: string;
  flatId?: string;
  siteVisitId?: string;
}

export interface WishlistEntry {
  id: string;
  flatId: string;
  createdAt: string;
  flat?: FlatSummary;
}

export interface Inquiry {
  _id?: string;
  id?: string;
  flatId: string;
  projectId: string;
  builderId: string;
  buyerId: string;
  agentId?: string;
  message?: string;
  visitDate?: string;
  loanAssistanceRequired: boolean;
  status: 'new' | 'contacted' | 'visit_booked' | 'booked' | 'closed';
  visitId?: string;
  bookingId?: string;
  createdAt: string;
  flat?: FlatSummary;
  buyer?: { id?: string; name: string; phone?: string; email?: string; avatar?: string };
}

export interface Notification {
  _id?: string;
  id?: string;
  recipientId: string;
  event: string;
  title: string;
  body: string;
  isRead: boolean;
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface PlatformConfigView {
  key?: string;
  tiers: { budgetMax: number; midMax: number };
  commission: {
    bookingTokenPercent: number;
    agentPlatformPercent: number;
    agentAgentPercent: number;
    allowPerAgentOverride: boolean;
  };
  visits: {
    freeVisitsForVerifiedBuilders: number;
    freeVisitsForAll: number;
    allowedCharges: number[];
    chargeGoesToPlatform: boolean;
    refundableOnBooking: boolean;
  };
  booking: {
    defaultTokenAmount: number;
    allowedTokenAmounts: number[];
    escrowAccountId: string;
    requireDocumentsBeforeRelease: boolean;
  };
  loan: { enabled: boolean; defaultLeadFee: number };
  updatedAt?: string;
}

export interface HealthPayload {
  status: string;
  environment: string;
  uptimeSeconds: number;
  database: string;
  cache: { enabled: boolean; connected: boolean };
  payments: { gateway: GatewayName; live: boolean; mockEnabled: boolean };
  storage: string;
  version: string;
}