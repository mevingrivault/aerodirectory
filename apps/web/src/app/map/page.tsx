"use client";

import { useEffect, useRef, useState } from "react";
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
}

export default function MapPage() {
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [query, setQuery] = useState("");
  const [mapLoaded, setMapLoaded] = useState(false);

  // Fetch aerodromes for map markers
  const { data } = useQuery({
    queryKey: ["map-aerodromes", query],
    queryFn: () =>
      apiClient.get<AerodromeMarker[]>("/search", {
        limit: "500",
        ...(query ? { q: query } : {}),
      }),
  });

  const aerodromes = data?.data ?? [];

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    let cancelled = false;

    import("maplibre-gl").then((maplibregl) => {
      if (cancelled || !mapContainer.current) return;

      // Import CSS
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

      map.on("load", () => {
        setMapLoaded(true);
      });

      mapRef.current = map;
    });

    return () => {
      cancelled = true;
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
      map.removeLayer("aerodrome-points");
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
        "circle-radius": 6,
        "circle-color": [
          "match",
          ["get", "status"],
          "OPEN", "#22c55e",
          "CLOSED", "#ef4444",
          "RESTRICTED", "#f59e0b",
          "#6b7280",
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });

    // Click handler
    map.on("click", "aerodrome-points", (e) => {
      const feature = e.features?.[0];
      if (feature?.properties?.["id"]) {
        router.push(`/aerodrome/${feature.properties["id"]}`);
      }
    });

    // Hover cursor
    map.on("mouseenter", "aerodrome-points", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "aerodrome-points", () => {
      map.getCanvas().style.cursor = "";
    });
  }, [aerodromes, mapLoaded, router]);

  return (
    <div className="relative h-[calc(100vh-4rem)]">
      {/* Search overlay */}
      <div className="absolute left-4 top-4 z-10 w-80">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10 bg-background/95 backdrop-blur shadow-md"
            placeholder="Search aerodromes on map..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {aerodromes.length > 0 && (
          <div className="mt-1 rounded-md bg-background/95 backdrop-blur shadow-md p-2 text-xs text-muted-foreground">
            {aerodromes.length} aerodrome{aerodromes.length !== 1 ? "s" : ""} shown
          </div>
        )}
      </div>

      {/* Map container */}
      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
}
