/** Standard API response wrapper */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Flight planner result */
export interface PlannerResult {
  aerodrome: {
    id: string;
    name: string;
    icaoCode: string | null;
    latitude: number;
    longitude: number;
    city: string | null;
    region: string | null;
    elevation: number | null;
    hasRestaurant: boolean;
    hasTransport: boolean;
    hasBikes: boolean;
    hasAccommodation: boolean;
    fuels: string[];
    maxRunwayLength: number | null;
  };
  distanceNm: number;
  timeHours: number;       // one-way flight time
  fuelUsedLiters: number;  // one-way fuel used
  fuelCost: number;        // extra fuel cost (if fuelPricePerLiter set, else 0)
  estimatedCost: number;   // total trip cost (hourlyCost × tripTime + fuelCost)
  tripTimeHours: number;   // total trip time (accounts for outbound/round_trip)
  tripFuelLiters: number;  // total trip fuel  (accounts for outbound/round_trip)
}

export interface AerodexTypeStats {
  visited: number;
  total: number;
}

/** Aérodex stats */
export interface AerodexStats {
  visitedCount: number;
  seenCount: number;
  favoriteCount: number;
  totalAerodromes: number;
  byType: {
    aerodromes: AerodexTypeStats;
    altiport: AerodexTypeStats;
    ulm: AerodexTypeStats;
    heli: AerodexTypeStats;
  };
  badges: Badge[];
  estimatedDistanceNm: number;
  estimatedTotalCost: number;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  earned: boolean;
  earnedAt?: string;
}

/** Auth responses */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface TotpSetupResponse {
  secret: string;
  qrCodeUrl: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  emailVerified: string | null;
  totpEnabled: boolean;
  createdAt: string;
  homeAerodrome: { id: string; name: string; icaoCode: string | null } | null;
}

export interface AdminDashboardStats {
  totalUsers: number;
  bannedUsers: number;
  activeComments: number;
  deletedComments: number;
  pendingPhotos: number;
  pendingReports: number;
  failedLogins24h: number;
  altchaFailures24h: number;
  mailSent24h: number;
  mailFailed24h: number;
}

export interface AdminSyncRunItem {
  id: string;
  source: "OPENAIP" | "OSM" | "REGIONS" | "RGPD";
  runType: "SCHEDULED" | "MANUAL" | "RETRY" | "RECOVERY";
  scope: string | null;
  status: "QUEUED" | "RETRY_SCHEDULED" | "IN_PROGRESS" | "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED";
  attempt: number;
  scheduledFor: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  nextRetryAt: string | null;
  summary: Record<string, unknown> | null;
  workerId: string | null;
}

export interface AdminSyncSourceStatus {
  source: "OPENAIP" | "OSM" | "REGIONS" | "RGPD";
  schedule: string;
  description: string;
  nextPlannedAt: string | null;
  running: boolean;
  queued: boolean;
  lastRun: AdminSyncRunItem | null;
}

export interface AdminSyncStatusResponse {
  workerEnabled: boolean;
  workerId: string;
  running: boolean;
  sources: AdminSyncSourceStatus[];
  recentRuns: AdminSyncRunItem[];
}

export interface AdminUserListItem {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: "ACTIVE" | "BANNED";
  bannedAt: string | null;
  bannedReason: string | null;
  bannedBy: { id: string; displayName: string | null; email: string } | null;
  createdAt: string;
  _count: {
    comments: number;
    visits: number;
  };
}

export interface AdminUserDetail extends AdminUserListItem {
  emailVerified: string | null;
  totpEnabled: boolean;
  homeAerodrome: { id: string; name: string; icaoCode: string | null } | null;
}

export interface AdminCommentListItem {
  id: string;
  content: string;
  contentStatus: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
  createdAt: string;
  deletedAt: string | null;
  deletedReason: string | null;
  aerodrome: {
    id: string;
    name: string;
    icaoCode: string | null;
  };
  user: {
    id: string;
    displayName: string | null;
    email: string;
  };
  deletedBy: {
    id: string;
    displayName: string | null;
    email: string;
  } | null;
  pendingReports: {
    count: number;
    reasons: string[];
  };
}

export interface AdminPhotoListItem {
  id: string;
  status: "PENDING" | "SCANNING" | "REJECTED" | "READY";
  createdAt: string;
  reviewedAt: string | null;
  rejectedReason: string | null;
  mimeType: string;
  width: number | null;
  height: number | null;
  aerodrome: {
    id: string;
    name: string;
    icaoCode: string | null;
  };
  user: {
    id: string;
    displayName: string | null;
    email: string;
  };
  reviewedBy: {
    id: string;
    displayName: string | null;
    email: string;
  } | null;
}

export interface AdminReportListItem {
  id: string;
  targetType: "comment" | "correction";
  targetId: string;
  reason: string;
  contentStatus: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: {
    id: string;
    displayName: string | null;
    email: string;
  } | null;
  aerodrome: {
    id: string;
    name: string;
    icaoCode: string | null;
  };
  user: {
    id: string;
    displayName: string | null;
    email: string;
  };
  targetPreview: string | null;
  targetStatus: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED" | null;
}

export interface AdminMailEventItem {
  id: string;
  createdAt: string;
  template: "password_reset" | "email_verification" | "sync_summary";
  status: "sent" | "failed";
  recipientMasked: string | null;
  recipientDomain: string | null;
  errorMessage: string | null;
}

export interface SavedSearchItem {
  id: string;
  name: string;
  scope: "search" | "planner";
  params: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface AerodromeListItem {
  id: string;
  aerodromeId: string;
  note: string | null;
  createdAt: string;
  aerodrome: {
    id: string;
    name: string;
    icaoCode: string | null;
    city: string | null;
  };
}

export interface AerodromeListSummary {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  items: AerodromeListItem[];
  _count: { items: number };
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}
