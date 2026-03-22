"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Search, SlidersHorizontal, X } from "lucide-react";

interface AerodromeMarker {
  id: string;
  name: string;
  icaoCode: string | null;
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

export default function MapPage() {
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const [query, setQuery] = useState("");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Type visibility
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set(DEFAULT_HIDDEN));

  // Attribute filters
  const [minRunway, setMinRunway] = useState(0);
  const [requireRestaurant, setRequireRestaurant] = useState(false);
  const [requireMaintenance, setRequireMaintenance] = useState(false);
  const [requiredFuels, setRequiredFuels] = useState<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ["map-aerodromes", query],
    queryFn: () =>
      apiClient.get<AerodromeMarker[]>("/aerodromes/map", query ? { q: query } : undefined),
  });

  const aerodromes = data?.data ?? [];

  // Apply all filters client-side
  const filtered = aerodromes.filter((ad) => {
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
    return true;
  });

  const activeFilterCount =
    (minRunway > 0 ? 1 : 0) +
    (requireRestaurant ? 1 : 0) +
    (requireMaintenance ? 1 : 0) +
    requiredFuels.size;

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

  // Update markers whenever filtered data changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    if (map.getSource("aerodromes")) {
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
          status: ad.status,
          aerodromeType: ad.aerodromeType || "OTHER",
          elevation: ad.elevation ?? "",
          runways: ad.runways?.map((r) => `${r.identifier} (${r.length}m)`).join(", ") ?? "",
        },
      })),
    };

    map.addSource("aerodromes", { type: "geojson", data: geojson });

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
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
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
        const icao = props["icaoCode"] ? ` (${props["icaoCode"]})` : "";
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
  }, [filtered, mapLoaded, navigateToDetail]);

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

            {/* Reset */}
            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  setMinRunway(0);
                  setRequireRestaurant(false);
                  setRequireMaintenance(false);
                  setRequiredFuels(new Set());
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
      </div>

      {/* Map container */}
      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
}
