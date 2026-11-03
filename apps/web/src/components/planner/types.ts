// Shapes and options shared by the planner page and its pieces.


export interface AircraftProfile {
  id: string;
  name: string;
  tas: number;
  fuelConsumption: number;
  hourlyCost: number;
  fuelRange: number;
  minRunwayLength: number;
  allowedSurfaces: string[];
  fuelType: string | null;
  category: string | null;
  maxCrosswindKt: number | null;
}

export interface AerodromeOption {
  id: string;
  name: string;
  icaoCode: string | null;
  latitude: number;
  longitude: number;
  city: string | null;
  elevation: number | null;
}

export interface PlannerFilters {
  hasRestaurant: boolean;
  hasTransport: boolean;
  hasBikes: boolean;
  hasAccommodation: boolean;
  fuel100LL: boolean;
  fuelUL91: boolean;
  fuelSP98: boolean;
  fuelJetA1: boolean;
  hasHangar: boolean;
  hasWebcam: boolean;
  pavedRunway: boolean;
  excludeVisited: boolean;
  includePrivate: boolean;
}

export const NO_FILTERS: PlannerFilters = {
  hasRestaurant: false,
  hasTransport: false,
  hasBikes: false,
  hasAccommodation: false,
  fuel100LL: false,
  fuelUL91: false,
  fuelSP98: false,
  fuelJetA1: false,
  hasHangar: false,
  hasWebcam: false,
  pavedRunway: false,
  excludeVisited: false,
  includePrivate: false,
};

/** Fuel an aircraft burns; "" = not given, the planner never counts on refuelling. */
export const AIRCRAFT_FUELS = [
  { value: "", label: "Non renseigné" },
  { value: "AVGAS_100LL", label: "100LL" },
  { value: "UL91", label: "UL91" },
  { value: "SP98", label: "SP98" },
  { value: "JET_A1", label: "Jet A1" },
];
/** Picks the landing fee members reported; same keys as FEE_CATEGORIES. */
export const AIRCRAFT_CATEGORIES = [
  { value: "", label: "Non renseignée" },
  { value: "ULM", label: "ULM" },
  { value: "LIGHT", label: "Avion ≤ 1,5 t" },
  { value: "HEAVY", label: "Avion > 1,5 t" },
];
export const FUEL_SHORT_LABELS: Record<string, string> = { AVGAS_100LL: "100LL", UL91: "UL91", SP98: "SP98", JET_A1: "Jet A1" };

export type SearchMode = "time" | "cost" | "unlimited";
export type TripScope = "outbound" | "round_trip";
export type SortBy = "time" | "cost" | "distance" | "region";
