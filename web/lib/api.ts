/**
 * Axios instance and API surface.
 *
 * Responsibilities:
 *  - a single base URL and the `{ success, message, data, meta }` envelope
 *  - transparent access-token refresh (one in-flight refresh at a time)
 *  - typed endpoint helpers so components never hand-build URLs
 */

import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import {
  bearerHeader,
  clearSession,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from './auth';
import type {
  Amenity,
  ApiMeta,
  AuthPayload,
  Booking,
  CityOption,
  Dispute,
  FlatDetail,
  FlatSearchPage,
  FlatSummary,
  HealthPayload,
  Inquiry,
  LoanApplication,
  LoanPartner,
  MarketplaceStats,
  Notification,
  PlatformConfigView,
  ProjectDetail,
  ProjectSummary,
  Requirement,
  Review,
  ReviewList,
  SiteVisit,
  TierConfig,
  TokenOrderResponse,
  User,
  WishlistEntry,
} from './types';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:5000';

export const API_PREFIX = '/api/v1';

const apiRoot = `${API_BASE_URL}${API_PREFIX}`;

/* ------------------------------- envelope --------------------------------- */

interface Envelope<T> {
  success: boolean;
  message: string;
  data?: T;
  meta?: ApiMeta;
  errors?: Array<{ field: string; message: string }>;
}

/** An API error carrying the HTTP status and any field-level validation errors. */
export class ApiRequestError extends Error {
  readonly status: number;

  readonly errors: Array<{ field: string; message: string }>;

  constructor(status: number, message: string, errors: Array<{ field: string; message: string }> = []) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.errors = errors;
  }
}

const unwrap = <T>(response: AxiosResponse<Envelope<T>>): Envelope<T> => response.data;

const toApiError = (error: unknown): ApiRequestError => {
  if (error instanceof ApiRequestError) return error;
  const axiosError = error as AxiosError<Envelope<unknown>>;
  if (axiosError?.response) {
    const body = axiosError.response.data;
    return new ApiRequestError(
      axiosError.response.status,
      body?.message ?? 'Request failed',
      body?.errors ?? [],
    );
  }
  if (axiosError?.code === 'ECONNABORTED') {
    return new ApiRequestError(0, 'The request timed out. Please check your connection.');
  }
  return new ApiRequestError(0, axiosError?.message ?? 'Network error — is the API running?');
};

/* ------------------------------- interceptors ------------------------------ */

export const api: AxiosInstance = axios.create({
  baseURL: apiRoot,
  timeout: 25_000,
  withCredentials: true,
  headers: { Accept: 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

/** De-duplicates concurrent refreshes: the first caller performs the request. */
let refreshPromise: Promise<string> | null = null;

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

const refreshAccessToken = async (): Promise<string> => {
  if (!refreshPromise) {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return Promise.reject(new ApiRequestError(401, 'Your session has expired. Please sign in again.'));

    refreshPromise = axios
      .post<Envelope<AuthPayload>>(`${apiRoot}/auth/refresh`, { refreshToken })
      .then((response) => {
        const payload = unwrap(response);
        if (!payload.data?.accessToken) {
          throw new ApiRequestError(401, 'Your session has expired. Please sign in again.');
        }
        setTokens(payload.data);
        return payload.data.accessToken;
      })
      .catch((error: unknown) => {
        // A rejected refresh token can never be recovered from — drop the session.
        clearSession();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('flattown:session-expired'));
        }
        throw toApiError(error);
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<Envelope<unknown>>) => {
    const config = error.config as RetryableConfig | undefined;
    const status = error.response?.status;

    if (status === 401 && config && !config._retried && getRefreshToken() && !config.url?.includes('/auth/refresh')) {
      config._retried = true;
      try {
        const accessToken = await refreshAccessToken();
        config.headers.set('Authorization', `Bearer ${accessToken}`);
        return api.request(config);
      } catch {
        return Promise.reject(toApiError(error));
      }
    }

    return Promise.reject(toApiError(error));
  },
);

/* ------------------------------ request helpers ---------------------------- */

interface RequestOptions extends Omit<AxiosRequestConfig, 'auth'> {
  /** Attach the bearer token even when the endpoint is public. */
  auth?: boolean;
}

/** Runs a request and returns the unwrapped `{ data, meta, message }`. */
const request = async <T>(config: RequestOptions): Promise<{ data: T; meta?: ApiMeta; message: string }> => {
  const { auth: withAuth, ...axiosConfig } = config;
  const merged: AxiosRequestConfig = {
    ...axiosConfig,
    headers: {
      ...(withAuth ? bearerHeader() : {}),
      ...(axiosConfig.headers ?? {}),
    },
  };
  try {
    const response = await api.request<Envelope<T>>(merged);
    const body = unwrap<T>(response);
    return { data: body.data as T, meta: body.meta, message: body.message };
  } catch (error) {
    throw toApiError(error);
  }
};

export const http = {
  get: <T>(url: string, options: RequestOptions = {}) => request<T>({ ...options, method: 'GET', url }),
  post: <T>(url: string, data?: unknown, options: RequestOptions = {}) =>
    request<T>({ ...options, method: 'POST', url, data }),
  put: <T>(url: string, data?: unknown, options: RequestOptions = {}) =>
    request<T>({ ...options, method: 'PUT', url, data }),
  patch: <T>(url: string, data?: unknown, options: RequestOptions = {}) =>
    request<T>({ ...options, method: 'PATCH', url, data }),
  delete: <T>(url: string, options: RequestOptions = {}) => request<T>({ ...options, method: 'DELETE', url }),
  upload: <T>(url: string, form: FormData, options: RequestOptions = {}) =>
    request<T>({
      ...options,
      method: 'POST',
      url,
      data: form,
      headers: { 'Content-Type': 'multipart/form-data', ...(options.auth ? bearerHeader() : {}) },
    }),
};

/* ---------------------------------- auth ---------------------------------- */

export const authApi = {
  register: (body: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: 'builder' | 'buyer' | 'agent';
    companyName?: string;
    city?: string;
    locality?: string;
  }) => http.post<AuthPayload>('/auth/register', body),
  login: (body: { email: string; password: string }) => http.post<AuthPayload>('/auth/login', body),
  refresh: (refreshToken: string) => http.post<AuthPayload>('/auth/refresh', { refreshToken }),
  logout: (refreshToken: string) => http.post<{ success: boolean }>('/auth/logout', { refreshToken }),
  me: () => http.get<{ user: User }>('/auth/me', { auth: true }),
  updateProfile: (body: Partial<Pick<User, 'name' | 'phone' | 'companyName' | 'bio'>> & {
    location?: { city?: string; locality?: string; pincode?: string };
  }) => http.put<{ user: User }>('/auth/profile', body, { auth: true }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    http.put<{ revokedSessions: number }>('/auth/password', body, { auth: true }),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return http.upload<{ avatar: string }>('/auth/upload-avatar', form, { auth: true });
  },
};

/* --------------------------------- meta ----------------------------------- */

/** Amenity master CRUD (admin only). */
export const amenitiesApi = {
  list: () => http.get<Amenity[]>('/amenities'),
  create: (body: { name: string; icon?: string; category?: string; description?: string }) =>
    http.post<{ amenity: Amenity }>('/amenities', body, { auth: true }),
  update: (id: string, body: Partial<Amenity> & { isActive?: boolean }) =>
    http.put<{ amenity: Amenity }>(`/amenities/${id}`, body, { auth: true }),
  remove: (id: string) => http.delete<{ deleted: boolean }>(`/amenities/${id}`, { auth: true }),
};

export const metaApi = {
  health: () => http.get<HealthPayload>('/../health', { baseURL: API_BASE_URL }),
  tierConfig: () => http.get<TierConfig>('/tiers/config'),
  cities: () => http.get<CityOption[]>('/cities'),
  amenities: () => http.get<Amenity[]>('/amenities'),
  marketplaceStats: () => http.get<MarketplaceStats>('/stats'),
  priceRange: () => http.get<{ min: number; max: number; tiers: Record<string, number> }>('/flats/meta/price-range'),
};

/* --------------------------------- flats ---------------------------------- */

export interface FlatQuery {
  city?: string;
  locality?: string;
  bhk?: string;
  tier?: string;
  possession?: string;
  type?: string;
  amenities?: string;
  priceMin?: number;
  priceMax?: number;
  projectId?: string;
  builderId?: string;
  facing?: string;
  reraVerified?: 'true' | 'false';
  builderRatingMin?: number;
  available?: 'true' | 'false';
  tokenMax?: number;
  q?: string;
  sortBy?: string;
  page?: number;
  limit?: number;
  includeUnavailable?: 'true' | 'false';
}

export const flatsApi = {
  list: (query: FlatQuery = {}) =>
    http.get<FlatSummary[]>('/flats', { params: query as unknown as Record<string, unknown>, auth: true }),
  get: (id: string) => http.get<FlatDetail>(`/flats/${id}`, { auth: true }),
  compare: (ids: string[]) =>
    http.get<{ items: FlatSummary[]; maxCompare: number; amenities: Amenity[] }>('/flats/compare', {
      params: { ids: ids.join(',') },
    }),
  similar: (id: string) => http.get<{ similar: FlatSummary[] }>(`/flats/${id}/similar`),
  reviews: (id: string) => http.get<ReviewList>(`/flats/${id}/reviews`),
  create: (body: Record<string, unknown>) => http.post<{ flat: FlatDetail }>('/flats', body, { auth: true }),
  update: (id: string, body: Record<string, unknown>) => http.put<{ flat: FlatDetail }>(`/flats/${id}`, body, { auth: true }),
  remove: (id: string) => http.delete<{ deleted: boolean }>(`/flats/${id}`, { auth: true }),
  createInquiry: (id: string, body: { message?: string; visitDate?: string; loanAssistanceRequired?: boolean }) =>
    http.post<{ inquiry: Inquiry }>(`/flats/${id}/inquiry`, body, { auth: true }),
  uploadImages: (id: string, files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append('images', file));
    return http.upload<{ images: Array<{ url: string }> }>(`/flats/${id}/images`, form, { auth: true });
  },
};

/* -------------------------------- projects -------------------------------- */

export const projectsApi = {
  list: (query: Record<string, unknown> = {}) =>
    http.get<ProjectSummary[]>('/projects', { params: query, auth: true }),
  get: (id: string) => http.get<ProjectDetail>(`/projects/${id}`, { auth: true }),
  flats: (projectId: string, query: Record<string, unknown> = {}) =>
    http.get<FlatSummary[]>(`/projects/${projectId}/flats`, { params: query }),
  create: (body: Record<string, unknown>) => http.post<{ project: ProjectSummary }>('/projects', body, { auth: true }),
  update: (id: string, body: Record<string, unknown>) =>
    http.put<{ project: ProjectSummary }>(`/projects/${id}`, body, { auth: true }),
  remove: (id: string) => http.delete<{ deleted: boolean }>(`/projects/${id}`, { auth: true }),
  approve: (id: string, approved = true, rejectionReason?: string) =>
    http.put<{ project: ProjectSummary }>(`/projects/${id}/approve`, { approved, rejectionReason }, { auth: true }),
  uploadRera: (id: string, body: { reraNumber?: string; reraState?: string }) =>
    http.put<{ project: ProjectSummary }>(`/projects/${id}/rera-upload`, body, { auth: true }),
  uploadFiles: (id: string, kind: 'images' | 'floorPlans', files: File[]) => {
    const form = new FormData();
    form.append('kind', kind);
    files.forEach((file) => form.append('files', file));
    return http.upload<{ files: Array<{ url: string }> }>(`/projects/${id}/upload-files`, form, { auth: true });
  },
};

/* -------------------------------- builders -------------------------------- */

export const buildersApi = {
  topRated: (city?: string) => http.get<unknown[]>('/builders/top-rated', { params: { city } }),
  rating: (id: string) => http.get<{ rating: { avg: number; count: number }; distribution: unknown[] }>(`/builders/${id}/rating`),
  dashboard: () => http.get<BuilderDashboard>('/builders/me/dashboard', { auth: true }),
  inquiries: (params: Record<string, unknown> = {}) =>
    http.get<Inquiry[]>('/builders/me/inquiries', { params, auth: true }),
  updateInquiryStatus: (id: string, status: string) =>
    http.put<{ inquiry: Inquiry }>(`/inquiries/${id}/status`, { status }, { auth: true }),
  agents: () => http.get<unknown[]>('/builders/me/agents', { auth: true }),
};

/**
 * `GET /builders/me/dashboard`.
 *
 * This mirrors the payload the server actually builds (see
 * `getBuilderDashboard`). It previously described a shape the endpoint never
 * returned — `escrow`, `tierDistribution`, `pendingVisits`, `pendingBookings` —
 * which typechecked fine and then blew up at runtime with
 * "Cannot read properties of undefined (reading 'held')".
 */
export interface BuilderDashboard {
  stats: {
    projects: number;
    flats: number;
    availableFlats: number;
    views: number;
    inquiries: number;
    visits: number;
    visitsByStatus: Record<string, number>;
    bookings: number;
    bookingsByEscrow: Record<string, { count: number; amount: number }>;
    rating: { avg: number; count: number };
  };
  payouts: {
    heldInEscrow: number;
    pendingToBuilder: number;
    platformCommissionRetained: number;
    releasedToBuilder: number;
    releasedBookings: number;
    accountId?: string;
  };
  verification: {
    isAdminVerified?: boolean;
    isRERAVerified?: boolean;
    reraNumber?: string;
    kycStatus?: string;
    kycDocs: number;
    verificationRequestedAt?: string;
  };
  projects: ProjectSummary[];
  recentFlats: FlatSummary[];
  recentInquiries: Inquiry[];
  upcomingVisits: SiteVisit[];
  recentBookings: Booking[];
  reviews: Review[];
}

/* --------------------------------- visits --------------------------------- */

export const visitsApi = {
  list: (params: Record<string, unknown> = {}) => http.get<SiteVisit[]>('/visits', { params, auth: true }),
  availability: (flatId: string, days?: number) =>
    http.get<{ dates: string[]; slots: Array<{ date: string; time: string; available: boolean }> }>(
      '/visits/availability',
      { params: { flatId, days }, auth: true },
    ),
  get: (id: string) => http.get<{ visit: SiteVisit }>(`/visits/${id}`, { auth: true }),
  request: (body: {
    flatId: string;
    slot: { date: string; time: string };
    requirements?: string;
    loanAssistanceRequired?: boolean;
    visitorCount?: number;
  }) => http.post<{ visit: SiteVisit; payment?: Record<string, unknown> }>('/visits/request', body, { auth: true }),
  pay: (id: string, body: { paymentId: string; signature: string; orderId?: string }) =>
    http.post<{ visit: SiteVisit; payment: Record<string, unknown> }>(`/visits/${id}/pay`, body, { auth: true }),
  status: (id: string, body: { status: string; notes?: string; cancellationReason?: string }) =>
    http.put<{ visit: SiteVisit }>(`/visits/${id}/status`, body, { auth: true }),
};

/* -------------------------------- bookings -------------------------------- */

export const bookingsApi = {
  list: (params: Record<string, unknown> = {}) => http.get<Booking[]>('/bookings', { params, auth: true }),
  get: (id: string) => http.get<{ booking: Booking }>(`/bookings/${id}`, { auth: true }),
  agreement: (id: string) => http.get<{ agreement: Record<string, unknown> }>(`/bookings/${id}/agreement`, { auth: true }),
  createToken: (body: {
    flatId: string;
    tokenAmount: number;
    siteVisitId?: string;
    requirements?: string;
    loanAssistanceRequired?: boolean;
    agentId?: string;
  }) => http.post<TokenOrderResponse>('/bookings/token', body, { auth: true }),
  verifyToken: (id: string, body: { paymentId: string; signature: string; orderId?: string }) =>
    http.post<{ booking: Booking; payment: Record<string, unknown> }>(`/bookings/${id}/verify-token-payment`, body, {
      auth: true,
    }),
  accept: (id: string, note?: string) => http.put<{ booking: Booking }>(`/bookings/${id}/accept`, { note }, { auth: true }),
  uploadDocuments: (id: string, files: File[], types: string[]) => {
    const form = new FormData();
    files.forEach((file) => form.append('documents', file));
    form.append('types', types.join(','));
    return http.upload<{ booking: Booking }>(`/bookings/${id}/documents`, form, { auth: true });
  },
  verifyDocument: (id: string, index: number, body: { verified: boolean; rejectionReason?: string }) =>
    http.put<{ booking: Booking }>(`/bookings/${id}/documents/${index}/verify`, body, { auth: true }),
  releaseEscrow: (id: string, note?: string, builderKycVerified = true) =>
    http.put<{ booking: Booking }>(`/bookings/${id}/escrow-release`, { note, builderKycVerified }, { auth: true }),
  refund: (id: string, reason: string) => http.post<{ booking: Booking }>(`/bookings/${id}/refund`, { reason }, { auth: true }),
  cancel: (id: string, reason?: string) => http.put<{ booking: Booking }>(`/bookings/${id}/cancel`, { reason }, { auth: true }),
  loanStatus: (id: string, body: { status: string; partnerId?: string; leadFeeAmount?: number; notes?: string }) =>
    http.put<{ booking: Booking }>(`/bookings/${id}/loan-status`, body, { auth: true }),
};

/* --------------------------- requirements & loan -------------------------- */

export const requirementsApi = {
  list: () => http.get<Requirement[]>('/requirements', { auth: true }),
  create: (body: Partial<Requirement>) => http.post<{ requirement: Requirement }>('/requirements', body, { auth: true }),
  matches: (id?: string) => http.get<{ matches: FlatSummary[]; requirement: Requirement }>('/requirements/matches', {
    params: { id },
    auth: true,
  }),
  remove: (id: string) => http.delete<{ deleted: boolean }>(`/requirements/${id}`, { auth: true }),
};

export const loanApi = {
  apply: (body: {
    flatId?: string;
    bookingId?: string;
    loanAmount: number;
    employmentType?: string;
    annualIncome?: number;
    employmentYears?: number;
  }) => http.post<{ application: LoanApplication }>('/loan/apply', body, { auth: true }),
  mine: () => http.get<LoanApplication[]>('/loan/application', { auth: true }),
  partners: () => http.get<LoanPartner[]>('/loan/partners', { auth: true }),
};

/* ------------------------------ reviews & misc ---------------------------- */

export const reviewsApi = {
  list: (params: Record<string, unknown> = {}) => http.get<Review[]>('/reviews', { params }),
  create: (body: { flatId: string; bookingId?: string; rating: number; comment: string }) =>
    http.post<{ review: Review }>('/reviews', body, { auth: true }),
  moderate: (id: string, body: { action: string; note?: string }) =>
    http.put<{ review: Review }>(`/reviews/${id}/moderate`, body, { auth: true }),
};

export const wishlistApi = {
  toggle: (flatId: string) => http.post<{ flatId: string; wishlisted: boolean; count: number }>(`/wishlist/toggle/${flatId}`, undefined, { auth: true }),
  mine: () => http.get<WishlistEntry[]>('/wishlist/me', { auth: true }),
  ids: () => http.get<{ ids: string[] }>('/wishlist/ids', { auth: true }),
  remove: (id: string) => http.delete<{ deleted: boolean }>(`/wishlist/${id}`, { auth: true }),
};

export const notificationsApi = {
  list: (unreadOnly = false) => http.get<Notification[]>('/notifications', { params: { unreadOnly }, auth: true }),
  markRead: (id: string) => http.put<{ notification: Notification }>(`/notifications/${id}/read`, undefined, { auth: true }),
  markAllRead: () => http.put<{ updated: number }>('/notifications/read-all', undefined, { auth: true }),
};

export const disputesApi = {
  create: (body: {
    subject: string;
    description: string;
    category?: string;
    bookingId?: string;
    flatId?: string;
    siteVisitId?: string;
    against?: string;
  }) => http.post<{ dispute: Record<string, unknown> }>('/disputes', body, { auth: true }),
};

/* --------------------------------- admin ---------------------------------- */

export interface AdminDashboard {
  users: Record<string, number>;
  projects: { approved: number; pending: number };
  flats: { total: number; available: number; byTier: Record<string, number> };
  bookings: Record<string, { count: number; amount: number }>;
  visits: Record<string, number>;
  queue: { kyc: number; rera: number; projects: number; disputes: number; reviews: number };
  revenue: {
    siteVisit: number;
    tokenCommission: number;
    releasedToBuilders: number;
    heldInEscrow: number;
    total: number;
    formatted: { siteVisit: string; tokenCommission: string };
  };
  recentFinancialActions: Array<Record<string, unknown>>;
}

export const adminApi = {
  dashboard: () => http.get<AdminDashboard>('/admin/dashboard', { auth: true }),
  verificationQueue: (type: 'all' | 'kyc' | 'rera' | 'project' = 'all') =>
    http.get<{ kyc: unknown[]; rera: unknown[]; projects: unknown[] }>('/admin/verification-queue', {
      params: { type },
      auth: true,
    }),
  verifyKyc: (builderId: string, approved: boolean, rejectionReason?: string) =>
    http.put<{ builder: User }>(`/admin/verify-kyc/${builderId}`, { approved, rejectionReason }, { auth: true }),
  verifyRera: (builderId: string, approved: boolean, reason?: string, projectIds?: string[]) =>
    http.put<{ builder: User }>(`/admin/verify-rera/${builderId}`, { approved, reason, projectIds }, { auth: true }),
  approveProject: (id: string, approved: boolean, rejectionReason?: string) =>
    http.put<{ project: ProjectSummary }>(`/admin/approve-project/${id}`, { approved, rejectionReason }, { auth: true }),
  escrow: (params: Record<string, unknown> = {}) => http.get<Booking[]>('/admin/escrow', { params, auth: true }),
  revenue: (params: Record<string, unknown> = {}) =>
    http.get<Record<string, unknown>>('/admin/revenue', { params, auth: true }),
  auditLogs: (params: Record<string, unknown> = {}) =>
    http.get<Array<Record<string, unknown>>>('/admin/audit-logs', { params, auth: true }),
  bookings: (params: Record<string, unknown> = {}) => http.get<Booking[]>('/admin/bookings', { params, auth: true }),
  inquiries: (params: Record<string, unknown> = {}) => http.get<Inquiry[]>('/admin/inquiries', { params, auth: true }),
  getConfig: () => http.get<{ config: PlatformConfigView; effective: Record<string, unknown> }>('/admin/commission-config', { auth: true }),
  updateConfig: (body: Record<string, unknown>) =>
    http.put<{ config: PlatformConfigView }>('/admin/commission-config', body, { auth: true }),
  amenities: () => http.get<Amenity[]>('/admin/amenities', { auth: true }),
  disputes: (params: Record<string, unknown> = {}) => http.get<Dispute[]>('/admin/disputes', { params, auth: true }),
  resolveDispute: (id: string, body: { status: string; resolution?: string }) =>
    http.put<{ dispute: Record<string, unknown> }>(`/admin/disputes/${id}`, body, { auth: true }),
  reviews: (params: Record<string, unknown> = {}) =>
    http.get<Review[]>('/admin/reviews', { params, auth: true }),
  loanPartners: () => http.get<LoanPartner[]>('/admin/loan-partners', { auth: true }),
  createLoanPartner: (body: Record<string, unknown>) =>
    http.post<{ partner: LoanPartner }>('/admin/loan-partners', body, { auth: true }),
  updateLoanPartner: (id: string, body: Record<string, unknown>) =>
    http.put<{ partner: LoanPartner }>(`/admin/loan-partners/${id}`, body, { auth: true }),
  loanApplications: (params: Record<string, unknown> = {}) =>
    http.get<LoanApplication[]>('/admin/loan-applications', { params, auth: true }),
  updateLoanApplication: (id: string, body: Record<string, unknown>) =>
    http.put<{ application: LoanApplication }>(`/admin/loan-applications/${id}`, body, { auth: true }),
};

/* -------------------------------- chat ------------------------------------ */

export interface ChatThread {
  id: string;
  flatId: string;
  flat?: FlatSummary;
  buyer?: { id?: string; name: string; avatar?: string };
  builder?: { id?: string; name: string; companyName?: string; avatar?: string };
  lastMessage?: { body: string; at: string; senderId: string };
  unreadCount?: number;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export const chatApi = {
  threads: () => http.get<ChatThread[]>('/notifications/chat/threads', { auth: true }),
  createThread: (flatId: string) => http.post<{ thread: ChatThread }>('/notifications/chat/threads', { flatId }, { auth: true }),
  messages: (threadId: string) => http.get<ChatMessage[]>(`/notifications/chat/threads/${threadId}/messages`, { auth: true }),
  send: (threadId: string, body: string) =>
    http.post<{ message: ChatMessage }>(`/notifications/chat/threads/${threadId}/messages`, { body }, { auth: true }),
};

/* -------------------------------- helpers --------------------------------- */

export type { ApiRequestError as FlatTownApiError };
export { API_BASE_URL as baseUrl, API_PREFIX as apiPrefix, apiRoot };
export type { FlatSearchPage };