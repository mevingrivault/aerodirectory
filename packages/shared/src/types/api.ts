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
  };
  distanceNm: number;
  timeHours: number;
  fuelUsedLiters: number;
  estimatedCost: number;
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
