"use client";

import { useEffect, useRef, useState, useCallback, useMemo, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Search, SlidersHorizontal, X, Layers } from "lucide-react";

interface AirspaceFeature {
  id: string;
  name: string;
  type: number;
  icaoClass: string;
  lowerLimit: string;
  upperLimit: string;
  lowerLimitFt: number | null;
  upperLimitFt: number | null;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  activity: number | null;
  onDemand: boolean;
  onRequest: boolean;
  remarks: string | null;
}

// ICAO class fill colors (semi-transparent) — convention OACI
const AIRSPACE_CLASS_COLORS: Record<string, string> = {
  A: "rgba(255, 50,  50,  0.12)",
  B: "rgba(255, 120,  0,  0.12)",
  C: "rgba(255, 200,  0,  0.12)",
  D: "rgba(80,  160, 255, 0.12)",
  E: "rgba(100, 200, 100, 0.10)",
  F: "rgba(180,  80, 255, 0.10)",
  G: "rgba(160, 160, 160, 0.08)",
  SPC: "rgba(255,  50, 200, 0.14)",
};

const AIRSPACE_CLASS_STROKE: Record<string, string> = {
  A: "rgba(255, 50,  50,  0.75)",
  B: "rgba(255, 120,  0,  0.75)",
  C: "rgba(200, 150,  0,  0.75)",
  D: "rgba(30,  100, 220, 0.75)",
  E: "rgba(40,  140,  40, 0.70)",
  F: "rgba(140,  50, 220, 0.70)",
  G: "rgba(100, 100, 100, 0.50)",
  SPC: "rgba(220,  30, 160, 0.80)",
};

// openAIP airspace type labels (types most relevant for VFR)
const AIRSPACE_TYPE_LABELS: Record<number, string> = {
  0: "Autre", 1: "Restricted", 2: "Danger", 3: "Prohibited",
  4: "CTR", 5: "TMA", 6: "RMZ", 7: "TMZ", 8: "FIR", 9: "UIR",
  10: "ADIZ", 11: "ATZ", 12: "MATZ", 13: "Airway", 14: "MTR",
  15: "Alert", 16: "Warning", 17: "Protected", 18: "HTZ",
  19: "Glider", 20: "TRP", 21: "TIZ", 22: "TIA",
  23: "MBZ", 24: "GP", 25: "WTSZ", 26: "NOTAM",
};

interface AerodromeMarker {
  id: string;
  name: string;
  icaoCode: string | null;
  iataCode: string | null;
  latitude: number;
  longitude: number;
  status: string;
  aerodromeType: string;
  elevation: number | null;
  hasRestaurant: boolean;
  hasMaintenance: boolean;
  runways: { identifier: string; length: number; surface: string }[];
  fuels: { type: string }[];
}

const TYPE_COLORS: Record<string, string> = {
  INTERNATIONAL_AIRPORT: "#3b82f6",
  SMALL_AIRPORT: "#22c55e",
  GLIDER_SITE: "#a855f7",
  ULTRALIGHT_FIELD: "#f97316",
  HELIPORT: "#ef4444",
  MILITARY: "#6b7280",
  SEAPLANE_BASE: "#06b6d4",
  OTHER: "#6b7280",
};

const TYPE_LABELS: Record<string, string> = {
  INTERNATIONAL_AIRPORT: "Aéroport International",
  SMALL_AIRPORT: "Aérodrome",
  GLIDER_SITE: "Vol à voile",
  ULTRALIGHT_FIELD: "Terrain ULM",
  HELIPORT: "Héliport",
  MILITARY: "Militaire",
  SEAPLANE_BASE: "Base hydravion",
  OTHER: "Autre",
};

const MAP_STYLES = {
  osm: {
    version: 8 as const,
    sources: {
      base: {
        type: "raster" as const,
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "&copy; OpenStreetMap contributors",
      },
    },
    layers: [{ id: "base", type: "raster" as const, source: "base" }],
  },
  satellite: {
    version: 8 as const,
    sources: {
      base: {
        type: "raster" as const,
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
      },
    },
    layers: [{ id: "base", type: "raster" as const, source: "base" }],
  },
  hybrid: {
    version: 8 as const,
    sources: {
      base: {
        type: "raster" as const,
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
      },
      labels: {
        type: "raster" as const,
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
      },
    },
    layers: [
      { id: "base", type: "raster" as const, source: "base" },
      { id: "labels", type: "raster" as const, source: "labels" },
    ],
  },
};

const DEFAULT_HIDDEN = new Set(["MILITARY", "SEAPLANE_BASE", "OTHER", "HELIPORT"]);
const RUNWAY_OPTIONS = [
  { label: "Toutes", value: 0 },
  { label: "400 m+", value: 400 },
  { label: "600 m+", value: 600 },
  { label: "800 m+", value: 800 },
  { label: "1 000 m+", value: 1000 },
];
const FUEL_OPTIONS = [
  { label: "AVGAS 100LL", value: "AVGAS_100LL" },
  { label: "JET A1", value: "JET_A1" },
  { label: "UL91", value: "UL91" },
];

function MapPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [mapStyle, setMapStyle] = useState<"osm" | "satellite" | "hybrid">("osm");

  // Type visibility
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set(DEFAULT_HIDDEN));

  // Attribute filters
  const [minRunway, setMinRunway] = useState(0);
  const [requireRestaurant, setRequireRestaurant] = useState(false);
  const [requireMaintenance, setRequireMaintenance] = useState(false);
  const [requiredFuels, setRequiredFuels] = useState<Set<string>>(new Set());
  const [visitFilter, setVisitFilter] = useState<"" | "FAVORITE" | "VISITED">("");
  const [showAirspaces, setShowAirspaces] = useState(false);
  const [hiddenAirspaceClasses, setHiddenAirspaceClasses] = useState<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ["map-aerodromes", query],
    queryFn: () =>
      apiClient.get<AerodromeMarker[]>("/aerodromes/map", query ? { q: query } : undefined),
  });

  const { data: airspacesRes } = useQuery({
    queryKey: ["airspaces"],
    queryFn: () => apiClient.get<AirspaceFeature[]>("/airspaces"),
    staleTime: 10 * 60 * 1000,
    enabled: showAirspaces,
  });

  const { data: visitsRes } = useQuery({
    queryKey: ["visits"],
    queryFn: () => apiClient.get<{ aerodromeId: string; status: string }[]>("/visits"),
    enabled: !!user,
  });

  const aerodromes = data?.data ?? [];
  const airspaces = airspacesRes?.data ?? [];
  const visits = visitsRes?.data ?? [];
  const highlightedAerodromeId = searchParams.get("highlight");
  const visitsByAerodrome = new Map(
    visits.map((visit) => [visit.aerodromeId, visit.status]),
  );

  // Apply all filters client-side
  const filtered = aerodromes.filter((ad) => {
    if (ad.id === highlightedAerodromeId) return true;
    if (hiddenTypes.has(ad.aerodromeType)) return false;
    if (minRunway > 0) {
      const maxLen = ad.runways.length > 0 ? Math.max(...ad.runways.map((r) => r.length)) : 0;
      if (maxLen < minRunway) return false;
    }
    if (requireRestaurant && !ad.hasRestaurant) return false;
    if (requireMaintenance && !ad.hasMaintenance) return false;
    if (requiredFuels.size > 0) {
      const hasAny = [...requiredFuels].some((f) => ad.fuels.some((fuel) => fuel.type === f));
      if (!hasAny) return false;
    }
    if (visitFilter) {
      if (visitsByAerodrome.get(ad.id) !== visitFilter) return false;
    }
    return true;
  });

  const highlightedAerodrome = useMemo(
    () => aerodromes.find((ad) => ad.id === highlightedAerodromeId) ?? null,
    [aerodromes, highlightedAerodromeId],
  );

  useEffect(() => {
    const urlQuery = searchParams.get("q") ?? "";
    setQuery((current) => (current === urlQuery ? current : urlQuery));
  }, [searchParams]);

  const activeFilterCount =
    (minRunway > 0 ? 1 : 0) +
    (requireRestaurant ? 1 : 0) +
    (requireMaintenance ? 1 : 0) +
    requiredFuels.size +
    (visitFilter ? 1 : 0);

  const navigateToDetail = useCallback(
    (id: string) => router.push(`/aerodrome/${id}`),
    [router],
  );

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    let cancelled = false;

    import("maplibre-gl").then((maplibregl) => {
      if (cancelled || !mapContainer.current) return;
      // @ts-ignore
      import("maplibre-gl/dist/maplibre-gl.css");

      const map = new maplibregl.default.Map({
        container: mapContainer.current,
        style: MAP_STYLES.osm,
        center: [2.3, 46.6],
        zoom: 6,
      });

      map.addControl(new maplibregl.default.NavigationControl(), "top-right");

      popupRef.current = new maplibregl.default.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 8,
      });

      map.on("load", () => setMapLoaded(true));
      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Switch base map style when mapStyle changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    map.setStyle(MAP_STYLES[mapStyle]);
    // setStyle removes all sources/layers — wait for new style then re-add markers
    map.once("style.load", () => {
      setMapLoaded(false);
      requestAnimationFrame(() => setMapLoaded(true));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle]);

  // Airspaces layer
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    // Remove existing airspace layers/source
    if (map.getLayer("airspace-fill")) map.removeLayer("airspace-fill");
    if (map.getLayer("airspace-stroke")) map.removeLayer("airspace-stroke");
    if (map.getSource("airspaces")) map.removeSource("airspaces");

    if (!showAirspaces || airspaces.length === 0) return;

    // Build a GeoJSON FeatureCollection from the fetched airspaces
    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: airspaces.map((a) => ({
        type: "Feature" as const,
        geometry: a.geometry as GeoJSON.Geometry,
        properties: {
          id: a.id,
          name: a.name,
          icaoClass: a.icaoClass,
          type: a.type,
          lowerLimit: a.lowerLimit,
          upperLimit: a.upperLimit,
          onDemand: a.onDemand,
          onRequest: a.onRequest,
          remarks: a.remarks ?? "",
        },
      })),
    };

    map.addSource("airspaces", { type: "geojson", data: geojson });

    // Build fill-color expression from ICAO class
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fillColorExpression: any = [
      "match",
      ["get", "icaoClass"],
      ...Object.entries(AIRSPACE_CLASS_COLORS).flatMap(([cls, color]) => [cls, color]),
      "rgba(160,160,160,0.08)",
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const strokeColorExpression: any = [
      "match",
      ["get", "icaoClass"],
      ...Object.entries(AIRSPACE_CLASS_STROKE).flatMap(([cls, color]) => [cls, color]),
      "rgba(100,100,100,0.5)",
    ];

    // Insert airspace layers below marker layers (if they exist) or at the top
    const insertBefore = map.getLayer("aerodrome-highlight") ? "aerodrome-highlight" : undefined;

    map.addLayer(
      {
        id: "airspace-fill",
        type: "fill",
        source: "airspaces",
        paint: {
          "fill-color": fillColorExpression,
          "fill-opacity": 1,
        },
      },
      insertBefore,
    );

    map.addLayer(
      {
        id: "airspace-stroke",
        type: "line",
        source: "airspaces",
        paint: {
          "line-color": strokeColorExpression,
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 10, 1.5],
          "line-dasharray": [3, 2],
        },
      },
      insertBefore,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onAirspaceClick = (e: any) => {
      const feature = e.features?.[0];
      if (!feature || !popupRef.current) return;
      const p = feature.properties ?? {};
      const typeLabel = AIRSPACE_TYPE_LABELS[p["type"] as number] ?? `Type ${p["type"]}`;
      const extra = [
        p["onDemand"] && "Sur demande",
        p["onRequest"] && "Sur autorisation",
        p["remarks"] && `<div style="font-size:11px;color:#888;margin-top:3px">${p["remarks"]}</div>`,
      ].filter(Boolean).join(" · ");
      popupRef.current
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-weight:600">${p["name"]}</div>` +
          `<div style="font-size:12px;color:#555">${typeLabel} · Classe ${p["icaoClass"]}</div>` +
          `<div style="font-size:12px;color:#666">${p["lowerLimit"]} – ${p["upperLimit"]}</div>` +
          (extra ? `<div style="font-size:11px;color:#888;margin-top:2px">${extra}</div>` : ""),
        )
        .addTo(map);
    };

    map.on("click", "airspace-fill", onAirspaceClick);
    map.on("mouseenter", "airspace-fill", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "airspace-fill", () => { map.getCanvas().style.cursor = ""; popupRef.current?.remove(); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airspaces, showAirspaces, mapLoaded]);

  // Apply airspace class visibility filter
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (!map.getLayer("airspace-fill")) return;

    const visibleClasses = Object.keys(AIRSPACE_CLASS_COLORS).filter(
      (cls) => !hiddenAirspaceClasses.has(cls),
    );
    const filterExpr = visibleClasses.length === 0
      ? ["==", "1", "0"] // hide all
      : ["in", ["get", "icaoClass"], ["literal", visibleClasses]];

    map.setFilter("airspace-fill", filterExpr as any);
    map.setFilter("airspace-stroke", filterExpr as any);
  }, [hiddenAirspaceClasses, mapLoaded]);

  // Update markers whenever filtered data changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    if (map.getSource("aerodromes")) {
      if (map.getLayer("aerodrome-highlight")) map.removeLayer("aerodrome-highlight");
      if (map.getLayer("aerodrome-visited-halo")) map.removeLayer("aerodrome-visited-halo");
      if (map.getLayer("aerodrome-points")) map.removeLayer("aerodrome-points");
      map.removeSource("aerodromes");
    }

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: filtered.map((ad) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [ad.longitude, ad.latitude] },
        properties: {
          id: ad.id,
          name: ad.name,
          icaoCode: ad.icaoCode || "",
          iataCode: ad.iataCode || "",
          status: ad.status,
          aerodromeType: ad.aerodromeType || "OTHER",
          visitStatus: visitsByAerodrome.get(ad.id) ?? "",
          elevation: ad.elevation ?? "",
          runways: ad.runways?.map((r) => `${r.identifier} (${r.length}m)`).join(", ") ?? "",
        },
      })),
    };

    map.addSource("aerodromes", { type: "geojson", data: geojson });

    map.addLayer({
      id: "aerodrome-highlight",
      type: "circle",
      source: "aerodromes",
      filter: highlightedAerodromeId
        ? ["==", ["get", "id"], highlightedAerodromeId]
        : ["==", ["get", "id"], ""],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 10, 8, 15, 12, 22],
        "circle-color": "#2563eb",
        "circle-opacity": 0.14,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#2563eb",
      },
    });

    map.addLayer({
      id: "aerodrome-visited-halo",
      type: "circle",
      source: "aerodromes",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5,
          0,
          8,
          ["case", ["!=", ["get", "visitStatus"], ""], 9, 0],
          12,
          ["case", ["!=", ["get", "visitStatus"], ""], 14, 0],
        ],
        "circle-color": [
          "match",
          ["get", "visitStatus"],
          "FAVORITE", "#f59e0b",
          "VISITED", "#2563eb",
          "SEEN", "#94a3b8",
          "rgba(0,0,0,0)",
        ],
        "circle-opacity": 0.22,
        "circle-stroke-width": 0,
      },
    });

    map.addLayer({
      id: "aerodrome-points",
      type: "circle",
      source: "aerodromes",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 8, 6, 12, 10],
        "circle-color": [
          "match",
          ["get", "aerodromeType"],
          "INTERNATIONAL_AIRPORT", TYPE_COLORS.INTERNATIONAL_AIRPORT,
          "SMALL_AIRPORT", TYPE_COLORS.SMALL_AIRPORT,
          "GLIDER_SITE", TYPE_COLORS.GLIDER_SITE,
          "ULTRALIGHT_FIELD", TYPE_COLORS.ULTRALIGHT_FIELD,
          "HELIPORT", TYPE_COLORS.HELIPORT,
          "MILITARY", TYPE_COLORS.MILITARY,
          "SEAPLANE_BASE", TYPE_COLORS.SEAPLANE_BASE,
          TYPE_COLORS.OTHER,
        ],
        "circle-stroke-width": [
          "case",
          ["==", ["get", "visitStatus"], "FAVORITE"], 3,
          ["!=", ["get", "visitStatus"], ""], 2.5,
          2,
        ],
        "circle-stroke-color": [
          "match",
          ["get", "visitStatus"],
          "FAVORITE", "#f59e0b",
          "VISITED", "#2563eb",
          "SEEN", "#94a3b8",
          "#ffffff",
        ],
      },
    });

    map.on("click", "aerodrome-points", (e) => {
      const feature = e.features?.[0];
      if (feature?.properties?.["id"]) navigateToDetail(feature.properties["id"]);
    });

    map.on("mouseenter", "aerodrome-points", (e) => {
      map.getCanvas().style.cursor = "pointer";
      const feature = e.features?.[0];
      if (feature && popupRef.current) {
        const props = feature.properties ?? {};
        const coords = (feature.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
        const icao = props["icaoCode"] ? ` (${props["icaoCode"]}${props["iataCode"] ? ` / ${props["iataCode"]}` : ""})` : "";
        const elevation = props["elevation"] ? ` — ${props["elevation"]} ft` : "";
        const rwy = props["runways"] ? `<div style="font-size:11px;color:#888;margin-top:2px">${props["runways"]}</div>` : "";
        popupRef.current
          .setLngLat(coords)
          .setHTML(
            `<div style="font-weight:600">${props["name"]}${icao}</div>` +
              `<div style="font-size:12px;color:#666">${props["status"]}${elevation}</div>` +
              rwy,
          )
          .addTo(map);
      }
    });

    map.on("mouseleave", "aerodrome-points", () => {
      map.getCanvas().style.cursor = "";
      popupRef.current?.remove();
    });

    if (highlightedAerodrome) {
      const coords: [number, number] = [
        highlightedAerodrome.longitude,
        highlightedAerodrome.latitude,
      ];
      map.flyTo({
        center: coords,
        zoom: Math.max(map.getZoom(), 11),
        essential: true,
      });

      popupRef.current
        ?.setLngLat(coords)
        .setHTML(
          `<div style="font-weight:600">${highlightedAerodrome.name}${
            highlightedAerodrome.icaoCode ? ` (${highlightedAerodrome.icaoCode})` : ""
          }</div>` +
            `<div style="font-size:12px;color:#666">Terrain mis en évidence</div>`,
        )
        .addTo(map);
    }
  }, [filtered, highlightedAerodrome, highlightedAerodromeId, mapLoaded, navigateToDetail, visitsByAerodrome]);

  const toggleFuel = (fuel: string) =>
    setRequiredFuels((prev) => {
      const next = new Set(prev);
      if (next.has(fuel)) next.delete(fuel);
      else next.add(fuel);
      return next;
    });

  return (
    <div className="relative h-[calc(100vh-4rem)]">
      {/* Search + filters overlay */}
      <div className="absolute left-4 top-4 z-10 w-72">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10 bg-background/95 backdrop-blur shadow-md"
              placeholder="Rechercher..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`relative flex items-center justify-center rounded-md border px-3 shadow-md bg-background/95 backdrop-blur transition-colors ${showFilters ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-2 rounded-md bg-background/95 backdrop-blur shadow-md p-3 text-xs space-y-3">
            {/* Piste minimale */}
            <div>
              <div className="font-semibold mb-1.5">Piste minimale</div>
              <div className="flex flex-wrap gap-1">
                {RUNWAY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setMinRunway(opt.value)}
                    className={`rounded px-2 py-0.5 border transition-colors ${minRunway === opt.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Carburant */}
            <div>
              <div className="font-semibold mb-1.5">Carburant disponible</div>
              <div className="space-y-1">
                {FUEL_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requiredFuels.has(opt.value)}
                      onChange={() => toggleFuel(opt.value)}
                      className="rounded"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Services */}
            <div>
              <div className="font-semibold mb-1.5">Services</div>
              <div className="space-y-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireRestaurant}
                    onChange={(e) => setRequireRestaurant(e.target.checked)}
                    className="rounded"
                  />
                  Restaurant
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireMaintenance}
                    onChange={(e) => setRequireMaintenance(e.target.checked)}
                    className="rounded"
                  />
                  Maintenance
                </label>
              </div>
            </div>

            {/* Mes repères */}
            {user && (
              <div>
                <div className="font-semibold mb-1.5">Mes repères</div>
                <div className="flex flex-wrap gap-1">
                  {[
                    { label: "Tous", value: "" as const },
                    { label: "Favoris", value: "FAVORITE" as const },
                    { label: "Visités", value: "VISITED" as const },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setVisitFilter(opt.value)}
                      className={`rounded px-2 py-0.5 border transition-colors ${visitFilter === opt.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Espaces aériens */}
            <div>
              <div className="font-semibold mb-1.5 flex items-center gap-1.5">
                <Layers className="h-3 w-3" /> Espaces aériens
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAirspaces}
                  onChange={(e) => setShowAirspaces(e.target.checked)}
                  className="rounded"
                />
                Afficher les espaces aériens
              </label>
            </div>

            {/* Reset */}
            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  setMinRunway(0);
                  setRequireRestaurant(false);
                  setRequireMaintenance(false);
                  setRequiredFuels(new Set());
                  setVisitFilter("");
                }}
                className="flex items-center gap-1 text-destructive hover:underline"
              >
                <X className="h-3 w-3" /> Réinitialiser les filtres
              </button>
            )}
          </div>
        )}

        <div className="mt-1 rounded-md bg-background/95 backdrop-blur shadow-md p-2 text-xs text-muted-foreground">
          {filtered.length} aérodrome{filtered.length !== 1 ? "s" : ""} affiché{filtered.length !== 1 ? "s" : ""}
        </div>
        {highlightedAerodrome && (
          <div className="mt-2 rounded-md border border-primary/25 bg-background/95 p-2 text-xs text-foreground shadow-md backdrop-blur">
            <span className="font-medium">Mise en évidence :</span>{" "}
            {highlightedAerodrome.name}
            {highlightedAerodrome.icaoCode ? ` (${highlightedAerodrome.icaoCode})` : ""}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute right-4 bottom-8 z-10 rounded-md bg-background/95 backdrop-blur shadow-md p-3 text-xs">
        <div className="font-semibold mb-1.5">Types</div>
        {Object.entries(TYPE_COLORS).map(([type, color]) => {
          const hidden = hiddenTypes.has(type);
          return (
            <div
              key={type}
              className="flex items-center gap-1.5 mb-0.5 cursor-pointer select-none"
              style={{ opacity: hidden ? 0.35 : 1 }}
              onClick={() =>
                setHiddenTypes((prev) => {
                  const next = new Set(prev);
                  if (next.has(type)) next.delete(type);
                  else next.add(type);
                  return next;
                })
              }
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border border-white shrink-0"
                style={{ backgroundColor: hidden ? "#d1d5db" : color }}
              />
              <span>{TYPE_LABELS[type]}</span>
            </div>
          );
        })}
        {showAirspaces && (
          <>
            <div className="my-2 border-t border-border/70" />
            <div className="font-semibold mb-1.5">Espaces aériens</div>
            {Object.entries(AIRSPACE_CLASS_STROKE).map(([cls, color]) => {
              const hidden = hiddenAirspaceClasses.has(cls);
              return (
                <div
                  key={cls}
                  className="flex items-center gap-1.5 mb-0.5 cursor-pointer select-none"
                  style={{ opacity: hidden ? 0.35 : 1 }}
                  onClick={() =>
                    setHiddenAirspaceClasses((prev) => {
                      const next = new Set(prev);
                      if (next.has(cls)) next.delete(cls);
                      else next.add(cls);
                      return next;
                    })
                  }
                >
                  <span
                    className="inline-block h-2.5 w-5 shrink-0 rounded-sm border"
                    style={{
                      backgroundColor: hidden ? "transparent" : AIRSPACE_CLASS_COLORS[cls],
                      borderColor: hidden ? "#d1d5db" : color,
                    }}
                  />
                  <span>Classe {cls}</span>
                </div>
              );
            })}
          </>
        )}
        {user && (
          <>
            <div className="my-2 border-t border-border/70" />
            <div className="font-semibold mb-1.5">Mes repères</div>
            <div
              className="flex items-center gap-1.5 mb-0.5 cursor-pointer select-none"
              style={{ opacity: visitFilter === "FAVORITE" ? 0.35 : 1 }}
              onClick={() => setVisitFilter((v) => (v === "VISITED" ? "" : "VISITED"))}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border-2 shrink-0"
                style={{ backgroundColor: TYPE_COLORS.SMALL_AIRPORT, borderColor: "#2563eb" }}
              />
              <span>Visité</span>
            </div>
            <div
              className="flex items-center gap-1.5 cursor-pointer select-none"
              style={{ opacity: visitFilter === "VISITED" ? 0.35 : 1 }}
              onClick={() => setVisitFilter((v) => (v === "FAVORITE" ? "" : "FAVORITE"))}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border-[3px] shrink-0"
                style={{ backgroundColor: TYPE_COLORS.SMALL_AIRPORT, borderColor: "#f59e0b" }}
              />
              <span>Favori</span>
            </div>
          </>
        )}
      </div>

      {/* Map style switcher */}
      <div className="absolute left-4 bottom-8 z-10 flex rounded-md shadow-md overflow-hidden border bg-background/95 backdrop-blur text-xs font-medium">
        {(["osm", "satellite", "hybrid"] as const).map((style, i) => (
          <button
            key={style}
            onClick={() => setMapStyle(style)}
            className={`px-3 py-1.5 transition-colors ${i > 0 ? "border-l border-border" : ""} ${mapStyle === style ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {style === "osm" ? "Plan" : style === "satellite" ? "Satellite" : "Hybride"}
          </button>
        ))}
      </div>

      {/* Map container */}
      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense>
      <MapPageInner />
    </Suspense>
  );
}
