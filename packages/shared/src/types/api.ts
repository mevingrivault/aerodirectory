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
    ppr: boolean;
    privateUse: boolean;
    skydiveActivity: boolean;
  };
  distanceNm: number;
  timeHours: number;       // one-way flight time
  fuelUsedLiters: number;  // one-way fuel used
  fuelCost: number;        // extra fuel cost (if fuelPricePerLiter set, else 0)
  estimatedCost: number;   // total trip cost (hourlyCost × tripTime + fuelCost)
  tripTimeHours: number;   // total trip time (accounts for outbound/round_trip)
  tripFuelLiters: number;  // total trip fuel  (accounts for outbound/round_trip)
  refuelRequired: boolean; // round trip that only works by refuelling at the destination
  canRefuel: boolean;      // the destination sells the aircraft's fuel
  /** Newest approved member report for the profile's category; included in estimatedCost. */
  landingFee: { amount: number; parkingPerNight: number | null; observedAt: string } | null;
  /** Nights parked at the destination (round trip with a departure time); their fee is in estimatedCost. */
  parkingNights: number;
  /** Newest approved member price at the destination for the aircraft's fuel. */
  fuelPrice: { pricePerLiter: number; observedAt: string } | null;
  /** Only with a departure time: landing at the destination, and back home for a round trip. */
  arrivalAt: string | null;
  returnAt: string | null;
  /** A take-off or landing falls in aeronautical night; null without a departure time. */
  nightOperation: boolean | null;
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
  bio: string | null;
  avatarUrl: string | null;
  communityConsentAt: string | null;
  role: string;
  emailVerified: string | null;
  totpEnabled: boolean;
  showCommunityProfile: boolean;
  showCommunityContributions: boolean;
  showCommunityPhotos: boolean;
  showPublicSearches: boolean;
  createdAt: string;
  homeAerodrome: { id: string; name: string; icaoCode: string | null } | null;
}

export interface CommunityFollowListItem {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
}

export interface CommunityRecentVisitItem {
  id: string;
  visitedAt: string;
  status: "VISITED" | "FAVORITE";
  aerodrome: {
    id: string;
    name: string;
    icaoCode: string | null;
    city: string | null;
  };
}

export interface CommunityProfileStats {
  visitedCount: number;
  favoriteCount: number;
  seenCount: number;
  estimatedDistanceNm: number;
}

export interface CommunityPublicProfile {
  id: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
  homeAerodrome: { id: string; name: string; icaoCode: string | null } | null;
  followersCount: number;
  followingCount: number;
  contributionStats: {
    comments: number;
    corrections: number;
    photos: number;
  };
  stats: CommunityProfileStats;
  badges: Badge[];
  recentVisits: CommunityRecentVisitItem[];
  recentSearches: SavedSearchItem[];
}

export interface AdminDashboardStats {
  totalUsers: number;
  bannedUsers: number;
  activeComments: number;
  deletedComments: number;
  pendingPhotos: number;
  pendingCommunityInfos: number;
  pendingReports: number;
  failedLogins24h: number;
  altchaFailures24h: number;
  mailSent24h: number;
  mailFailed24h: number;
}

export interface AdminSyncRunItem {
  id: string;
  source: "OPENAIP" | "AIRSPACES" | "OSM" | "REGIONS" | "RGPD" | "OURAIRPORTS" | "COMMONS" | "OBSTACLES" | "PROTECTED_AREAS" | "WIND_CLIMATE" | "AERIAL_LINES" | "CAM_AERO";
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
  source: "OPENAIP" | "AIRSPACES" | "OSM" | "REGIONS" | "RGPD" | "OURAIRPORTS" | "COMMONS" | "OBSTACLES" | "PROTECTED_AREAS" | "WIND_CLIMATE" | "AERIAL_LINES" | "CAM_AERO";
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

export interface MailDiagnosticsSnapshot {
  checkedAt: string;
  host: string;
  port: number;
  secure: boolean;
  from: string;
  appUrl: string;
  user: string | null;
  verified: boolean;
  verifyError: string | null;
}

export interface AdminMailTestResponse {
  sentTo: string;
  messageId: string;
  diagnostics: MailDiagnosticsSnapshot;
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

export interface CommunityCorrectionItem {
  id: string;
  field: string;
  currentValue: string | null;
  proposedValue: string;
  reason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: {
    id: string;
    displayName: string | null;
  };
}

export interface AdminCorrectionListItem {
  id: string;
  field: string;
  currentValue: string | null;
  proposedValue: string;
  reason: string | null;
  contentStatus: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
  createdAt: string;
  reviewedAt: string | null;
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
  targetType: "comment" | "correction" | "photo" | "aerodrome";
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
  targetStatus: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED" | "READY" | "SCANNING" | null;
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

export interface AdminEventListItem {
  id: string;
  type: "CAFE_CROISSANT" | "OPEN_DAY" | "AIRSHOW" | "OTHER";
  title: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  contentStatus: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
  createdAt: string;
  reviewedAt: string | null;
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
}

export interface AdminContentAuditItem {
  id: string;
  createdAt: string;
  actionType:
    | "COMMENT_DELETE"
    | "COMMENT_RESTORE"
    | "COMMENT_APPROVE"
    | "COMMENT_REJECT"
    | "EVENT_APPROVE"
    | "EVENT_REJECT"
    | "CORRECTION_APPROVE"
    | "CORRECTION_REJECT"
    | "COMMUNITY_INFO_APPROVE"
    | "COMMUNITY_INFO_REJECT"
    | "PHOTO_APPROVE"
    | "PHOTO_REJECT"
    | "REPORT_APPROVE"
    | "REPORT_REJECT"
    | "USER_BAN"
    | "USER_UNBAN"
    | "USER_DELETE";
  targetType: "comment" | "correction" | "community_info" | "photo" | "event" | "aerodrome" | "user";
  targetId: string;
  targetSummary: string | null;
  reason: string | null;
  actor: {
    id: string;
    displayName: string | null;
    email: string;
  } | null;
  aerodrome: {
    id: string;
    name: string;
    icaoCode: string | null;
  } | null;
}

export interface SavedSearchItem {
  id: string;
  name: string;
  scope: "search" | "planner";
  isPublic: boolean;
  params: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSavedSearchItem extends SavedSearchItem {
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
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

export interface AdminCorrectionListItem {
  id: string;
  field: string;
  currentValue: string | null;
  proposedValue: string;
  reason: string | null;
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
}

export interface CorrectionItem {
  id: string;
  field: string;
  currentValue: string | null;
  proposedValue: string;
  reason: string | null;
  createdAt: string;
  user: {
    id: string;
    displayName: string | null;
  };
}

export interface EventItem {
  id: string;
  type: "CAFE_CROISSANT" | "OPEN_DAY" | "AIRSHOW" | "OTHER";
  title: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  user: {
    id: string;
    displayName: string | null;
  };
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

/** Approved practical information on a sheet: the newest entry per kind and key. */
export interface CommunityInfoItem {
  id: string;
  kind: import("../schemas/community-info.schema").CommunityInfoKind;
  key: string;
  data: Record<string, unknown>;
  observedAt: string;
  createdAt: string;
  user: { id: string; displayName: string | null };
}

/** Webcam imported from Cam-Aéro: a link to its viewer page. */
export interface ImportedWebcamItem {
  id: string;
  label: string;
  pageUrl: string;
  lastImageAt: string | null;
}

export interface AerodromeCommunityInfo {
  items: CommunityInfoItem[];
  webcams: ImportedWebcamItem[];
}

export interface AdminCommunityInfoListItem {
  id: string;
  kind: import("../schemas/community-info.schema").CommunityInfoKind;
  key: string;
  data: Record<string, unknown>;
  observedAt: string;
  contentStatus: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: { id: string; displayName: string | null; email: string } | null;
  aerodrome: { id: string; name: string; icaoCode: string | null };
  user: { id: string; displayName: string | null; email: string };
}

export interface BriefingField {
  id: string;
  name: string;
  icaoCode: string | null;
  latitude: number;
  longitude: number;
  elevation: number | null;
  magneticDeclination: number | null;
}

/** POST /planner/briefing: the trip between two given fields, reachable or not. */
/** One flight of a briefing route, from one field to the next. */
export interface BriefingLeg {
  fromId: string;
  toId: string;
  distanceNm: number;
  trueCourse: number;
  /** True course minus the declination at the leg's start (east positive); null when unknown. */
  magneticCourse: number | null;
  timeHours: number;
  fuelLiters: number;
  /** The tank is filled at the leg's start field (never at the departure, assumed full). */
  refuelBefore: boolean;
  /** The fuel on board covers the leg with the reserve left. */
  withinRange: boolean;
  /** Only with a departure time. */
  takeOffAt: string | null;
  landingAt: string | null;
}

/** An airspace the straight route crosses at low level. */
export interface RouteAirspace {
  id: string;
  name: string;
  type: number; // openAIP code
  icaoClass: string;
  lowerLimit: string;
  upperLimit: string;
  onRequest: boolean;
  onDemand: boolean;
  /** Distance along the route where it is first entered. */
  alongNm: number;
}

/** An obstacle close to the straight route. */
export interface RouteObstacle {
  id: string;
  name: string | null;
  type: string;
  heightM: number | null;
  elevationM: number | null;
  alongNm: number;
  offsetNm: number;
}

export interface BriefingTrip {
  departure: BriefingField;
  destination: BriefingField;
  /** Stops between the departure and the destination, in order. */
  stops: BriefingField[];
  aircraft: { name: string; tas: number; fuelConsumption: number; fuelRange: number; fuelType: string | null; category: string | null; maxCrosswindKt: number | null };
  tripScope: "outbound" | "round_trip";
  reserveMinutes: number;
  stayMinutes: number;
  legs: BriefingLeg[];
  distanceNm: number; // all legs
  flightTimeHours: number; // all legs, in the air
  tripTimeHours: number; // all legs, taxi included
  tripFuelLiters: number;
  usableRangeNm: number;
  /** Every leg fits in the fuel on board, refuelling where the field sells the aircraft's fuel. */
  withinRange: boolean;
  fuelCost: number;
  landingFees: number; // every stop and the destination, from member reports
  parkingFees: number;
  estimatedCost: number;
  landingFee: PlannerResult["landingFee"]; // at the destination
  fuelPrice: PlannerResult["fuelPrice"]; // at the destination
  departureTime: string | null;
  nightOperation: boolean | null;
  airspaces: RouteAirspace[];
  obstacles: RouteObstacle[];
  /** Obstacles found in the corridor, before keeping the highest. */
  obstacleCount: number;
  obstacleCorridorNm: number;
}
