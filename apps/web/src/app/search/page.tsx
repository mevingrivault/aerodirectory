"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import {
  Search,
  Fuel,
  Utensils,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Home as HomeIcon,
  Bike,
  Bus,
  Save,
  Bookmark,
  Lock,
  Umbrella,
  Moon,
  Globe,
  GlobeLock,
  X,
  Check,
} from "lucide-react";
import { AerodromeTypeIcon } from "@/components/ui/aerodrome-type-icon";
import type { SavedSearchItem } from "@aerodirectory/shared";

interface AerodromeResult {
  id: string;
  name: string;
  icaoCode: string | null;
  city: string | null;
  region: string | null;
  status: string;
  aerodromeType: string;
  hasRestaurant: boolean;
  hasTransport: boolean;
  hasBikes: boolean;
  hasAccommodation: boolean;
  nightOperations: boolean;
  latitude: number;
  longitude: number;
  elevation: number | null;
  runways: { identifier: string; length: number; surface: string }[];
  fuels: { type: string; available: boolean }[];
  _count: { visits: number; comments: number };
  distanceKm?: number;
}

const TYPE_LABELS: Record<string, string> = {
  SMALL_AIRPORT: "Aérodrome",
  INTERNATIONAL_AIRPORT: "International",
  GLIDER_SITE: "Vol à voile",
  ULTRALIGHT_FIELD: "Base ULM",
  HELIPORT: "Hélistation",
  ALTIPORT: "Altiport",
  MILITARY: "Militaire",
  SEAPLANE_BASE: "Hydrobase",
  OTHER: "Autre",
};

const TYPE_TONE: Record<string, string> = {
  SMALL_AIRPORT: "bg-[var(--horizon-100)] text-[var(--horizon-700)]",
  INTERNATIONAL_AIRPORT: "bg-[var(--horizon-100)] text-[var(--horizon-900)]",
  ULTRALIGHT_FIELD: "bg-[var(--terrain-100)] text-[var(--terrain-700)]",
  GLIDER_SITE: "bg-[oklch(0.94_0.04_220)] text-[oklch(0.40_0.12_220)]",
  ALTIPORT: "bg-[oklch(0.94_0.04_220)] text-[oklch(0.40_0.12_220)]",
  HELIPORT: "bg-[oklch(0.94_0.05_25)] text-[oklch(0.45_0.14_25)]",
  SEAPLANE_BASE: "bg-[oklch(0.93_0.05_200)] text-[oklch(0.40_0.12_200)]",
  MILITARY: "bg-[var(--ink-100)] text-[var(--ink-800)]",
  OTHER: "bg-[var(--ink-100)] text-[var(--ink-800)]",
};

const FUEL_LABELS: Record<string, string> = {
  AVGAS_100LL: "AVGAS 100LL",
  SP98: "SP98",
  UL91: "UL91",
  JET_A1: "Jet A-1",
};

interface TypeFilterDef {
  key: string;
  label: string;
  value?: string;
}

const TYPE_FILTERS: TypeFilterDef[] = [
  { key: "all", label: "Tous" },
  { key: "SMALL_AIRPORT", label: "Aérodromes", value: "SMALL_AIRPORT" },
  { key: "ALTIPORT", label: "Altiports", value: "ALTIPORT" },
  { key: "ULTRALIGHT_FIELD", label: "Bases ULM", value: "ULTRALIGHT_FIELD" },
  { key: "HELIPORT", label: "Hélistations", value: "HELIPORT" },
  { key: "SEAPLANE_BASE", label: "Hydrobases", value: "SEAPLANE_BASE" },
  { key: "INTERNATIONAL_AIRPORT", label: "International", value: "INTERNATIONAL_AIRPORT" },
];

export default function SearchPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [useLocation, setUseLocation] = useState(false);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [selectedSavedSearchId, setSelectedSavedSearchId] = useState("");
  const [sortBy, setSortBy] = useState<string>("name");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savePublic, setSavePublic] = useState(false);

  const searchParams: Record<string, string> = {
    page: page.toString(),
    limit: "20",
    ...filters,
  };
  if (query) searchParams["q"] = query;
  if (useLocation && userLat !== null && userLng !== null) {
    searchParams["lat"] = userLat.toString();
    searchParams["lng"] = userLng.toString();
    searchParams["radiusKm"] = "200";
    searchParams["sortBy"] = "distance";
  } else if (sortBy && sortBy !== "name") {
    searchParams["sortBy"] = sortBy;
  }

  const { data, isLoading } = useQuery({
    queryKey: ["search", query, page, filters, useLocation, userLat, userLng, sortBy],
    queryFn: () => apiClient.get<AerodromeResult[]>("/search", searchParams),
  });

  const { data: savedSearchesRes } = useQuery({
    queryKey: ["saved-searches"],
    queryFn: () =>
      apiClient.get<SavedSearchItem[]>("/search/saved", { scope: "search" }),
    enabled: !!user,
  });

  const saveSearchMutation = useMutation({
    mutationFn: (payload: { name: string; params: Record<string, string>; isPublic: boolean }) =>
      apiClient.post("/search/saved", {
        name: payload.name,
        scope: "search",
        isPublic: payload.isPublic,
        params: payload.params,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-searches"] });
    },
  });

  const deleteSavedSearchMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/search/saved/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-searches"] });
      setSelectedSavedSearchId("");
    },
  });

  const updateSavedSearchVisibilityMutation = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) =>
      apiClient.put(`/search/saved/${id}`, { isPublic }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-searches"] });
    },
  });

  const results = data?.data ?? [];
  const meta = data?.meta;
  const savedSearches = savedSearchesRes?.data ?? [];

  useEffect(() => {
    const currentParams = new URLSearchParams(window.location.search);
    const nextQuery = currentParams.get("q") ?? "";
    const nextPage = Number(currentParams.get("page") ?? "1");
    const nextFilters: Record<string, string> = {};

    for (const [key, value] of currentParams.entries()) {
      if (["q", "page", "limit", "lat", "lng", "radiusKm", "sortBy"].includes(key)) continue;
      nextFilters[key] = value;
    }

    setQuery(nextQuery);
    setFilters(nextFilters);
    setPage(Number.isFinite(nextPage) && nextPage > 0 ? nextPage : 1);

    const lat = currentParams.get("lat");
    const lng = currentParams.get("lng");
    if (lat && lng) {
      setUserLat(Number(lat));
      setUserLng(Number(lng));
      setUseLocation(true);
    }
    const sb = currentParams.get("sortBy");
    if (sb) setSortBy(sb);
  }, []);

  const handleNearby = () => {
    if (useLocation) {
      setUseLocation(false);
      setUserLat(null);
      setUserLng(null);
      return;
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
          setUseLocation(true);
          setPage(1);
        },
        () => {
          alert("Impossible d'obtenir votre position. Activez la géolocalisation.");
        },
      );
    }
  };

  const toggleFilter = (key: string, value: string) => {
    setFilters((f) => {
      const next = { ...f };
      if (next[key] === value) delete next[key];
      else next[key] = value;
      return next;
    });
    setPage(1);
  };

  const setTypeFilter = (def: TypeFilterDef) => {
    setFilters((f) => {
      const next = { ...f };
      if (!def.value) {
        delete next.aerodromeType;
      } else if (next.aerodromeType === def.value) {
        delete next.aerodromeType;
      } else {
        next.aerodromeType = def.value;
      }
      return next;
    });
    setPage(1);
  };

  const resetAll = () => {
    setFilters({});
    setQuery("");
    setUseLocation(false);
    setUserLat(null);
    setUserLng(null);
    setSortBy("name");
    setPage(1);
  };

  const applySavedSearch = (saved: SavedSearchItem) => {
    const params = saved.params ?? {};
    setQuery(params["q"] ?? "");

    const nextFilters: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (["q", "page", "limit", "lat", "lng", "radiusKm", "sortBy"].includes(k)) continue;
      nextFilters[k] = v;
    }
    setFilters(nextFilters);

    if (params["lat"] && params["lng"]) {
      setUserLat(Number(params["lat"]));
      setUserLng(Number(params["lng"]));
      setUseLocation(true);
    } else {
      setUseLocation(false);
      setUserLat(null);
      setUserLng(null);
    }
    setSortBy(params["sortBy"] ?? "name");
    setPage(1);
  };

  const handleSaveCurrentSearch = () => {
    setSaveName("");
    setSavePublic(false);
    setSaveDialogOpen(true);
  };

  const confirmSaveSearch = () => {
    const name = saveName.trim();
    if (!name) return;
    const params: Record<string, string> = { ...searchParams };
    if (!query) delete params["q"];
    saveSearchMutation.mutate(
      { name, params, isPublic: savePublic },
      { onSuccess: () => setSaveDialogOpen(false) },
    );
  };

  const activeTypeKey = filters.aerodromeType ?? "all";
  const activeFilterCount = Object.keys(filters).length + (useLocation ? 1 : 0);

  const activeCommodityFilters: { key: string; value: string; label: string }[] = useMemo(() => {
    const items: { key: string; value: string; label: string }[] = [];
    if (filters.hasRestaurant) items.push({ key: "hasRestaurant", value: "true", label: "Restaurant" });
    if (filters.hasAccommodation) items.push({ key: "hasAccommodation", value: "true", label: "Hébergement" });
    if (filters.hasTransport) items.push({ key: "hasTransport", value: "true", label: "Transport" });
    if (filters.hasBikes) items.push({ key: "hasBikes", value: "true", label: "Vélo" });
    if (filters.fuel) items.push({ key: "fuel", value: filters.fuel, label: FUEL_LABELS[filters.fuel] ?? filters.fuel });
    if (filters.nightOperations) items.push({ key: "nightOperations", value: "true", label: "Vol de nuit" });
    if (filters.ppr) items.push({ key: "ppr", value: "true", label: "PPR" });
    if (filters.skydiveActivity) items.push({ key: "skydiveActivity", value: "true", label: "Parachutage" });
    return items;
  }, [filters]);

  return (
    <div className="min-h-[70vh] bg-[var(--paper-50)] text-[var(--ink-950)]">
      <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        {/* Title */}
        <div className="mb-4 flex items-start justify-between gap-4 sm:mb-6">
          <div className="min-w-0">
            <h1 className="m-0 flex items-center gap-2.5 font-[var(--f-serif)] text-[22px] font-medium leading-[1.05] tracking-[-0.015em] sm:gap-3 sm:text-[32px] lg:text-[38px]">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--horizon-100)] text-[var(--horizon-700)] sm:h-10 sm:w-10">
                <Search className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.6} />
              </span>
              Recherche
            </h1>
            <p className="mt-1.5 hidden max-w-[560px] pl-12 text-[13px] text-[var(--ink-700)] sm:block sm:text-sm">
              Explore les terrains de France métropolitaine et d'outre-mer. Filtre par type, équipements et commodités.
            </p>
          </div>
          {user && (
            <button
              type="button"
              onClick={handleSaveCurrentSearch}
              disabled={saveSearchMutation.isPending}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-[var(--ink-300)] bg-white px-2.5 text-[13px] font-medium text-[var(--ink-950)] transition-colors hover:border-[var(--ink-400)] disabled:opacity-60 sm:h-10 sm:px-3"
              aria-label="Sauvegarder la recherche"
            >
              <Save className="h-4 w-4" strokeWidth={1.6} />
              <span className="hidden sm:inline">Sauvegarder</span>
            </button>
          )}
        </div>

        {/* Search bar + filters card */}
        <div className="mb-4 rounded-xl border border-[var(--ink-200)] bg-white p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--ink-500)]"
                strokeWidth={1.6}
              />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Nom du terrain, ville, code OACI…"
                className="h-12 w-full rounded-md border border-[var(--ink-200)] bg-[var(--paper-50)] px-12 text-[15px] text-[var(--ink-950)] placeholder:text-[var(--ink-500)] transition-all focus:border-[var(--horizon-700)] focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-[var(--horizon-100)]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setPage(1);
                  }}
                  aria-label="Effacer"
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border-0 bg-[var(--ink-100)] text-[var(--ink-700)] transition-colors hover:bg-[var(--ink-200)]"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleNearby}
              className={`inline-flex h-12 items-center justify-center gap-2 rounded-md px-4 text-[13px] font-medium transition-all sm:h-12 ${
                useLocation
                  ? "border border-[var(--horizon-700)] bg-[var(--horizon-100)] text-[var(--horizon-900)]"
                  : "border border-[var(--ink-950)] bg-[var(--ink-950)] text-white hover:bg-[oklch(0.10_0.02_250)]"
              }`}
            >
              <MapPin className="h-4 w-4" strokeWidth={1.6} />
              {useLocation ? "À proximité (actif)" : "À proximité"}
            </button>
          </div>

          {/* Mobile filters toggle */}
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="mt-3 flex w-full items-center justify-between rounded-md border border-[var(--ink-200)] bg-[var(--paper-50)] px-3 py-2 text-[13px] font-medium text-[var(--ink-950)] sm:hidden"
            aria-expanded={filtersOpen}
          >
            <span className="inline-flex items-center gap-2">
              <Search className="h-3.5 w-3.5" strokeWidth={1.8} />
              Filtres
              {activeFilterCount > 0 && (
                <span className="inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--ink-950)] px-1.5 text-[11px] font-semibold text-white">
                  {activeFilterCount}
                </span>
              )}
            </span>
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? "rotate-90" : ""}`}
              strokeWidth={1.8}
            />
          </button>

          {/* Filters wrapper — collapsible on mobile */}
          <div className={filtersOpen ? "block" : "hidden sm:block"}>

          {/* Type filters */}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="font-[var(--f-mono)] text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-500)] sm:mr-1">
              Type
            </span>
            <div className="-mx-3.5 flex gap-2 overflow-x-auto px-3.5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {TYPE_FILTERS.map((def) => {
              const active = activeTypeKey === def.key;
              return (
                <button
                  key={def.key}
                  type="button"
                  onClick={() => setTypeFilter(def)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-[7px] text-[13px] font-medium transition-all ${
                    active
                      ? "border-[var(--ink-950)] bg-[var(--ink-950)] text-white"
                      : "border-[var(--ink-300)] bg-white text-[var(--ink-700)] hover:border-[var(--ink-400)] hover:text-[var(--ink-950)]"
                  }`}
                >
                  {def.value && (
                    <AerodromeTypeIcon type={def.value} className="h-3.5 w-3.5" />
                  )}
                  {def.label}
                </button>
              );
            })}
            </div>
          </div>

          {/* Commodity filters */}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="font-[var(--f-mono)] text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-500)] sm:mr-1">
              Commodités
            </span>
            <div className="-mx-3.5 flex gap-2 overflow-x-auto px-3.5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {(
              [
                { key: "hasRestaurant", label: "Restaurant", icon: Utensils, val: "true" },
                { key: "hasAccommodation", label: "Hébergement", icon: HomeIcon, val: "true" },
                { key: "hasTransport", label: "Transport", icon: Bus, val: "true" },
                { key: "hasBikes", label: "Vélo / à pied", icon: Bike, val: "true" },
                { key: "fuel", label: "AVGAS", icon: Fuel, val: "AVGAS_100LL" },
                { key: "fuel", label: "SP98", icon: Fuel, val: "SP98" },
                { key: "nightOperations", label: "Vol de nuit", icon: Moon, val: "true" },
                { key: "ppr", label: "PPR", icon: Lock, val: "true" },
                { key: "skydiveActivity", label: "Parachutage", icon: Umbrella, val: "true" },
              ] as const
            ).map(({ key, label, icon: Icon, val }) => {
              const active = filters[key] === val;
              return (
                <button
                  key={`${key}-${val}`}
                  type="button"
                  onClick={() => toggleFilter(key, val)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-[7px] text-[13px] font-medium transition-all ${
                    active
                      ? "border-[var(--ink-950)] bg-[var(--ink-950)] text-white"
                      : "border-[var(--ink-300)] bg-white text-[var(--ink-700)] hover:border-[var(--ink-400)] hover:text-[var(--ink-950)]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
                  {label}
                </button>
              );
            })}
            </div>
          </div>

          {/* Options row */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {user && savedSearches.length > 0 && (
              <div className="inline-flex items-center gap-2">
                <Bookmark className="h-3.5 w-3.5 text-[var(--ink-500)]" strokeWidth={1.6} />
                <select
                  className="h-8 cursor-pointer rounded-[6px] border border-[var(--ink-300)] bg-white pl-2.5 pr-7 text-[13px] text-[var(--ink-950)] focus:outline-none focus:ring-2 focus:ring-[var(--horizon-100)]"
                  style={{
                    appearance: "none",
                    backgroundImage:
                      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2358636d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 8px center",
                  }}
                  value={selectedSavedSearchId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedSavedSearchId(id);
                    const saved = savedSearches.find((item) => item.id === id);
                    if (saved) applySavedSearch(saved);
                  }}
                >
                  <option value="">Recherches sauvegardées…</option>
                  {savedSearches.map((saved) => (
                    <option key={saved.id} value={saved.id}>
                      {saved.name}
                      {saved.isPublic ? " · public" : " · privé"}
                    </option>
                  ))}
                </select>
                {selectedSavedSearchId && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const saved = savedSearches.find((item) => item.id === selectedSavedSearchId);
                        if (!saved) return;
                        updateSavedSearchVisibilityMutation.mutate({
                          id: saved.id,
                          isPublic: !saved.isPublic,
                        });
                      }}
                      disabled={updateSavedSearchVisibilityMutation.isPending}
                      className="inline-flex h-8 items-center gap-1 rounded-[6px] border border-[var(--ink-300)] bg-white px-2 text-[12px] text-[var(--ink-700)] hover:border-[var(--ink-400)] disabled:opacity-60"
                    >
                      {savedSearches.find((item) => item.id === selectedSavedSearchId)?.isPublic ? (
                        <>
                          <GlobeLock className="h-3.5 w-3.5" strokeWidth={1.6} />
                          Privatiser
                        </>
                      ) : (
                        <>
                          <Globe className="h-3.5 w-3.5" strokeWidth={1.6} />
                          Public
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedSavedSearchId) return;
                        deleteSavedSearchMutation.mutate(selectedSavedSearchId);
                      }}
                      disabled={deleteSavedSearchMutation.isPending}
                      className="inline-flex h-8 items-center rounded-[6px] border border-[var(--ink-300)] bg-white px-2 text-[12px] text-[var(--ink-700)] hover:border-[var(--ink-400)] disabled:opacity-60"
                    >
                      Supprimer
                    </button>
                  </>
                )}
              </div>
            )}

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetAll}
                className="cursor-pointer rounded-[6px] border-0 bg-transparent px-1.5 py-1 text-[13px] text-[var(--ink-700)] underline underline-offset-[3px] hover:text-[var(--ink-950)]"
              >
                Réinitialiser
              </button>
            )}

            <span className="hidden flex-1 sm:block" />

            <span className="ml-auto font-[var(--f-mono)] text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-500)] sm:ml-0">
              Tri
            </span>
            <select
              value={useLocation ? "distance" : sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
              disabled={useLocation}
              className="h-8 cursor-pointer rounded-[6px] border border-[var(--ink-300)] bg-white pl-2.5 pr-7 text-[13px] text-[var(--ink-950)] focus:outline-none focus:ring-2 focus:ring-[var(--horizon-100)] disabled:opacity-60"
              style={{
                appearance: "none",
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2358636d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 8px center",
              }}
            >
              <option value="name">Nom A–Z</option>
              <option value="icaoCode">Code OACI</option>
              <option value="city">Ville</option>
              {useLocation && <option value="distance">Distance ↑</option>}
            </select>
          </div>
          </div>
        </div>

        {/* Results head */}
        <div className="mb-3.5 mt-6 flex items-baseline justify-between gap-3">
          <div className="text-sm text-[var(--ink-700)]">
            {isLoading ? (
              <span className="text-[var(--ink-500)]">Recherche en cours…</span>
            ) : meta ? (
              <>
                <strong className="font-semibold text-[var(--ink-950)]">{meta.total.toLocaleString("fr-FR")}</strong>{" "}
                aérodrome{meta.total !== 1 ? "s" : ""} trouvé{meta.total !== 1 ? "s" : ""}
                {activeCommodityFilters.length > 0 && (
                  <span className="text-[var(--ink-500)]">
                    {" "}
                    · filtre{activeCommodityFilters.length > 1 ? "s" : ""}{" "}
                    <em className="not-italic text-[var(--ink-700)]">
                      {activeCommodityFilters.map((f) => f.label).join(", ")}
                    </em>{" "}
                    actif{activeCommodityFilters.length > 1 ? "s" : ""}
                  </span>
                )}
              </>
            ) : (
              "Aucun résultat"
            )}
          </div>
        </div>

        {/* Results list */}
        {isLoading ? (
          <div className="rounded-xl border border-dashed border-[var(--ink-300)] bg-white py-16 text-center text-[var(--ink-500)]">
            Recherche en cours…
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--ink-300)] bg-white py-16 text-center text-[var(--ink-500)]">
            Aucun aérodrome trouvé. Modifiez vos critères de recherche.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {results.map((ad) => (
              <ResultCard key={ad.id} ad={ad} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="mt-7 flex flex-wrap items-center justify-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-[6px] border border-[var(--ink-200)] bg-white px-2.5 text-[13px] text-[var(--ink-700)] hover:border-[var(--ink-300)] hover:text-[var(--ink-950)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
              <span className="hidden sm:inline">Précédent</span>
            </button>
            <PaginationNumbers page={page} totalPages={meta.totalPages} onSelect={setPage} />
            <button
              type="button"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-[6px] border border-[var(--ink-200)] bg-white px-2.5 text-[13px] text-[var(--ink-700)] hover:border-[var(--ink-300)] hover:text-[var(--ink-950)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="hidden sm:inline">Suivant</span>
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>

      {/* Save search dialog */}
      {saveDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setSaveDialogOpen(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="m-0 font-[var(--f-serif)] text-[20px] font-medium text-[var(--ink-950)]">
              Sauvegarder la recherche
            </h2>
            <p className="mt-1 text-[13px] text-[var(--ink-700)]">
              Donnez un nom à cette recherche pour la retrouver facilement.
            </p>
            <label className="mt-4 block font-[var(--f-mono)] text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-500)]">
              Nom
            </label>
            <input
              type="text"
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmSaveSearch();
                if (e.key === "Escape") setSaveDialogOpen(false);
              }}
              placeholder="Ex. Aérodromes avec restaurant"
              className="mt-1.5 h-11 w-full rounded-md border border-[var(--ink-200)] bg-[var(--paper-50)] px-3 text-[14px] text-[var(--ink-950)] placeholder:text-[var(--ink-500)] focus:border-[var(--horizon-700)] focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-[var(--horizon-100)]"
            />
            <label className="mt-3 flex items-start gap-2.5 text-[13px] text-[var(--ink-700)]">
              <input
                type="checkbox"
                checked={savePublic}
                onChange={(e) => setSavePublic(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>Rendre publique sur mon profil (si les recherches publiques sont activées).</span>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSaveDialogOpen(false)}
                className="inline-flex h-10 items-center rounded-md border border-[var(--ink-300)] bg-white px-4 text-[13px] font-medium text-[var(--ink-950)] hover:border-[var(--ink-400)]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmSaveSearch}
                disabled={!saveName.trim() || saveSearchMutation.isPending}
                className="inline-flex h-10 items-center rounded-md border border-[var(--ink-950)] bg-[var(--ink-950)] px-4 text-[13px] font-medium text-white hover:bg-[oklch(0.10_0.02_250)] disabled:opacity-60"
              >
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PaginationNumbers({
  page,
  totalPages,
  onSelect,
}: {
  page: number;
  totalPages: number;
  onSelect: (p: number) => void;
}) {
  const pages: (number | "…")[] = [];
  const add = (p: number | "…") => pages.push(p);

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) add(i);
  } else {
    add(1);
    if (page > 3) add("…");
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) add(i);
    if (page < totalPages - 2) add("…");
    add(totalPages);
  }

  return (
    <>
      {pages.map((p, i) =>
        p === "…" ? (
          <span
            key={`gap-${i}`}
            className="inline-flex h-9 min-w-9 items-center justify-center px-2 font-[var(--f-mono)] text-[13px] text-[var(--ink-500)]"
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onSelect(p)}
            className={`inline-flex h-9 min-w-9 items-center justify-center rounded-[6px] border px-2.5 font-[var(--f-mono)] text-[13px] transition-colors ${
              p === page
                ? "border-[var(--ink-950)] bg-[var(--ink-950)] text-white"
                : "border-[var(--ink-200)] bg-white text-[var(--ink-700)] hover:border-[var(--ink-300)] hover:text-[var(--ink-950)]"
            }`}
          >
            {p}
          </button>
        ),
      )}
    </>
  );
}

function ResultCard({ ad }: { ad: AerodromeResult }) {
  const typeKey = (ad.aerodromeType in TYPE_TONE ? ad.aerodromeType : "OTHER") as keyof typeof TYPE_TONE;
  const tone = TYPE_TONE[typeKey];
  const typeLabel = TYPE_LABELS[ad.aerodromeType] ?? ad.aerodromeType;
  const visited = (ad._count?.visits ?? 0) > 0;

  const mainRunway = ad.runways?.[0];
  const surfaceLabel = mainRunway
    ? mainRunway.surface === "GRASS"
      ? "herbe"
      : mainRunway.surface === "ASPHALT" || mainRunway.surface === "CONCRETE"
        ? "revêtu"
        : mainRunway.surface.toLowerCase()
    : null;

  const availableFuels = ad.fuels?.filter((f) => f.available) ?? [];

  return (
    <Link
      href={`/aerodrome/${ad.id}`}
      className="group relative grid cursor-pointer items-center gap-4 rounded-xl border border-[var(--ink-200)] bg-white p-4 transition-all [grid-template-columns:48px_1fr] hover:-translate-y-px hover:border-[var(--ink-300)] hover:shadow-[0_1px_2px_rgba(20,30,50,.06)] sm:gap-[18px] sm:p-[18px_22px] sm:[grid-template-columns:64px_1fr_auto]"
    >
      <div
        className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-md sm:h-14 sm:w-14 ${tone}`}
      >
        <AerodromeTypeIcon type={ad.aerodromeType} className="h-6 w-6 sm:h-6 sm:w-6" />
        {visited && (
          <span
            className="absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-white bg-[var(--brass-500)]"
            aria-label="Visité"
          >
            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="font-[var(--f-serif)] text-[17px] font-semibold leading-tight tracking-[-0.01em] text-[var(--ink-950)] sm:text-[19px]">
            {ad.name}
          </span>
          {ad.icaoCode && (
            <span className="inline-flex h-[22px] items-center rounded border border-[var(--ink-300)] bg-[var(--paper-100)] px-2 font-[var(--f-mono)] text-[11px] font-semibold tracking-[0.08em] text-[var(--ink-950)]">
              {ad.icaoCode}
            </span>
          )}
          <span
            className={`inline-flex h-[22px] items-center rounded px-2 font-[var(--f-mono)] text-[10px] font-semibold uppercase tracking-[0.08em] ${tone}`}
          >
            {typeLabel}
          </span>
          {ad.status && ad.status !== "OPEN" && (
            <span className="inline-flex h-[22px] items-center rounded bg-[oklch(0.95_0.06_25)] px-2 font-[var(--f-mono)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[oklch(0.45_0.15_25)]">
              {ad.status === "CLOSED" ? "Fermé" : ad.status === "RESTRICTED" ? "Restreint" : ad.status === "SEASONAL" ? "Saisonnier" : ad.status}
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-[var(--ink-700)]">
          <span>{[ad.region, ad.city].filter(Boolean).join(" · ") || "—"}</span>
          {ad.elevation !== null && ad.elevation !== undefined && (
            <>
              <span className="text-[var(--ink-300)]">·</span>
              <span className="font-[var(--f-mono)] text-[12px] text-[var(--ink-500)]">
                {ad.elevation} ft
              </span>
            </>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 font-[var(--f-mono)] text-[11px] text-[var(--ink-500)]">
          {mainRunway && (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-px w-3 bg-[var(--ink-400)]" />
              {mainRunway.length} m · {surfaceLabel}
            </span>
          )}
          {ad.distanceKm !== undefined && (
            <span className="inline-flex items-center gap-1 text-[var(--horizon-700)]">
              <MapPin className="h-3 w-3" strokeWidth={1.8} />
              {ad.distanceKm.toFixed(0)} km
            </span>
          )}
          {(ad._count?.comments ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1">
              {ad._count.comments} avis
            </span>
          )}
        </div>

        {/* Mobile commodities (inline below info) */}
        <div className="mt-2 flex flex-wrap gap-1.5 sm:hidden">
          <CommodityPills ad={ad} fuels={availableFuels} />
        </div>
      </div>

      {/* Desktop commodities (right column) */}
      <div className="hidden flex-wrap items-center justify-end gap-1.5 sm:flex sm:max-w-[280px]">
        <CommodityPills ad={ad} fuels={availableFuels} />
      </div>
    </Link>
  );
}

function CommodityPills({
  ad,
  fuels,
}: {
  ad: AerodromeResult;
  fuels: { type: string; available: boolean }[];
}) {
  const items: React.ReactNode[] = [];

  if (ad.hasRestaurant) {
    items.push(
      <Pill key="resto" tone="resto" icon={Utensils} label="Restaurant" emphasis />,
    );
  }
  if (ad.hasAccommodation) {
    items.push(<Pill key="hotel" tone="hotel" icon={HomeIcon} label="Hébergement" />);
  }
  if (fuels.length > 0) {
    items.push(
      <Pill
        key="fuel"
        tone="fuel"
        icon={Fuel}
        label={fuels.map((f) => FUEL_LABELS[f.type] ?? f.type).join(" · ")}
      />,
    );
  }
  if (ad.hasTransport) {
    items.push(<Pill key="transport" tone="transport" icon={Bus} label="Transport" />);
  }
  if (ad.hasBikes) {
    items.push(<Pill key="bike" tone="bike" icon={Bike} label="Vélo" />);
  }

  if (items.length === 0) {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-[var(--ink-300)] px-2.5 text-[12px] text-[var(--ink-500)]">
        <span className="font-[var(--f-mono)] text-[var(--ink-400)]">—</span>
        Aucune commodité
      </span>
    );
  }

  return <>{items}</>;
}

function Pill({
  tone,
  icon: Icon,
  label,
  emphasis,
}: {
  tone: "resto" | "hotel" | "fuel" | "transport" | "bike";
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  emphasis?: boolean;
}) {
  const toneClass = {
    resto:
      "bg-[oklch(0.96_0.04_25)] border-[oklch(0.88_0.06_25)] text-[oklch(0.38_0.13_25)] [&>svg]:text-[oklch(0.50_0.15_25)]",
    hotel:
      "bg-[oklch(0.96_0.04_290)] border-[oklch(0.88_0.05_290)] text-[oklch(0.38_0.13_290)] [&>svg]:text-[oklch(0.50_0.15_290)]",
    fuel:
      "bg-[var(--brass-100)] border-[oklch(0.85_0.06_75)] text-[var(--brass-700)] [&>svg]:text-[var(--brass-700)]",
    transport:
      "bg-[var(--horizon-100)] border-[oklch(0.85_0.06_250)] text-[var(--horizon-900)] [&>svg]:text-[var(--horizon-700)]",
    bike:
      "bg-[var(--terrain-100)] border-[oklch(0.85_0.05_130)] text-[var(--terrain-800)] [&>svg]:text-[var(--terrain-700)]",
  }[tone];

  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 pr-3 text-[12px] font-medium transition-colors ${toneClass}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
      <span className={emphasis ? "font-semibold" : ""}>{label}</span>
    </span>
  );
}
