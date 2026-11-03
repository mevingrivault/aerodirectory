"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { cn, formatFlightTime } from "@/lib/utils";
import Link from "next/link";
import type { PlannerResult, SavedSearchItem } from "@aerodirectory/shared";
import {
  AIRCRAFT_CATEGORIES,
  AIRCRAFT_FUELS,
  FUEL_SHORT_LABELS,
  NO_FILTERS,
  type AerodromeOption,
  type AircraftProfile,
  type PlannerFilters,
  type SearchMode,
  type SortBy,
  type TripScope,
} from "@/components/planner/types";
import {
  BikeIcon,
  BusIcon,
  HomeIcon,
  IcoBookmark,
  IcoCheck,
  IcoClock,
  IcoDownload,
  IcoFilter,
  IcoGlobe,
  IcoInfo,
  IcoMapPin,
  IcoNav,
  IcoNavIco,
  IcoPlane,
  IcoPlus,
  IcoSave,
  IcoSearch,
  IcoSettings,
  IcoSort,
  IcoTrash,
  IcoX,
  RestaurantIcon,
} from "@/components/planner/icons";
import { PlannerMap } from "@/components/planner/planner-map";
import { ResultRow } from "@/components/planner/result-row";
import { PLANNER_CSS } from "@/components/planner/styles";


// ─── Constants ─────────────────────────────────────────────────────────────

const TIME_PRESETS = [30, 45, 60, 90, 120];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "time", label: "Temps ↑" },
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

const DEFAULT_SURFACES = ["ASPHALT", "CONCRETE", "GRASS"];

function safeCsv(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

/** "HH:MM" of a datetime-local value, kept by saved searches instead of a date that would go stale. */
const clockOf = (local: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local) ? local.slice(11, 16) : "");

/** Next time the clock reads "HH:MM", as a datetime-local value: today if still ahead, else tomorrow. */
function nextAt(clock: string): string {
  const [h, m] = clock.split(":").map(Number);
  if (h == null || m == null || Number.isNaN(h) || Number.isNaN(m)) return "";
  const at = new Date();
  at.setHours(h, m, 0, 0);
  if (at.getTime() < Date.now()) at.setDate(at.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(h)}:${pad(m)}`;
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
    fuelType: "",
    category: "",
    maxCrosswindKt: "",
  });

  // ── Departure state ──
  const [departureSearch, setDepartureSearch] = useState("");
  const [departureAerodrome, setDepartureAerodrome] = useState<AerodromeOption | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // ── Search parameters ──
  const [searchMode, setSearchMode] = useState<SearchMode>("time");
  const [maxTimeMinutes, setMaxTimeMinutes] = useState(60);
  const [minTimeMinutes, setMinTimeMinutes] = useState("");
  const [maxCost, setMaxCost] = useState(100);
  const [minCost, setMinCost] = useState("");
  const [tripScope, setTripScope] = useState<TripScope>("round_trip");

  // ── Options (collapsed) ──
  const [showOptions, setShowOptions] = useState(false);
  const [reserveMinutes, setReserveMinutes] = useState(30);
  const [fuelPricePerLiter, setFuelPricePerLiter] = useState("");
  const [departureGroundMinutes, setDepartureGroundMinutes] = useState("0");
  const [arrivalGroundMinutes, setArrivalGroundMinutes] = useState("0");
  // Local date and time from <input type="datetime-local">; "" = no night check.
  const [departureTime, setDepartureTime] = useState("");
  const [stayMinutes, setStayMinutes] = useState("60");
  const [excludeNight, setExcludeNight] = useState(false);
  const [minDistanceKm, setMinDistanceKm] = useState("0");

  // ── Filters ──
  const [filters, setFilters] = useState<PlannerFilters>(NO_FILTERS);

  // ── Sort + view ──
  const [sortBy, setSortBy] = useState<SortBy>("time");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [selectedSavedSearchId, setSelectedSavedSearchId] = useState("");

  // ── Results ──
  const [results, setResults] = useState<PlannerResult[] | null>(null);
  const [calcError, setCalcError] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [collapsedRegions, setCollapsedRegions] = useState<Set<string>>(new Set());

  // ── Sidebar/drawer state (only used on desktop now; mobile renders inline) ──
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Queries ──
  const { data: profilesRes } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => apiClient.get<AircraftProfile[]>("/planner/profiles"),
    enabled: !!user,
  });

  const { data: suggestionsRes } = useQuery({
    queryKey: ["aerodrome-search", departureSearch],
    queryFn: () => apiClient.get<AerodromeOption[]>("/aerodromes/map", { q: departureSearch }),
    enabled: departureSearch.length >= 2 && !departureAerodrome,
  });

  const { data: homeAerodromeRes } = useQuery({
    queryKey: ["aerodrome-home", user?.homeAerodrome?.id],
    queryFn: () => apiClient.get<AerodromeOption>(`/aerodromes/${user!.homeAerodrome!.id}`),
    enabled: !!user?.homeAerodrome?.id,
    staleTime: Infinity,
  });

  const profiles = profilesRes?.data ?? [];
  const suggestions = (suggestionsRes?.data ?? []).slice(0, 8);

  const { data: savedSearchesRes } = useQuery({
    queryKey: ["saved-searches-planner"],
    queryFn: () => apiClient.get<SavedSearchItem[]>("/search/saved", { scope: "planner" }),
    enabled: !!user,
  });

  const savedSearches = savedSearchesRes?.data ?? [];

  useEffect(() => {
    if (profiles.length > 0 && !selectedProfileId) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles, selectedProfileId]);

  useEffect(() => {
    if (homeAerodromeRes?.data && !departureAerodrome) {
      const ad = homeAerodromeRes.data;
      setDepartureAerodrome(ad);
      setDepartureSearch(ad.icaoCode ? `${ad.icaoCode} — ${ad.name}` : ad.name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeAerodromeRes]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Lock body scroll when sidebar open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.classList.add("drawer-open");
    } else {
      document.body.classList.remove("drawer-open");
    }
    return () => document.body.classList.remove("drawer-open");
  }, [sidebarOpen]);

  // ── Mutations ──
  const createProfileMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post("/planner/profiles", data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      setShowProfileForm(false);
      const created = res.data as AircraftProfile;
      setSelectedProfileId(created.id);
      setProfileForm({ name: "", tas: "", fuelConsumption: "", hourlyCost: "", fuelRange: "", minRunwayLength: "", allowedSurfaces: DEFAULT_SURFACES, fuelType: "", category: "", maxCrosswindKt: "" });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; fuelType?: string | null; category?: string | null; maxCrosswindKt?: number | null }) =>
      apiClient.put(`/planner/profiles/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profiles"] }),
  });

  const deleteProfileMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/planner/profiles/${id}`),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      if (selectedProfileId === deletedId) setSelectedProfileId(null);
    },
  });

  const savePlannerSearchMutation = useMutation({
    mutationFn: (payload: { name: string; params: Record<string, string>; isPublic: boolean }) =>
      apiClient.post("/search/saved", { name: payload.name, scope: "planner", isPublic: payload.isPublic, params: payload.params }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-searches-planner"] }),
  });

  const deleteSavedSearchMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/search/saved/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-searches-planner"] });
      setSelectedSavedSearchId("");
    },
  });

  const updateSavedSearchVisibilityMutation = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) =>
      apiClient.put(`/search/saved/${id}`, { isPublic }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-searches-planner"] }),
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
      fuelType: profileForm.fuelType || null,
      category: profileForm.category || null,
      maxCrosswindKt: profileForm.maxCrosswindKt.trim() === "" ? null : parseInt(profileForm.maxCrosswindKt),
    });
  };

  const buildPlannerSearchParams = useCallback(() => {
    const params: Record<string, string> = {
      searchMode, tripScope, reserveMinutes: String(reserveMinutes), sortBy,
      departureGroundMinutes, arrivalGroundMinutes, minDistanceKm, fuelPricePerLiter, stayMinutes,
      ...(excludeNight ? { excludeNight: "true" } : {}),
      departureClock: clockOf(departureTime),
      maxTimeMinutes: String(maxTimeMinutes), minTimeMinutes, maxCost: String(maxCost), minCost, viewMode,
    };
    if (departureAerodrome) {
      params["departureId"] = departureAerodrome.id;
      params["departureName"] = departureAerodrome.icaoCode
        ? `${departureAerodrome.icaoCode} — ${departureAerodrome.name}`
        : departureAerodrome.name;
    }
    if (selectedProfileId) params["profileId"] = selectedProfileId;
    for (const [key, value] of Object.entries(filters)) {
      if (value) params[key] = "true";
    }
    return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== ""));
  }, [arrivalGroundMinutes, departureAerodrome, departureGroundMinutes, departureTime, excludeNight, filters, fuelPricePerLiter, maxCost, maxTimeMinutes, minCost, minDistanceKm, minTimeMinutes, reserveMinutes, searchMode, selectedProfileId, sortBy, stayMinutes, tripScope, viewMode]);

  const applySavedPlannerSearch = useCallback(async (saved: SavedSearchItem) => {
    const params = saved.params ?? {};
    setSearchMode((params["searchMode"] as SearchMode) || "time");
    setTripScope((params["tripScope"] as TripScope) || "round_trip");
    setReserveMinutes(Number(params["reserveMinutes"] ?? "30"));
    setSortBy((params["sortBy"] as SortBy) || "time");
    setViewMode((params["viewMode"] as "list" | "map") || "list");
    setDepartureGroundMinutes(params["departureGroundMinutes"] ?? "0");
    setArrivalGroundMinutes(params["arrivalGroundMinutes"] ?? "0");
    setStayMinutes(params["stayMinutes"] ?? "60");
    setExcludeNight(params["excludeNight"] === "true");
    setDepartureTime(params["departureClock"] ? nextAt(params["departureClock"]) : "");
    setMinDistanceKm(params["minDistanceKm"] ?? "0");
    setFuelPricePerLiter(params["fuelPricePerLiter"] ?? "");
    setMaxTimeMinutes(Number(params["maxTimeMinutes"] ?? "60"));
    setMinTimeMinutes(params["minTimeMinutes"] ?? "");
    setMaxCost(Number(params["maxCost"] ?? "100"));
    setMinCost(params["minCost"] ?? "");
    setFilters(
      Object.fromEntries(
        Object.keys(NO_FILTERS).map((key) => [key, params[key] === "true"]),
      ) as unknown as PlannerFilters,
    );
    if (params["profileId"]) setSelectedProfileId(params["profileId"]);
    if (params["departureId"]) {
      try {
        const departure = await apiClient.get<AerodromeOption>(`/aerodromes/${params["departureId"]}`);
        setDepartureAerodrome(departure.data);
        setDepartureSearch(params["departureName"] ?? (departure.data.icaoCode ? `${departure.data.icaoCode} — ${departure.data.name}` : departure.data.name));
      } catch {
        setDepartureAerodrome(null);
      }
    }
  }, []);

  const handleSaveCurrentPlannerSearch = () => {
    const name = window.prompt("Nom de la recherche planificateur");
    if (!name || !name.trim()) return;
    const isPublic = window.confirm("Rendre cette recherche planificateur publique sur votre profil ?");
    savePlannerSearchMutation.mutate({ name: name.trim(), params: buildPlannerSearchParams(), isPublic });
  };

  useEffect(() => {
    const currentParams = new URLSearchParams(window.location.search);
    const departureId = currentParams.get("departureId");
    if (!departureId) return;
    void applySavedPlannerSearch({
      id: "url-replay", name: "Replay URL", scope: "planner", isPublic: false,
      params: Object.fromEntries(currentParams.entries()),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
  }, [applySavedPlannerSearch]);

  const handleCalculate = async () => {
    if (!selectedProfileId || !departureAerodrome) return;
    setIsCalculating(true);
    setCalcError("");
    setCollapsedRegions(new Set());

    const payload: Record<string, unknown> = {
      profileId: selectedProfileId,
      departureLat: departureAerodrome.latitude,
      departureLng: departureAerodrome.longitude,
      searchMode, tripScope, reserveMinutes,
      departureGroundMinutes: parseInt(departureGroundMinutes) || 0,
      arrivalGroundMinutes: parseInt(arrivalGroundMinutes) || 0,
      sortBy,
    };

    if (departureTime) {
      const at = new Date(departureTime); // datetime-local is read as local time
      if (!Number.isNaN(at.getTime())) {
        payload.departureTime = at.toISOString();
        payload.stayMinutes = Math.min(1440, Math.max(0, parseInt(stayMinutes) || 0));
        if (excludeNight) payload.excludeNight = true;
      }
    }

    if (searchMode === "time") {
      payload.maxTimeMinutes = maxTimeMinutes;
      const parsedMin = parseInt(minTimeMinutes);
      if (parsedMin > 0) payload.minTimeMinutes = parsedMin;
    }
    if (searchMode === "cost") {
      payload.maxCost = maxCost;
      const parsedMinCost = parseFloat(minCost);
      if (parsedMinCost > 0) payload.minCost = parsedMinCost;
    }

    const fuelPrice = parseFloat(fuelPricePerLiter);
    if (fuelPrice > 0) payload.fuelPricePerLiter = fuelPrice;

    const parsedMinDistanceKm = parseFloat(minDistanceKm);
    if (parsedMinDistanceKm > 0) payload.minDistanceNm = parsedMinDistanceKm * 0.539957;

    const activeFilters: Partial<PlannerFilters> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v) (activeFilters as Record<string, boolean>)[k] = true;
    }
    if (Object.keys(activeFilters).length > 0) {
      const { excludeVisited, includePrivate, ...destinationFilters } = activeFilters as PlannerFilters;
      if (excludeVisited) payload.excludeVisited = true;
      if (includePrivate) payload.includePrivate = true;
      if (Object.keys(destinationFilters).length > 0) payload.filters = destinationFilters;
    }

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

  const sortedResults = results
    ? [...results].sort((a, b) => {
        if (sortBy === "region") {
          const ra = a.aerodrome.region ?? "Zzz";
          const rb = b.aerodrome.region ?? "Zzz";
          const regionDiff = ra.localeCompare(rb, "fr");
          if (regionDiff !== 0) return sortOrder === "asc" ? regionDiff : -regionDiff;
          return a.timeHours - b.timeHours;
        }
        let diff: number;
        if (sortBy === "cost") diff = a.estimatedCost - b.estimatedCost;
        else if (sortBy === "distance") diff = a.distanceNm - b.distanceNm;
        else diff = a.timeHours - b.timeHours;
        return sortOrder === "asc" ? diff : -diff;
      })
    : null;

  const regionGroups: [string, PlannerResult[]][] = sortedResults
    ? (() => {
        const map: Record<string, PlannerResult[]> = {};
        for (const r of sortedResults) {
          const key = r.aerodrome.region ?? "Région inconnue";
          if (!map[key]) map[key] = [];
          map[key]!.push(r);
        }
        return Object.entries(map).sort(([a], [b]) => a.localeCompare(b, "fr"));
      })()
    : [];

  const toggleRegion = (region: string) => {
    setCollapsedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return next;
    });
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  // Usable range circles for the map: the reserve is taken off like the API does.
  const mapRanges = (() => {
    if (!selectedProfile) return null;
    const usable = Math.max(0, selectedProfile.fuelRange - (reserveMinutes / 60) * selectedProfile.tas);
    return { oneWayNm: usable, roundTripNm: tripScope === "round_trip" ? usable / 2 : null };
  })();

  // Same trip settings as the search, so the briefing matches the result.
  const briefingHref = (() => {
    if (!departureAerodrome || !selectedProfileId) return null;
    const qs = new URLSearchParams({
      from: departureAerodrome.id,
      profile: selectedProfileId,
      scope: tripScope,
      reserve: String(reserveMinutes),
      gdep: String(parseInt(departureGroundMinutes) || 0),
      garr: String(parseInt(arrivalGroundMinutes) || 0),
    });
    const fuelPrice = parseFloat(fuelPricePerLiter);
    if (fuelPrice > 0) qs.set("fuel", String(fuelPrice));
    const at = departureTime ? new Date(departureTime) : null;
    if (at && !Number.isNaN(at.getTime())) {
      qs.set("dep", at.toISOString());
      qs.set("stay", String(parseInt(stayMinutes) || 0));
    }
    return `/briefing?${qs.toString()}`;
  })();

  const downloadFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    if (!sortedResults || sortedResults.length === 0) return;
    const lines = [
      ["Nom","ICAO","Ville","Region","DistanceNM","TempsH","TempsTrajetH","CarburantL","CarburantTrajetL","CoutEUR"].join(","),
      ...sortedResults.map((r) => [
        safeCsv(r.aerodrome.name), safeCsv(r.aerodrome.icaoCode ?? ""), safeCsv(r.aerodrome.city ?? ""),
        safeCsv(r.aerodrome.region ?? ""), r.distanceNm, r.timeHours, r.tripTimeHours,
        r.fuelUsedLiters, r.tripFuelLiters, r.estimatedCost,
      ].join(",")),
    ];
    downloadFile(`planner-${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
  };

  // ── Unauthenticated guard ──
  if (!user) {
    return (
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "64px 32px", textAlign: "center" }}>
        <div style={{
          width: 56, height: 56, borderRadius: 12,
          background: "var(--horizon-100)", color: "var(--horizon-700)",
          display: "grid", placeItems: "center", margin: "0 auto 20px",
        }}>
          <IcoNav />
        </div>
        <h1 style={{ fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: 32, margin: "0 0 12px", color: "var(--ink-950)" }}>
          Planificateur de vol
        </h1>
        <p style={{ fontSize: 15, color: "var(--ink-700)", margin: "0 0 24px" }}>
          <Link href="/login" style={{ color: "var(--horizon-700)", textDecoration: "underline" }}>
            Connectez-vous
          </Link>{" "}
          pour utiliser le planificateur.
        </p>
      </div>
    );
  }

  // ── Render ──
  return (
    <>
      <style>{PLANNER_CSS}</style>

      {/* Mobile scrim */}
      <div
        className="planner-scrim"
        style={{ display: sidebarOpen ? "block" : "none" }}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Mobile FAB */}
      <button className={cn("planner-fab", sidebarOpen && "is-hidden")} onClick={() => setSidebarOpen(true)}>
        <IcoFilter />
        Filtres
        {activeFilterCount > 0 && (
          <span style={{
            display: "inline-grid", placeItems: "center",
            minWidth: 22, height: 22, padding: "0 6px",
            background: "var(--terrain-500)", color: "var(--ink-950)",
            borderRadius: 999, fontSize: 11, fontWeight: 700,
          }}>
            {activeFilterCount}
          </span>
        )}
      </button>

      <div className="planner-page-wrap" style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 32px 64px" }}>

        {/* Page head */}
        <div style={{ marginBottom: 28 }}>
          <h1 className="planner-page-title" style={{
            display: "flex", alignItems: "center", gap: 14,
            fontFamily: "var(--f-serif)", fontWeight: 500,
            fontSize: 40, lineHeight: 1.05, letterSpacing: "-0.015em",
            margin: 0, color: "var(--ink-950)",
          }}>
            <span className="planner-page-title-ico" style={{
              width: 40, height: 40, borderRadius: 8,
              background: "var(--horizon-100)", color: "var(--horizon-700)",
              display: "grid", placeItems: "center", flexShrink: 0,
            }}>
              <IcoNav />
            </span>
            Planificateur de vol
          </h1>
          <p className="planner-page-sub" style={{ fontSize: 15, color: "var(--ink-700)", margin: "10px 0 0 54px", maxWidth: 620 }}>
            Trouvez les destinations accessibles depuis votre terrain de départ, selon vos contraintes de temps et de budget.
          </p>
        </div>

        <div className="planner-layout">

          {/* ─── SIDEBAR (desktop: grid col; mobile: fixed drawer via CSS) ─── */}
          <aside className={cn("planner-sidebar", sidebarOpen && "open")} aria-hidden={!sidebarOpen}>

            {/* Mobile header */}
            <div className="planner-sidebar-mobile-head">
              <div style={{ fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: 22 }}>Filtres</div>
              <button className="planner-btn-ghost" onClick={() => setSidebarOpen(false)}>
                <IcoX /> Fermer
              </button>
            </div>

            {/* Saved searches */}
            {user && (
              <div className="planner-saved-panel">
                <div className="planner-saved-label">
                  <IcoBookmark />
                  Recherches sauvegardées
                </div>
                {savedSearches.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--ink-500)", margin: 0 }}>
                    Aucune recherche sauvegardée. Configurez et lancez une recherche, puis sauvegardez-la.
                  </p>
                ) : (
                  <>
                    <select
                      className="planner-saved-select"
                      value={selectedSavedSearchId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedSavedSearchId(id);
                        const saved = savedSearches.find((item) => item.id === id);
                        if (!saved) return;
                        void applySavedPlannerSearch(saved);
                      }}
                    >
                      <option value="">Choisir une recherche…</option>
                      {savedSearches.map((saved) => (
                        <option key={saved.id} value={saved.id}>
                          {saved.name}{saved.isPublic ? " · public" : " · privé"}
                        </option>
                      ))}
                    </select>
                    {selectedSavedSearchId && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          className="planner-btn-secondary"
                          onClick={() => {
                            const saved = savedSearches.find((item) => item.id === selectedSavedSearchId);
                            if (!saved) return;
                            updateSavedSearchVisibilityMutation.mutate({ id: saved.id, isPublic: !saved.isPublic });
                          }}
                          disabled={updateSavedSearchVisibilityMutation.isPending}
                        >
                          <IcoGlobe />
                          {savedSearches.find((item) => item.id === selectedSavedSearchId)?.isPublic ? "Privatiser" : "Rendre public"}
                        </button>
                        <button
                          className="planner-btn-secondary"
                          style={{ color: "oklch(0.45 0.15 25)" }}
                          onClick={() => deleteSavedSearchMutation.mutate(selectedSavedSearchId)}
                          disabled={deleteSavedSearchMutation.isPending}
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Départ */}
            <div className="planner-panel">
              <div className="planner-panel-head">
                <div className="planner-panel-head-l">
                  <IcoMapPin />
                  <span className="planner-panel-title">Aérodrome de départ</span>
                </div>
              </div>
              <div className="planner-panel-body">
                {user.homeAerodrome && !departureAerodrome && (
                  <button
                    className="planner-home-shortcut"
                    onClick={() => { if (homeAerodromeRes?.data) handleSelectDeparture(homeAerodromeRes.data); }}
                    disabled={!homeAerodromeRes?.data}
                  >
                    Ma base :{" "}
                    <strong>{user.homeAerodrome.icaoCode ?? user.homeAerodrome.name}</strong>
                  </button>
                )}

                <div ref={searchRef} style={{ position: "relative" }}>
                  <div className="planner-input-wrap">
                    <span className="ico-abs"><IcoSearch /></span>
                    <input
                      className="planner-input"
                      autoCapitalize="none" autoComplete="off" autoCorrect="off"
                      name="planner-departure-search" placeholder="Nom ou code ICAO…"
                      spellCheck={false} value={departureSearch}
                      onChange={(e) => { setDepartureSearch(e.target.value); setDepartureAerodrome(null); setShowSuggestions(true); }}
                      onFocus={() => { if (departureSearch.length >= 2) setShowSuggestions(true); }}
                    />
                    {departureAerodrome && (
                      <button className="planner-input-clear" onClick={handleClearDeparture}>
                        <IcoX />
                      </button>
                    )}
                  </div>

                  {showSuggestions && suggestions.length > 0 && !departureAerodrome && (
                    <div className="planner-suggestions">
                      {suggestions.map((ad) => (
                        <button
                          key={ad.id}
                          className="planner-suggestion-item"
                          onMouseDown={() => handleSelectDeparture(ad)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                            <span style={{ fontWeight: 600 }}>{ad.name}</span>
                            {ad.icaoCode && <span className="planner-badge-oaci">{ad.icaoCode}</span>}
                          </div>
                          {ad.city && <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 2 }}>{ad.city}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {departureAerodrome && (
                  <div className="planner-dep-selected">
                    <div className="planner-dep-name">
                      <strong>{departureAerodrome.name}</strong>
                      {departureAerodrome.icaoCode && (
                        <span className="planner-badge-oaci">{departureAerodrome.icaoCode}</span>
                      )}
                    </div>
                    <span className="planner-dep-meta">
                      {departureAerodrome.city ?? ""}
                      {departureAerodrome.elevation != null ? ` · ${departureAerodrome.elevation} ft` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Aéronef */}
            <div className="planner-panel">
              <div className="planner-panel-head">
                <div className="planner-panel-head-l">
                  <IcoPlane />
                  <span className="planner-panel-title">Aéronef</span>
                </div>
                <button className="planner-panel-link" onClick={() => setShowProfileForm((v) => !v)}>
                  <IcoPlus />
                  Nouveau
                </button>
              </div>
              <div className="planner-panel-body">
                {showProfileForm && (
                  <form onSubmit={handleCreateProfile} autoComplete="off" className="planner-form">
                    <input
                      className="planner-input no-ico"
                      autoComplete="off" name="planner-aircraft-name"
                      placeholder="Nom (ex. C172 F-GABCD)"
                      value={profileForm.name}
                      onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                      required
                    />
                    <div className="planner-field-row">
                      <div>
                        <div className="planner-field-label">Vitesse TAS (kt)</div>
                        <div className="planner-field-suffix">
                          <input className="planner-input no-ico" type="number" autoComplete="off" name="planner-aircraft-tas" placeholder="100" value={profileForm.tas} onChange={(e) => setProfileForm((f) => ({ ...f, tas: e.target.value }))} required />
                          <span className="suffix">kt</span>
                        </div>
                      </div>
                      <div>
                        <div className="planner-field-label">Conso. (L/h)</div>
                        <div className="planner-field-suffix">
                          <input className="planner-input no-ico" type="number" autoComplete="off" name="planner-aircraft-fuel" placeholder="28" value={profileForm.fuelConsumption} onChange={(e) => setProfileForm((f) => ({ ...f, fuelConsumption: e.target.value }))} required />
                          <span className="suffix">L/h</span>
                        </div>
                      </div>
                      <div>
                        <div className="planner-field-label">Coût horaire</div>
                        <div className="planner-field-suffix">
                          <input className="planner-input no-ico" type="number" autoComplete="off" name="planner-aircraft-cost" placeholder="120" value={profileForm.hourlyCost} onChange={(e) => setProfileForm((f) => ({ ...f, hourlyCost: e.target.value }))} required />
                          <span className="suffix">€/h</span>
                        </div>
                      </div>
                      <div>
                        <div className="planner-field-label">Autonomie</div>
                        <div className="planner-field-suffix">
                          <input className="planner-input no-ico" type="number" autoComplete="off" name="planner-aircraft-range" placeholder="400" value={profileForm.fuelRange} onChange={(e) => setProfileForm((f) => ({ ...f, fuelRange: e.target.value }))} required />
                          <span className="suffix">NM</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="planner-field-label">Piste min. (m)</div>
                      <input className="planner-input no-ico" type="number" autoComplete="off" name="planner-aircraft-runway" placeholder="0" value={profileForm.minRunwayLength} onChange={(e) => setProfileForm((f) => ({ ...f, minRunwayLength: e.target.value }))} />
                    </div>
                    <div>
                      <div className="planner-field-label">Carburant</div>
                      <select className="planner-input no-ico" name="planner-aircraft-fueltype" value={profileForm.fuelType} onChange={(e) => setProfileForm((f) => ({ ...f, fuelType: e.target.value }))}>
                        {AIRCRAFT_FUELS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="planner-field-label">Catégorie (taxes)</div>
                      <select className="planner-input no-ico" name="planner-aircraft-category" value={profileForm.category} onChange={(e) => setProfileForm((f) => ({ ...f, category: e.target.value }))}>
                        {AIRCRAFT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="planner-field-label">Vent de travers max.</div>
                      <div className="planner-field-suffix">
                        <input className="planner-input no-ico" type="number" min={0} max={60} autoComplete="off" name="planner-aircraft-crosswind" placeholder="Non renseigné" value={profileForm.maxCrosswindKt} onChange={(e) => setProfileForm((f) => ({ ...f, maxCrosswindKt: e.target.value }))} />
                        <span className="suffix">kt</span>
                      </div>
                    </div>
                    <div>
                      <div className="planner-field-label">Revêtements acceptés</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {["ASPHALT", "CONCRETE", "GRASS", "GRAVEL", "DIRT"].map((s) => (
                          <button
                            key={s} type="button"
                            className={cn("planner-surface-btn", profileForm.allowedSurfaces.includes(s) && "active")}
                            onClick={() => toggleSurface(s)}
                          >
                            {SURFACE_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="submit" className="planner-btn-primary" style={{ height: 36, fontSize: 13 }} disabled={createProfileMutation.isPending}>
                        Enregistrer
                      </button>
                      <button type="button" className="planner-btn-ghost" onClick={() => setShowProfileForm(false)}>
                        Annuler
                      </button>
                    </div>
                  </form>
                )}

                {profiles.length === 0 && !showProfileForm ? (
                  <p style={{ fontSize: 13, color: "var(--ink-500)", textAlign: "center", padding: "12px 0" }}>
                    Créez un profil pour commencer.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {profiles.map((p) => (
                      <div
                        key={p.id}
                        className={cn("planner-ac-item", selectedProfileId === p.id && "active")}
                        onClick={() => setSelectedProfileId(p.id)}
                      >
                        <div className="planner-ac-badge"><IcoPlane /></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="planner-ac-name">
                            {p.name}
                            {selectedProfileId === p.id && <IcoCheck />}
                          </div>
                          <div className="planner-ac-specs">
                            {p.tas} kt · {p.fuelConsumption} L/h · {p.fuelRange} NM{p.fuelType ? ` · ${FUEL_SHORT_LABELS[p.fuelType] ?? p.fuelType}` : ""}
                          </div>
                          {selectedProfileId === p.id && (
                            <select
                              className="planner-input no-ico"
                              style={{ marginTop: 6, height: 30, fontSize: 12 }}
                              value={p.fuelType ?? ""}
                              aria-label="Carburant de l'avion"
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateProfileMutation.mutate({ id: p.id, fuelType: e.target.value || null })}
                            >
                              {AIRCRAFT_FUELS.map((f) => (
                                <option key={f.value} value={f.value}>{f.value ? `Carburant : ${f.label}` : "Carburant : non renseigné"}</option>
                              ))}
                            </select>
                          )}
                          {selectedProfileId === p.id && (
                            <select
                              className="planner-input no-ico"
                              style={{ marginTop: 6, height: 30, fontSize: 12 }}
                              value={p.category ?? ""}
                              aria-label="Catégorie pour les taxes"
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateProfileMutation.mutate({ id: p.id, category: e.target.value || null })}
                            >
                              {AIRCRAFT_CATEGORIES.map((c) => (
                                <option key={c.value} value={c.value}>{`Taxes : ${c.value ? c.label : "catégorie non renseignée"}`}</option>
                              ))}
                            </select>
                          )}
                          {selectedProfileId === p.id && (
                            <select
                              className="planner-input no-ico"
                              style={{ marginTop: 6, height: 30, fontSize: 12 }}
                              value={p.maxCrosswindKt ?? ""}
                              aria-label="Vent de travers maximal"
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateProfileMutation.mutate({ id: p.id, maxCrosswindKt: e.target.value === "" ? null : Number(e.target.value) })}
                            >
                              <option value="">Vent de travers max. : non renseigné</option>
                              {[8, 10, 12, 15, 17, 20, 25].map((kt) => (
                                <option key={kt} value={kt}>{`Vent de travers max. : ${kt} kt`}</option>
                              ))}
                              {p.maxCrosswindKt != null && ![8, 10, 12, 15, 17, 20, 25].includes(p.maxCrosswindKt) && (
                                <option value={p.maxCrosswindKt}>{`Vent de travers max. : ${p.maxCrosswindKt} kt`}</option>
                              )}
                            </select>
                          )}
                        </div>
                        <button
                          className="planner-ac-del"
                          onClick={(e) => { e.stopPropagation(); deleteProfileMutation.mutate(p.id); }}
                        >
                          <IcoTrash />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Contrainte */}
            <div className="planner-panel">
              <div className="planner-panel-head">
                <div className="planner-panel-head-l">
                  <IcoClock />
                  <span className="planner-panel-title">Contrainte</span>
                </div>
              </div>
              <div className="planner-panel-body">
                <div className="planner-seg">
                  {(["time", "cost", "unlimited"] as SearchMode[]).map((mode) => (
                    <button
                      key={mode}
                      className={cn(searchMode === mode && "active")}
                      onClick={() => setSearchMode(mode)}
                    >
                      {mode === "time" ? "Durée" : mode === "cost" ? "Budget" : "Illimité"}
                    </button>
                  ))}
                </div>

                {searchMode === "time" && (
                  <>
                    <div>
                      <div className="planner-field-label">Durée souhaitée</div>
                      <div className="planner-seg small">
                        {TIME_PRESETS.map((min) => {
                          const label = min < 60 ? `${min}min` : min === 60 ? "1h" : `${Math.floor(min / 60)}h${min % 60 > 0 ? min % 60 : ""}`;
                          return (
                            <button
                              key={min}
                              className={cn(maxTimeMinutes === min && "active")}
                              onClick={() => setMaxTimeMinutes(min)}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="planner-field-row">
                      <div>
                        <div className="planner-field-label">Min (min, optionnel)</div>
                        <div className="planner-field-suffix">
                          <input className="planner-input no-ico" type="number" autoComplete="off" name="planner-min-time" min={0} max={480} placeholder="—" value={minTimeMinutes} onChange={(e) => setMinTimeMinutes(e.target.value)} />
                          <span className="suffix">min</span>
                        </div>
                      </div>
                      <div>
                        <div className="planner-field-label">Max (min)</div>
                        <div className="planner-field-suffix">
                          <input className="planner-input no-ico" type="number" autoComplete="off" name="planner-max-time" min={10} max={480} value={maxTimeMinutes} onChange={(e) => setMaxTimeMinutes(parseInt(e.target.value) || 60)} />
                          <span className="suffix">min</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {searchMode === "cost" && (
                  <div className="planner-field-row">
                    <div>
                      <div className="planner-field-label">Min € (optionnel)</div>
                      <div className="planner-field-suffix">
                        <input className="planner-input no-ico" type="number" autoComplete="off" name="planner-min-cost" min={0} placeholder="—" value={minCost} onChange={(e) => setMinCost(e.target.value)} />
                        <span className="suffix">€</span>
                      </div>
                    </div>
                    <div>
                      <div className="planner-field-label">Max €</div>
                      <div className="planner-field-suffix">
                        <input className="planner-input no-ico" type="number" autoComplete="off" name="planner-max-cost" min={10} value={maxCost} onChange={(e) => setMaxCost(parseInt(e.target.value) || 100)} />
                        <span className="suffix">€</span>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <div className="planner-field-label">Trajet</div>
                  <div className="planner-seg">
                    {(["outbound", "round_trip"] as TripScope[]).map((scope) => (
                      <button
                        key={scope}
                        className={cn(tripScope === scope && "active")}
                        onClick={() => setTripScope(scope)}
                      >
                        {scope === "outbound" ? "Aller simple" : "Aller-Retour"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Options (collapsible) */}
            <div className={cn("planner-panel", !showOptions && "")}>
              <button
                style={{ width: "100%", background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }}
                onClick={() => setShowOptions((v) => !v)}
              >
                <div className={cn("planner-panel-head", !showOptions && "collapsed-head")}>
                  <div className="planner-panel-head-l">
                    <IcoSettings />
                    <span className="planner-panel-title">Options</span>
                  </div>
                  <svg
                    style={{ width: 16, height: 16, color: "var(--ink-500)", transition: "transform .2s", transform: showOptions ? "none" : "rotate(-90deg)" }}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </div>
              </button>
              {showOptions && (
                <div className="planner-panel-body">
                  <div className="planner-field-row">
                    <div>
                      <div className="planner-field-label">Heure de départ (bloc)</div>
                      <input className="planner-input no-ico" type="datetime-local" name="planner-departure-time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} />
                    </div>
                    {tripScope === "round_trip" && (
                      <div>
                        <div className="planner-field-label">Temps sur place</div>
                        <div className="planner-field-suffix">
                          <input className="planner-input no-ico" type="number" autoComplete="off" name="planner-stay" min={0} max={1440} value={stayMinutes} onChange={(e) => setStayMinutes(e.target.value)} />
                          <span className="suffix">min</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {departureTime && (
                    <label className="planner-check">
                      <input type="checkbox" checked={excludeNight} onChange={() => setExcludeNight((v) => !v)} />
                      <span className="planner-check-box"></span>
                      <span>Exclure les vols qui touchent la nuit aéronautique</span>
                    </label>
                  )}
                  <div className="planner-field-row">
                    <div>
                      <div className="planner-field-label">Réserve (min)</div>
                      <div className="planner-field-suffix">
                        <input className="planner-input no-ico" type="number" autoComplete="off" name="planner-reserve" min={0} max={120} value={reserveMinutes} onChange={(e) => setReserveMinutes(parseInt(e.target.value) || 30)} />
                        <span className="suffix">min</span>
                      </div>
                    </div>
                    <div>
                      <div className="planner-field-label">Distance mini</div>
                      <div className="planner-field-suffix">
                        <input className="planner-input no-ico" type="number" autoComplete="off" name="planner-min-dist" min={0} max={1000} step="1" value={minDistanceKm} onChange={(e) => setMinDistanceKm(e.target.value)} />
                        <span className="suffix">km</span>
                      </div>
                    </div>
                    <div>
                      <div className="planner-field-label">Prix carburant</div>
                      <div className="planner-field-suffix">
                        <input className="planner-input no-ico" type="number" autoComplete="off" name="planner-fuel-price" step="0.01" min={0} max={10} placeholder="0.00" value={fuelPricePerLiter} onChange={(e) => setFuelPricePerLiter(e.target.value)} />
                        <span className="suffix">€/L</span>
                      </div>
                    </div>
                    <div>
                      <div className="planner-field-label">Procédure départ</div>
                      <div className="planner-field-suffix">
                        <input className="planner-input no-ico" type="number" autoComplete="off" name="planner-dep-ground" min={0} max={60} value={departureGroundMinutes} onChange={(e) => setDepartureGroundMinutes(e.target.value)} />
                        <span className="suffix">min</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="planner-field-label">Procédure arrivée</div>
                    <div className="planner-field-suffix">
                      <input className="planner-input no-ico" type="number" autoComplete="off" name="planner-arr-ground" min={0} max={60} value={arrivalGroundMinutes} onChange={(e) => setArrivalGroundMinutes(e.target.value)} />
                      <span className="suffix">min</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Filtres destination */}
            <div className="planner-panel">
              <div className="planner-panel-head">
                <div className="planner-panel-head-l">
                  <IcoFilter />
                  <span className="planner-panel-title">
                    Filtres destination
                    {activeFilterCount > 0 && (
                      <span style={{
                        marginLeft: 8, display: "inline-grid", placeItems: "center",
                        minWidth: 18, height: 18, padding: "0 5px",
                        background: "var(--horizon-700)", color: "white",
                        borderRadius: 999, fontSize: 10, fontWeight: 700,
                      }}>
                        {activeFilterCount}
                      </span>
                    )}
                  </span>
                </div>
                <button className="planner-panel-link" onClick={() => setFilters(NO_FILTERS)}>
                  Réinitialiser
                </button>
              </div>
              <div className="planner-panel-body">
                <div>
                  <div className="planner-eyebrow" style={{ marginBottom: 8 }}>Commodités</div>
                  <div className="planner-pill-group">
                    <button className={cn("planner-pill", filters.hasRestaurant && "active")} onClick={() => toggleFilter("hasRestaurant")}>
                      <RestaurantIcon />Restaurant
                    </button>
                    <button className={cn("planner-pill", filters.hasAccommodation && "active")} onClick={() => toggleFilter("hasAccommodation")}>
                      <HomeIcon />Hébergement
                    </button>
                    <button className={cn("planner-pill", filters.hasTransport && "active")} onClick={() => toggleFilter("hasTransport")}>
                      <BusIcon />Transport
                    </button>
                    <button className={cn("planner-pill", filters.hasBikes && "active")} onClick={() => toggleFilter("hasBikes")}>
                      <BikeIcon />Vélo
                    </button>
                  </div>
                </div>
                <div>
                  <div className="planner-eyebrow" style={{ marginBottom: 8 }}>Carburant</div>
                  <div className="planner-pill-group">
                    <button className={cn("planner-pill", filters.fuel100LL && "active")} onClick={() => toggleFilter("fuel100LL")}>100LL</button>
                    <button className={cn("planner-pill", filters.fuelUL91 && "active")} onClick={() => toggleFilter("fuelUL91")}>UL91</button>
                    <button className={cn("planner-pill", filters.fuelSP98 && "active")} onClick={() => toggleFilter("fuelSP98")}>SP98</button>
                    <button className={cn("planner-pill", filters.fuelJetA1 && "active")} onClick={() => toggleFilter("fuelJetA1")}>Jet A1</button>
                  </div>
                </div>
                <div>
                  <div className="planner-eyebrow" style={{ marginBottom: 8 }}>Sur le terrain</div>
                  <div className="planner-pill-group">
                    <button className={cn("planner-pill", filters.pavedRunway && "active")} onClick={() => toggleFilter("pavedRunway")} title="Asphalte ou béton, assez longue pour l'avion">Piste en dur</button>
                    <button className={cn("planner-pill", filters.hasHangar && "active")} onClick={() => toggleFilter("hasHangar")} title="Hangars signalés par openAIP, ou place signalée par un membre">Hangar</button>
                    <button className={cn("planner-pill", filters.hasWebcam && "active")} onClick={() => toggleFilter("hasWebcam")}>Webcam</button>
                  </div>
                </div>
                <label className="planner-check">
                  <input type="checkbox" checked={filters.excludeVisited} onChange={() => toggleFilter("excludeVisited")} />
                  <span className="planner-check-box"></span>
                  <span>Exclure les terrains déjà visités</span>
                </label>
                <label className="planner-check">
                  <input type="checkbox" checked={filters.includePrivate} onChange={() => toggleFilter("includePrivate")} />
                  <span className="planner-check-box"></span>
                  <span>Inclure les terrains privés (accord du propriétaire requis)</span>
                </label>
              </div>
            </div>

            {/* Trier par */}
            <div className="planner-panel">
              <div className="planner-panel-head">
                <div className="planner-panel-head-l">
                  <IcoSort />
                  <span className="planner-panel-title">Trier par</span>
                </div>
              </div>
              <div className="planner-panel-body">
                <div className="planner-pill-group">
                  {SORT_OPTIONS.map((opt) => {
                    const isActive = sortBy === opt.value;
                    return (
                      <button
                        key={opt.value}
                        className={cn("planner-pill", isActive && "active")}
                        onClick={() => {
                          if (isActive) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
                          else { setSortBy(opt.value); setSortOrder("asc"); }
                        }}
                      >
                        {opt.label}
                        {isActive && (sortOrder === "asc" ? " ↑" : " ↓")}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Submit */}
            <div style={{ paddingTop: 4 }}>
              <button
                className="planner-btn-primary"
                onClick={() => { void handleCalculate(); setSidebarOpen(false); }}
                disabled={!selectedProfileId || !departureAerodrome || isCalculating}
              >
                <IcoNavIco />
                {isCalculating ? "Calcul en cours…" : "Trouver les destinations"}
              </button>
            </div>

            {/* Save current search */}
            {user && (
              <button className="planner-btn-secondary" style={{ width: "100%" }} onClick={handleSaveCurrentPlannerSearch} disabled={savePlannerSearchMutation.isPending}>
                <IcoSave />
                Sauvegarder cette recherche
              </button>
            )}
          </aside>

          {/* ─── RESULTS ─── */}
          <section>
            {/* Results header */}
            {sortedResults !== null && (
              <div className="planner-results-head">
                <div className="planner-results-count">
                  <strong>{sortedResults.length} destination{sortedResults.length !== 1 ? "s" : ""}</strong>
                  {selectedProfile && (
                    <>
                      {" · "}<span style={{ fontFamily: "var(--f-mono)", color: "var(--horizon-700)", fontWeight: 600 }}>{selectedProfile.name}</span>
                      {" · "}{tripScope === "round_trip" ? "Aller-Retour" : "Aller simple"}
                      {searchMode === "time" && ` · ≤ ${formatFlightTime(maxTimeMinutes / 60)}`}
                      {searchMode === "cost" && ` · ≤ ${maxCost} €`}
                    </>
                  )}
                </div>
                <div className="planner-results-tools">
                  <button className="planner-btn-secondary" onClick={handleExportCsv}><IcoDownload />CSV</button>
                  <div className="planner-view-toggle">
                    <button className={cn("planner-view-btn", viewMode === "list" && "active")} onClick={() => setViewMode("list")}>
                      <svg style={{width:14,height:14,flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></svg>
                      Liste
                    </button>
                    <button className={cn("planner-view-btn", viewMode === "map" && "active")} onClick={() => setViewMode("map")}>
                      <svg style={{width:14,height:14,flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6 9 4l6 2 5-2v14l-5 2-6-2-5 2V6Z"/><path d="M9 4v16"/><path d="M15 6v16"/></svg>
                      Carte
                    </button>
                  </div>
                </div>
              </div>
            )}

            {calcError && (
              <div className="planner-error">{calcError}</div>
            )}

            {sortedResults !== null && sortedResults.length > 0 && (
              <div className="planner-warning">
                <IcoInfo />
                <span>Estimations fournies à titre indicatif. Consultez toujours l'AIP et les NOTAM avant le vol.</span>
              </div>
            )}

            {/* Map view */}
            {viewMode === "map" && sortedResults !== null && (
              <PlannerMap departure={departureAerodrome} results={sortedResults} ranges={mapRanges} />
            )}

            {/* List view */}
            {viewMode === "list" && (
              <>
                {sortedResults === null ? (
                  <div className="planner-empty">
                    <div style={{
                      width: 48, height: 48, borderRadius: 10,
                      background: "var(--paper-100)", color: "var(--ink-400)",
                      display: "grid", placeItems: "center", margin: "0 auto 16px",
                    }}>
                      <IcoNav />
                    </div>
                    <p style={{ fontSize: 14, color: "var(--ink-700)", margin: 0 }}>
                      Remplissez le formulaire ci-dessus puis lancez la recherche pour voir les destinations.
                    </p>
                  </div>
                ) : sortedResults.length === 0 ? (
                  <div className="planner-empty">
                    <div style={{
                      width: 48, height: 48, borderRadius: 10,
                      background: "var(--paper-100)", color: "var(--ink-400)",
                      display: "grid", placeItems: "center", margin: "0 auto 16px",
                    }}>
                      <IcoPlane />
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-950)", margin: "0 0 6px" }}>
                      Aucune destination trouvée
                    </p>
                    <p style={{ fontSize: 13, color: "var(--ink-500)", margin: 0 }}>
                      Augmentez la durée ou le budget, ou retirez certains filtres.
                    </p>
                  </div>
                ) : (
                  <div>
                    {regionGroups.map(([region, items]) => {
                      const isCollapsed = collapsedRegions.has(region);
                      return (
                        <div key={region} className={cn("planner-region", isCollapsed && "collapsed")}>
                          <button
                            style={{ width: "100%", background: "none", border: 0, padding: 0, cursor: "pointer" }}
                            onClick={() => toggleRegion(region)}
                          >
                            <div className="planner-region-head">
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <svg
                                  className="planner-region-chevron"
                                  style={{ width: 16, height: 16 }}
                                  viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                                >
                                  <path d="m6 9 6 6 6-6"/>
                                </svg>
                                <span>{region}</span>
                              </div>
                              <span className="planner-region-count">{items.length}</span>
                            </div>
                          </button>
                          {!isCollapsed && (
                            <div>
                              {items.map((r) => (
                                <ResultRow key={r.aerodrome.id} result={r} tripScope={tripScope} briefingHref={briefingHref} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
