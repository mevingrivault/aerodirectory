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

/** Aérodex stats */
export interface AerodexStats {
  visitedCount: number;
  seenCount: number;
  favoriteCount: number;
  totalAerodromes: number;
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
