"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatNm, formatFlightTime, formatEuros } from "@/lib/utils";
import {
  Navigation,
  Plane,
  Plus,
  Trash2,
  Search,
  MapPin,
  Clock,
  Fuel,
  Map,
  List,
  ChevronDown,
  ChevronUp,
  Check,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import Link from "next/link";
import type { PlannerResult } from "@aerodirectory/shared";

// ─── Types ─────────────────────────────────────────────────────────────────

interface AircraftProfile {
  id: string;
  name: string;
  tas: number;
  fuelConsumption: number;
  hourlyCost: number;
  fuelRange: number;
  minRunwayLength: number;
  allowedSurfaces: string[];
}

interface AerodromeOption {
  id: string;
  name: string;
  icaoCode: string | null;
  latitude: number;
  longitude: number;
  city: string | null;
  elevation: number | null;
}

interface PlannerFilters {
  hasRestaurant: boolean;
  hasTransport: boolean;
  hasBikes: boolean;
  hasAccommodation: boolean;
  fuel100LL: boolean;
  fuelSP98: boolean;
}

type SearchMode = "time" | "cost" | "unlimited";
type TripScope = "outbound" | "round_trip";
type SortBy = "time" | "cost" | "distance" | "region";

// ─── Constants ─────────────────────────────────────────────────────────────

const TIME_PRESETS = [30, 45, 60, 90, 120];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "time", label: "Temps" },
  { value: "distance", label: "Distance" },
  { value: "cost", label: "Coût" },
  { value: "region", label: "Région" },
];

const SURFACE_LABELS: Record<string, string> = {
  ASPHALT: "Bitumé",
  CONCRETE: "Béton",
  GRASS: "Herbe",
  GRAVEL: "Gravier",
  DIRT: "Terre",
  WATER: "Eau",
  OTHER: "Autre",
};

const FUEL_CHIP: Record<string, { label: string; cls: string }> = {
  AVGAS_100LL: { label: "100LL", cls: "bg-blue-100 text-blue-700" },
  SP98: { label: "SP98", cls: "bg-green-100 text-green-700" },
  UL91: { label: "UL91", cls: "bg-yellow-100 text-yellow-700" },
  JET_A1: { label: "JET A1", cls: "bg-gray-100 text-gray-600" },
};

const DESTINATION_FILTERS: { key: keyof PlannerFilters; label: string; icon: string }[] = [
  { key: "hasRestaurant", label: "Restaurant", icon: "🍽" },
  { key: "hasTransport", label: "Transport", icon: "🚌" },
  { key: "hasBikes", label: "Vélos", icon: "🚲" },
  { key: "hasAccommodation", label: "Hébergement", icon: "🏨" },
  { key: "fuel100LL", label: "100LL", icon: "⛽" },
  { key: "fuelSP98", label: "SP98", icon: "⛽" },
];

const DEFAULT_SURFACES = ["ASPHALT", "CONCRETE", "GRASS"];

// ─── PlannerMap ─────────────────────────────────────────────────────────────

function PlannerMap({
  departure,
  results,
}: {
  departure: AerodromeOption | null;
  results: PlannerResult[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    import("maplibre-gl").then((ml) => {
      if (cancelled || !containerRef.current) return;
      // @ts-ignore
      import("maplibre-gl/dist/maplibre-gl.css");

      const map = new ml.default.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "&copy; OpenStreetMap contributors",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center: [2.3, 46.6],
        zoom: 6,
      });

      map.addControl(new ml.default.NavigationControl(), "top-right");
      map.on("load", () => setMapLoaded(true));
      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when data changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    // Remove previous markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    import("maplibre-gl").then((ml) => {
      if (!mapRef.current) return;

      // Departure marker — blue
      if (departure) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)";
        const popup = new ml.default.Popup({ offset: 10, closeButton: false }).setHTML(
          `<div style="font-size:12px;font-weight:600">${departure.name}</div>
           <div style="font-size:11px;color:#64748b">Départ</div>`,
        );
        const marker = new ml.default.Marker({ element: el })
          .setLngLat([departure.longitude, departure.latitude])
          .setPopup(popup)
          .addTo(mapRef.current!);
        el.addEventListener("click", () => marker.togglePopup());
        markersRef.current.push(marker);
      }

      // Destination markers — green
      for (const r of results) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:10px;height:10px;border-radius:50%;background:#16a34a;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3);cursor:pointer";

        const services = [
          r.aerodrome.hasRestaurant ? "🍽" : "",
          r.aerodrome.hasTransport ? "🚌" : "",
          r.aerodrome.hasBikes ? "🚲" : "",
          r.aerodrome.hasAccommodation ? "🏨" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const popup = new ml.default.Popup({ offset: 8, closeButton: false }).setHTML(
          `<div style="font-size:12px">
            <div style="font-weight:600">${r.aerodrome.name}</div>
            <div style="color:#64748b;font-size:11px">${r.aerodrome.icaoCode ?? ""}${r.aerodrome.city ? ` · ${r.aerodrome.city}` : ""}</div>
            <div style="margin-top:4px;font-size:11px">
              ${formatFlightTime(r.timeHours)} · ${formatNm(r.distanceNm)}
              ${r.estimatedCost > 0 ? ` · ${formatEuros(r.estimatedCost)}` : ""}
            </div>
            ${services ? `<div style="margin-top:2px;font-size:11px">${services}</div>` : ""}
            <a href="/aerodrome/${r.aerodrome.id}" style="color:#2563eb;font-size:11px">Voir la fiche →</a>
           </div>`,
        );

        const marker = new ml.default.Marker({ element: el })
          .setLngLat([r.aerodrome.longitude, r.aerodrome.latitude])
          .setPopup(popup)
          .addTo(mapRef.current!);
        el.addEventListener("click", () => marker.togglePopup());
        markersRef.current.push(marker);
      }

      // Fit bounds to show all markers
      if (departure && results.length > 0) {
        const lats = [departure.latitude, ...results.map((r) => r.aerodrome.latitude)];
        const lngs = [departure.longitude, ...results.map((r) => r.aerodrome.longitude)];
        mapRef.current?.fitBounds(
          [
            [Math.min(...lngs) - 0.3, Math.min(...lats) - 0.3],
            [Math.max(...lngs) + 0.3, Math.max(...lats) + 0.3],
          ],
          { padding: 40, maxZoom: 10, duration: 600 },
        );
      }
    });
  }, [mapLoaded, departure, results]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden border"
      style={{ height: 580 }}
    />
  );
}

// ─── ResultCard ─────────────────────────────────────────────────────────────

function ResultCard({
  result: r,
  tripScope,
}: {
  result: PlannerResult;
  tripScope: TripScope;
}) {
  const displayTime = tripScope === "round_trip" ? r.tripTimeHours : r.timeHours;
  const displayFuel = tripScope === "round_trip" ? r.tripFuelLiters : r.fuelUsedLiters;

  return (
    <Link href={`/aerodrome/${r.aerodrome.id}`}>
      <div className="rounded-md border p-3 hover:bg-accent/30 transition-colors cursor-pointer">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{r.aerodrome.name}</span>
            {r.aerodrome.icaoCode && (
              <Badge variant="secondary" className="font-mono text-xs">
                {r.aerodrome.icaoCode}
              </Badge>
            )}
            {r.aerodrome.city && (
              <span className="text-xs text-muted-foreground">{r.aerodrome.city}</span>
            )}
          </div>
          {r.estimatedCost > 0 && (
            <span className="text-sm font-semibold text-primary shrink-0 whitespace-nowrap">
              {formatEuros(r.estimatedCost)}
            </span>
          )}
        </div>

        {/* Metrics row */}
        <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Navigation className="h-3 w-3" />
            {formatNm(r.distanceNm)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatFlightTime(displayTime)}
            {tripScope === "round_trip" && (
              <span className="text-muted-foreground/60"> A/R</span>
            )}
          </span>
          <span className="flex items-center gap-1">
            <Fuel className="h-3 w-3" />
            {displayFuel.toFixed(0)} L
          </span>
          {r.aerodrome.maxRunwayLength && (
            <span>{r.aerodrome.maxRunwayLength} m piste</span>
          )}
          {r.aerodrome.elevation != null && (
            <span>{r.aerodrome.elevation} ft</span>
          )}
        </div>

        {/* Badges row */}
        {(r.aerodrome.hasRestaurant ||
          r.aerodrome.hasTransport ||
          r.aerodrome.hasBikes ||
          r.aerodrome.hasAccommodation ||
          r.aerodrome.fuels.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {r.aerodrome.hasRestaurant && (
              <span className="text-[10px] rounded-full bg-orange-100 text-orange-700 px-2 py-0.5">
                🍽 Restaurant
              </span>
            )}
            {r.aerodrome.hasTransport && (
              <span className="text-[10px] rounded-full bg-sky-100 text-sky-700 px-2 py-0.5">
                🚌 Transport
              </span>
            )}
            {r.aerodrome.hasBikes && (
              <span className="text-[10px] rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">
                🚲 Vélos
              </span>
            )}
            {r.aerodrome.hasAccommodation && (
              <span className="text-[10px] rounded-full bg-purple-100 text-purple-700 px-2 py-0.5">
                🏨 Hébergement
              </span>
            )}
            {r.aerodrome.fuels.map((fuel) => {
              const chip = FUEL_CHIP[fuel];
              return chip ? (
                <span
                  key={fuel}
                  className={cn(
                    "text-[10px] rounded-full px-2 py-0.5 font-medium",
                    chip.cls,
                  )}
                >
                  {chip.label}
                </span>
              ) : null;
            })}
          </div>
        )}
      </div>
    </Link>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Aircraft profile state ──
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    name: "",
    tas: "",
    fuelConsumption: "",
    hourlyCost: "",
    fuelRange: "",
    minRunwayLength: "",
    allowedSurfaces: DEFAULT_SURFACES,
  });

  // ── Departure state ──
  const [departureSearch, setDepartureSearch] = useState("");
  const [departureAerodrome, setDepartureAerodrome] = useState<AerodromeOption | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // ── Search parameters ──
  const [searchMode, setSearchMode] = useState<SearchMode>("time");
  const [maxTimeMinutes, setMaxTimeMinutes] = useState(60);
  const [maxCost, setMaxCost] = useState(100);
  const [tripScope, setTripScope] = useState<TripScope>("round_trip");

  // ── Options (collapsed) ──
  const [showOptions, setShowOptions] = useState(false);
  const [reserveMinutes, setReserveMinutes] = useState(30);
  const [fuelPricePerLiter, setFuelPricePerLiter] = useState("");
  const [departureGroundMinutes, setDepartureGroundMinutes] = useState("0");
  const [arrivalGroundMinutes, setArrivalGroundMinutes] = useState("0");

  // ── Filters ──
  const [filters, setFilters] = useState<PlannerFilters>({
    hasRestaurant: false,
    hasTransport: false,
    hasBikes: false,
    hasAccommodation: false,
    fuel100LL: false,
    fuelSP98: false,
  });

  // ── Sort + view ──
  const [sortBy, setSortBy] = useState<SortBy>("time");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  // ── Results ──
  const [results, setResults] = useState<PlannerResult[] | null>(null);
  const [calcError, setCalcError] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // ── Queries ──
  const { data: profilesRes } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => apiClient.get<AircraftProfile[]>("/planner/profiles"),
    enabled: !!user,
  });

  const { data: suggestionsRes } = useQuery({
    queryKey: ["aerodrome-search", departureSearch],
    queryFn: () =>
      apiClient.get<AerodromeOption[]>("/aerodromes/map", { q: departureSearch }),
    enabled: departureSearch.length >= 2 && !departureAerodrome,
  });

  const { data: homeAerodromeRes } = useQuery({
    queryKey: ["aerodrome-home", user?.homeAerodrome?.id],
    queryFn: () =>
      apiClient.get<AerodromeOption>(`/aerodromes/${user!.homeAerodrome!.id}`),
    enabled: !!user?.homeAerodrome?.id,
    staleTime: Infinity,
  });

  const profiles = profilesRes?.data ?? [];
  const suggestions = (suggestionsRes?.data ?? []).slice(0, 8);

  // Auto-select first profile when list loads
  useEffect(() => {
    if (profiles.length > 0 && !selectedProfileId) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles, selectedProfileId]);

  // Pre-fill departure from home aerodrome
  useEffect(() => {
    if (homeAerodromeRes?.data && !departureAerodrome) {
      const ad = homeAerodromeRes.data;
      setDepartureAerodrome(ad);
      setDepartureSearch(ad.icaoCode ? `${ad.icaoCode} — ${ad.name}` : ad.name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeAerodromeRes]);

  // Close suggestion dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Mutations ──
  const createProfileMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post("/planner/profiles", data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      setShowProfileForm(false);
      const created = res.data as AircraftProfile;
      setSelectedProfileId(created.id);
      setProfileForm({
        name: "",
        tas: "",
        fuelConsumption: "",
        hourlyCost: "",
        fuelRange: "",
        minRunwayLength: "",
        allowedSurfaces: DEFAULT_SURFACES,
      });
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/planner/profiles/${id}`),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      if (selectedProfileId === deletedId) setSelectedProfileId(null);
    },
  });

  // ── Handlers ──
  const handleSelectDeparture = (ad: AerodromeOption) => {
    setDepartureAerodrome(ad);
    setDepartureSearch(ad.icaoCode ? `${ad.icaoCode} — ${ad.name}` : ad.name);
    setShowSuggestions(false);
  };

  const handleClearDeparture = () => {
    setDepartureAerodrome(null);
    setDepartureSearch("");
    setResults(null);
  };

  const toggleFilter = useCallback((key: keyof PlannerFilters) => {
    setFilters((f) => ({ ...f, [key]: !f[key] }));
  }, []);

  const toggleSurface = (surface: string) => {
    setProfileForm((f) => ({
      ...f,
      allowedSurfaces: f.allowedSurfaces.includes(surface)
        ? f.allowedSurfaces.filter((s) => s !== surface)
        : [...f.allowedSurfaces, surface],
    }));
  };

  const handleCreateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (profileForm.allowedSurfaces.length === 0) return;
    createProfileMutation.mutate({
      name: profileForm.name,
      tas: parseFloat(profileForm.tas),
      fuelConsumption: parseFloat(profileForm.fuelConsumption),
      hourlyCost: parseFloat(profileForm.hourlyCost) || 0,
      fuelRange: parseFloat(profileForm.fuelRange),
      minRunwayLength: parseInt(profileForm.minRunwayLength) || 0,
      allowedSurfaces: profileForm.allowedSurfaces,
    });
  };

  const handleCalculate = async () => {
    if (!selectedProfileId || !departureAerodrome) return;
    setIsCalculating(true);
    setCalcError("");
    setShowAll(false);

    const payload: Record<string, unknown> = {
      profileId: selectedProfileId,
      departureLat: departureAerodrome.latitude,
      departureLng: departureAerodrome.longitude,
      searchMode,
      tripScope,
      reserveMinutes,
      departureGroundMinutes: parseInt(departureGroundMinutes) || 0,
      arrivalGroundMinutes: parseInt(arrivalGroundMinutes) || 0,
      sortBy,
    };

    if (searchMode === "time") payload.maxTimeMinutes = maxTimeMinutes;
    if (searchMode === "cost") payload.maxCost = maxCost;

    const fuelPrice = parseFloat(fuelPricePerLiter);
    if (fuelPrice > 0) payload.fuelPricePerLiter = fuelPrice;

    const activeFilters: Partial<PlannerFilters> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v) (activeFilters as Record<string, boolean>)[k] = true;
    }
    if (Object.keys(activeFilters).length > 0) payload.filters = activeFilters;

    try {
      const res = await apiClient.post<PlannerResult[]>("/planner/calculate", payload);
      setResults(res.data);
    } catch (err: unknown) {
      setCalcError(err instanceof Error ? err.message : "Erreur lors du calcul.");
      setResults(null);
    } finally {
      setIsCalculating(false);
    }
  };

  // Client-side re-sort for instant feedback when changing sortBy/sortOrder
  const sortedResults = results
    ? [...results].sort((a, b) => {
        if (sortBy === "region") {
          const ra = a.aerodrome.region ?? "Zzz";
          const rb = b.aerodrome.region ?? "Zzz";
          const regionDiff = ra.localeCompare(rb, "fr");
          if (regionDiff !== 0) return sortOrder === "asc" ? regionDiff : -regionDiff;
          return a.timeHours - b.timeHours; // secondary: time within region
        }
        let diff: number;
        if (sortBy === "cost") diff = a.estimatedCost - b.estimatedCost;
        else if (sortBy === "distance") diff = a.distanceNm - b.distanceNm;
        else diff = a.timeHours - b.timeHours;
        return sortOrder === "asc" ? diff : -diff;
      })
    : null;

  // Group by region (used when sortBy === "region")
  const regionGroups: [string, PlannerResult[]][] =
    sortBy === "region" && sortedResults
      ? (() => {
          const map: Record<string, PlannerResult[]> = {};
          for (const r of sortedResults) {
            const key = r.aerodrome.region ?? "Région inconnue";
            if (!map[key]) map[key] = [];
            map[key]!.push(r);
          }
          return Object.entries(map);
        })()
      : [];

  const visibleResults = sortedResults
    ? showAll
      ? sortedResults
      : sortedResults.slice(0, 20)
    : null;

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  // ── Unauthenticated guard ──
  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <Navigation className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-40" />
        <h1 className="text-2xl font-bold mb-2">Planificateur de Vol</h1>
        <p className="text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">
            Connectez-vous
          </Link>{" "}
          pour utiliser le planificateur.
        </p>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Navigation className="h-8 w-8 text-primary" />
          Planificateur de Vol
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Trouvez des destinations accessibles depuis votre terrain de départ.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr] items-start">
        {/* ─── LEFT PANEL ────────────────────────────────── */}
        <div className="space-y-4">

          {/* 1 · Departure */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Aérodrome de départ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Home aerodrome shortcut */}
              {user.homeAerodrome && !departureAerodrome && (
                <button
                  onClick={() => {
                    if (homeAerodromeRes?.data) handleSelectDeparture(homeAerodromeRes.data);
                  }}
                  disabled={!homeAerodromeRes?.data}
                  className="w-full text-left text-xs rounded-md border border-dashed border-primary/50 px-3 py-1.5 text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                >
                  Utiliser ma base :{" "}
                  <span className="font-medium">
                    {user.homeAerodrome.icaoCode ?? user.homeAerodrome.name}
                  </span>
                </button>
              )}

              {/* Search input */}
              <div ref={searchRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9 pr-8"
                    placeholder="Nom ou code ICAO..."
                    value={departureSearch}
                    onChange={(e) => {
                      setDepartureSearch(e.target.value);
                      setDepartureAerodrome(null);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => {
                      if (departureSearch.length >= 2) setShowSuggestions(true);
                    }}
                  />
                  {departureAerodrome && (
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs leading-none"
                      onClick={handleClearDeparture}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && !departureAerodrome && (
                  <div className="absolute z-20 w-full mt-1 rounded-md border bg-background shadow-lg">
                    {suggestions.map((ad) => (
                      <button
                        key={ad.id}
                        className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors"
                        onMouseDown={() => handleSelectDeparture(ad)}
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">{ad.name}</span>
                          {ad.icaoCode && (
                            <Badge variant="secondary" className="text-xs font-mono">
                              {ad.icaoCode}
                            </Badge>
                          )}
                        </div>
                        {ad.city && (
                          <div className="text-xs text-muted-foreground">{ad.city}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected departure info */}
              {departureAerodrome && (
                <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                  <div className="font-semibold">{departureAerodrome.name}</div>
                  {departureAerodrome.city && (
                    <div className="opacity-70">{departureAerodrome.city}</div>
                  )}
                  {departureAerodrome.elevation != null && (
                    <div className="opacity-70">{departureAerodrome.elevation} ft AMSL</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 2 · Aircraft profile */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Plane className="h-4 w-4 text-primary" />
                Aéronef
              </CardTitle>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setShowProfileForm((v) => !v)}
              >
                <Plus className="h-3 w-3" />
                Nouveau
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Create form */}
              {showProfileForm && (
                <form
                  onSubmit={handleCreateProfile}
                  className="rounded-md border p-3 space-y-2.5 mb-1"
                >
                  <Input
                    placeholder="Nom (ex. C172 F-GABCD)"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-0.5 block">
                        Vitesse TAS (kts)
                      </label>
                      <Input
                        type="number"
                        placeholder="100"
                        value={profileForm.tas}
                        onChange={(e) => setProfileForm((f) => ({ ...f, tas: e.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-0.5 block">
                        Conso. (L/h)
                      </label>
                      <Input
                        type="number"
                        placeholder="28"
                        value={profileForm.fuelConsumption}
                        onChange={(e) =>
                          setProfileForm((f) => ({ ...f, fuelConsumption: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-0.5 block">
                        Coût horaire (€/h)
                      </label>
                      <Input
                        type="number"
                        placeholder="120"
                        value={profileForm.hourlyCost}
                        onChange={(e) =>
                          setProfileForm((f) => ({ ...f, hourlyCost: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-0.5 block">
                        Autonomie (NM)
                      </label>
                      <Input
                        type="number"
                        placeholder="400"
                        value={profileForm.fuelRange}
                        onChange={(e) =>
                          setProfileForm((f) => ({ ...f, fuelRange: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground mb-0.5 block">
                        Piste min. (m, 0 = toutes)
                      </label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={profileForm.minRunwayLength}
                        onChange={(e) =>
                          setProfileForm((f) => ({ ...f, minRunwayLength: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  {/* Allowed surfaces */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Revêtements acceptés
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {["ASPHALT", "CONCRETE", "GRASS", "GRAVEL", "DIRT"].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleSurface(s)}
                          className={cn(
                            "text-xs rounded px-2 py-1 border transition-colors",
                            profileForm.allowedSurfaces.includes(s)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:border-primary/50",
                          )}
                        >
                          {SURFACE_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      className="flex-1"
                      disabled={createProfileMutation.isPending}
                    >
                      Enregistrer
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowProfileForm(false)}
                    >
                      Annuler
                    </Button>
                  </div>
                </form>
              )}

              {/* Profile list */}
              {profiles.length === 0 && !showProfileForm ? (
                <p className="text-sm text-muted-foreground text-center py-3">
                  Créez un profil pour commencer.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {profiles.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProfileId(p.id)}
                      className={cn(
                        "flex items-center justify-between rounded-md border p-2.5 cursor-pointer transition-colors",
                        selectedProfileId === p.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-accent/30",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium flex items-center gap-1.5">
                          {selectedProfileId === p.id && (
                            <Check className="h-3 w-3 text-primary shrink-0" />
                          )}
                          {p.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {p.tas} kt · {p.fuelConsumption} L/h · {p.hourlyCost} €/h ·{" "}
                          {p.fuelRange} NM
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteProfileMutation.mutate(p.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 3 · Search constraint */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Contrainte
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Mode selector */}
              <div className="grid grid-cols-3 gap-1">
                {(["time", "cost", "unlimited"] as SearchMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setSearchMode(mode)}
                    className={cn(
                      "text-xs rounded-md border py-1.5 transition-colors",
                      searchMode === mode
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-accent/50",
                    )}
                  >
                    {mode === "time" ? "Durée" : mode === "cost" ? "Budget" : "Illimité"}
                  </button>
                ))}
              </div>

              {/* Time input */}
              {searchMode === "time" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {TIME_PRESETS.map((min) => {
                      const label =
                        min < 60
                          ? `${min}min`
                          : min === 60
                            ? "1h"
                            : `${Math.floor(min / 60)}h${min % 60 > 0 ? min % 60 : ""}`;
                      return (
                        <button
                          key={min}
                          onClick={() => setMaxTimeMinutes(min)}
                          className={cn(
                            "text-xs rounded px-2.5 py-1 border transition-colors",
                            maxTimeMinutes === min
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border hover:border-primary/50",
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={10}
                      max={480}
                      value={maxTimeMinutes}
                      onChange={(e) => setMaxTimeMinutes(parseInt(e.target.value) || 60)}
                      className="w-20 text-center"
                    />
                    <span className="text-sm text-muted-foreground">minutes</span>
                  </div>
                </div>
              )}

              {/* Cost input */}
              {searchMode === "cost" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={10}
                    max={10000}
                    value={maxCost}
                    onChange={(e) => setMaxCost(parseInt(e.target.value) || 100)}
                    className="w-28 text-center"
                  />
                  <span className="text-sm text-muted-foreground">€ max</span>
                </div>
              )}

              {/* Trip scope */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Trajet</label>
                <div className="grid grid-cols-2 gap-1">
                  {(["outbound", "round_trip"] as TripScope[]).map((scope) => (
                    <button
                      key={scope}
                      onClick={() => setTripScope(scope)}
                      className={cn(
                        "text-xs rounded-md border py-1.5 transition-colors",
                        tripScope === scope
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:bg-accent/50",
                      )}
                    >
                      {scope === "outbound" ? "Aller simple" : "Aller-Retour"}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 4 · Options (collapsible) */}
          <Card>
            <button className="w-full" onClick={() => setShowOptions((v) => !v)}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between w-full">
                  <span>Options</span>
                  {showOptions ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </CardTitle>
              </CardHeader>
            </button>
            {showOptions && (
              <CardContent className="pt-0 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Réserve (min)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={120}
                      value={reserveMinutes}
                      onChange={(e) => setReserveMinutes(parseInt(e.target.value) || 30)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Prix carbu. (€/L)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      max={10}
                      placeholder="0.00"
                      value={fuelPricePerLiter}
                      onChange={(e) => setFuelPricePerLiter(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Le prix carburant s'ajoute au coût horaire. Laissez vide si votre tarif
                  horaire inclut déjà le carburant.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Procédure départ (min)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={60}
                      value={departureGroundMinutes}
                      onChange={(e) => setDepartureGroundMinutes(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Procédure arrivée (min)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={60}
                      value={arrivalGroundMinutes}
                      onChange={(e) => setArrivalGroundMinutes(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Temps au sol ajouté au temps de vol (roulage, mise en route, ATIS…).
                  Compte double en aller-retour.
                </p>
              </CardContent>
            )}
          </Card>

          {/* 5 · Destination filters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Fuel className="h-4 w-4 text-primary" />
                Filtres destination
                {activeFilterCount > 0 && (
                  <Badge className="h-4 px-1.5 text-[10px] ml-auto">{activeFilterCount}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {DESTINATION_FILTERS.map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => toggleFilter(key)}
                    className={cn(
                      "text-xs rounded-full border px-3 py-1 transition-colors",
                      filters[key]
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                    )}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 6 · Sort + calculate */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Trier par</span>
              <div className="flex gap-1 flex-1">
                {SORT_OPTIONS.map((opt) => {
                  const isActive = sortBy === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        if (isActive) {
                          setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
                        } else {
                          setSortBy(opt.value);
                          setSortOrder("asc");
                        }
                      }}
                      className={cn(
                        "flex-1 text-xs rounded-md border py-1.5 transition-colors flex items-center justify-center gap-1",
                        isActive
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:bg-accent/50",
                      )}
                    >
                      {opt.label}
                      {isActive && (
                        sortOrder === "asc"
                          ? <ArrowUp className="h-3 w-3" />
                          : <ArrowDown className="h-3 w-3" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleCalculate}
              disabled={!selectedProfileId || !departureAerodrome || isCalculating}
            >
              <Navigation className="mr-2 h-4 w-4" />
              {isCalculating ? "Calcul en cours…" : "Trouver les destinations"}
            </Button>
          </div>
        </div>

        {/* ─── RIGHT PANEL ───────────────────────────────── */}
        <div className="space-y-4">
          {/* Results header */}
          {sortedResults !== null && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{sortedResults.length}</span>{" "}
                destination{sortedResults.length !== 1 ? "s" : ""}
                {selectedProfile && (
                  <span className="text-xs ml-1">
                    · {selectedProfile.name}
                    {" · "}
                    {tripScope === "round_trip" ? "Aller-Retour" : "Aller simple"}
                    {searchMode === "time" && ` · ≤ ${formatFlightTime(maxTimeMinutes / 60)}`}
                    {searchMode === "cost" && ` · ≤ ${maxCost} €`}
                  </span>
                )}
              </div>

              {/* View toggle */}
              <div className="ml-auto flex gap-1">
                {(["list", "map"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      "flex items-center gap-1.5 text-xs rounded-md border px-2.5 py-1.5 transition-colors",
                      viewMode === mode
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-accent/50",
                    )}
                  >
                    {mode === "list" ? (
                      <List className="h-3.5 w-3.5" />
                    ) : (
                      <Map className="h-3.5 w-3.5" />
                    )}
                    {mode === "list" ? "Liste" : "Carte"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {calcError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {calcError}
            </div>
          )}

          {/* Disclaimer */}
          {sortedResults !== null && sortedResults.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Estimations indicatives (vol direct, sans vent ni météo). Consultez toujours
              l'AIP et les NOTAM avant le vol.
            </p>
          )}

          {/* Map view */}
          {viewMode === "map" && sortedResults !== null && (
            <PlannerMap departure={departureAerodrome} results={sortedResults} />
          )}

          {/* List view */}
          {viewMode === "list" && (
            <>
              {sortedResults === null ? (
                <Card>
                  <CardContent className="py-16 text-center">
                    <Navigation className="mx-auto h-10 w-10 text-muted-foreground opacity-20 mb-3" />
                    <p className="text-muted-foreground text-sm">
                      Configurez votre départ, votre aéronef et la contrainte, puis lancez la
                      recherche.
                    </p>
                  </CardContent>
                </Card>
              ) : sortedResults.length === 0 ? (
                <Card>
                  <CardContent className="py-16 text-center">
                    <Plane className="mx-auto h-10 w-10 text-muted-foreground opacity-20 mb-3" />
                    <p className="text-muted-foreground text-sm font-medium">
                      Aucune destination trouvée
                    </p>
                    <p className="text-muted-foreground text-xs mt-1">
                      Augmentez la durée ou le budget, ou retirez certains filtres.
                    </p>
                  </CardContent>
                </Card>
              ) : sortBy === "region" ? (
                <div className="space-y-4">
                  {regionGroups.map(([region, items]) => (
                    <div key={region}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {region}
                        </span>
                        <span className="text-xs text-muted-foreground">({items.length})</span>
                        <div className="flex-1 border-t border-border" />
                      </div>
                      <div className="space-y-2">
                        {items.map((r) => (
                          <ResultCard key={r.aerodrome.id} result={r} tripScope={tripScope} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleResults!.map((r) => (
                    <ResultCard key={r.aerodrome.id} result={r} tripScope={tripScope} />
                  ))}
                  {sortedResults.length > 20 && !showAll && (
                    <button
                      onClick={() => setShowAll(true)}
                      className="w-full text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-md py-2.5 transition-colors"
                    >
                      Voir les {sortedResults.length - 20} destinations supplémentaires
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
