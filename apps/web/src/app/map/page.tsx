"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface AerodromeMarker {
  id: string;
  name: string;
  icaoCode: string | null;
  latitude: number;
  longitude: number;
  status: string;
  aerodromeType: string;
  elevation: number | null;
  runways: { identifier: string; length: number; surface: string }[];
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

export default function MapPage() {
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [query, setQuery] = useState("");
  const [mapLoaded, setMapLoaded] = useState(false);

  // Fetch aerodromes for map markers
  const { data } = useQuery({
    queryKey: ["map-aerodromes", query],
    queryFn: () =>
      apiClient.get<AerodromeMarker[]>("/aerodromes/map", query ? { q: query } : undefined),
  });

  const aerodromes = data?.data ?? [];

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

      // Import CSS
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — CSS import has no type declarations
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
          layers: [
            {
              id: "osm",
              type: "raster",
              source: "osm",
            },
          ],
        },
        center: [2.3, 46.6], // Center of France
        zoom: 6,
      });

      map.addControl(new maplibregl.default.NavigationControl(), "top-right");

      popupRef.current = new maplibregl.default.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 8,
      });

      map.on("load", () => {
        setMapLoaded(true);
      });

      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update markers when data changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const map = mapRef.current;

    // Remove existing source if present
    if (map.getSource("aerodromes")) {
      if (map.getLayer("aerodrome-points")) map.removeLayer("aerodrome-points");
      map.removeSource("aerodromes");
    }

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: aerodromes.map((ad) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [ad.longitude, ad.latitude],
        },
        properties: {
          id: ad.id,
          name: ad.name,
          icaoCode: ad.icaoCode || "",
          status: ad.status,
          aerodromeType: ad.aerodromeType || "OTHER",
          elevation: ad.elevation ?? "",
          runways: ad.runways
            ?.map((r) => `${r.identifier} (${r.length}m)`)
            .join(", ") ?? "",
        },
      })),
    };

    map.addSource("aerodromes", {
      type: "geojson",
      data: geojson,
    });

    map.addLayer({
      id: "aerodrome-points",
      type: "circle",
      source: "aerodromes",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5, 4,
          8, 6,
          12, 10,
        ],
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

    // Click handler — navigate to detail
    map.on("click", "aerodrome-points", (e) => {
      const feature = e.features?.[0];
      if (feature?.properties?.["id"]) {
        navigateToDetail(feature.properties["id"]);
      }
    });

    // Hover — show popup
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
  }, [aerodromes, mapLoaded, navigateToDetail]);

  return (
    <div className="relative h-[calc(100vh-4rem)]">
      {/* Search overlay */}
      <div className="absolute left-4 top-4 z-10 w-80">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10 bg-background/95 backdrop-blur shadow-md"
            placeholder="Rechercher des aérodromes sur la carte..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {aerodromes.length > 0 && (
          <div className="mt-1 rounded-md bg-background/95 backdrop-blur shadow-md p-2 text-xs text-muted-foreground">
            {aerodromes.length} aérodrome{aerodromes.length !== 1 ? "s" : ""} affiché{aerodromes.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute right-4 bottom-8 z-10 rounded-md bg-background/95 backdrop-blur shadow-md p-3 text-xs">
        <div className="font-semibold mb-1.5">Types</div>
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 mb-0.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border border-white"
              style={{ backgroundColor: color }}
            />
            <span>{type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</span>
          </div>
        ))}
      </div>

      {/* Map container */}
      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
}
