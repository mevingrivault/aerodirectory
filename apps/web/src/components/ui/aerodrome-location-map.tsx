"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Crosshair, ExternalLink, Map } from "lucide-react";
import {
  OBSTACLE_COLORS,
  OBSTACLE_LABELS,
  formatObstacleDistance,
  formatObstacleElevation,
  formatObstacleHeight,
  type NearbyObstacle,
} from "@/lib/obstacles";
import {
  PROTECTED_AREA_COLORS,
  PROTECTED_AREA_LABELS,
  formatAreaDistance,
  type NearbyProtectedArea,
} from "@/lib/protected-areas";

type MapStyleKey = "default" | "satellite" | "hybrid";

interface AerodromeLocationMapProps {
  aerodromeId: string;
  name: string;
  icaoCode: string | null;
  latitude: number;
  longitude: number;
  elevation: number | null;
  obstacles?: NearbyObstacle[];
  protectedAreas?: NearbyProtectedArea[];
}

const OBSTACLES_SOURCE = "obstacles";
const AREAS_SOURCE = "protected-areas";

function areasGeoJson(areas: NearbyProtectedArea[]) {
  return {
    type: "FeatureCollection" as const,
    features: areas.map((a) => ({
      type: "Feature" as const,
      geometry: a.geometry,
      properties: { id: a.id, color: PROTECTED_AREA_COLORS[a.kind] },
    })),
  };
}

function areaPopupContent(a: NearbyProtectedArea): HTMLElement {
  const root = document.createElement("div");
  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.textContent = a.name ?? PROTECTED_AREA_LABELS[a.kind];
  const details = document.createElement("div");
  details.style.fontSize = "12px";
  details.style.color = "#64748b";
  details.textContent = `${a.detail ?? PROTECTED_AREA_LABELS[a.kind]} · ${formatAreaDistance(a.distanceM)}`;
  root.append(title, details);
  return root;
}

function obstaclesGeoJson(obstacles: NearbyObstacle[]) {
  return {
    type: "FeatureCollection" as const,
    features: obstacles.map((o) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [o.longitude, o.latitude] },
      properties: { id: o.id, color: OBSTACLE_COLORS[o.type] },
    })),
  };
}

/** Popup built from DOM nodes: obstacle names come from OSM and are never parsed as HTML. */
function obstaclePopupContent(o: NearbyObstacle): HTMLElement {
  const root = document.createElement("div");
  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.textContent = o.name ? `${OBSTACLE_LABELS[o.type]} · ${o.name}` : OBSTACLE_LABELS[o.type];
  const details = document.createElement("div");
  details.style.fontSize = "12px";
  details.style.color = "#64748b";
  details.textContent = `Hauteur ${formatObstacleHeight(o.heightM)} · sommet ${formatObstacleElevation(o.elevationM)} · ${formatObstacleDistance(o.distanceM)} au ${String(o.bearingDeg).padStart(3, "0")}°`;
  root.append(title, details);
  return root;
}

const MAP_STYLE_OPTIONS: Array<{ key: MapStyleKey; label: string }> = [
  { key: "default", label: "Plan" },
  { key: "satellite", label: "Satellite" },
  { key: "hybrid", label: "Hybride" },
];

function buildRasterStyle(style: MapStyleKey) {
  if (style === "hybrid") {
    return {
      version: 8,
      sources: {
        base: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
        },
        labels: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
        },
      },
      layers: [
        { id: "base", type: "raster", source: "base" },
        { id: "labels", type: "raster", source: "labels" },
      ],
    };
  }

  const tilesByStyle: Record<"default" | "satellite", { tiles: string[]; attribution: string }> = {
    default: {
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      attribution: "&copy; OpenStreetMap contributors",
    },
    satellite: {
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
    },
  };

  const source = tilesByStyle[style];

  return {
    version: 8,
    sources: {
      raster: {
        type: "raster",
        tiles: source.tiles,
        tileSize: 256,
        attribution: source.attribution,
      },
    },
    layers: [{ id: "raster", type: "raster", source: "raster" }],
  };
}

export function AerodromeLocationMap({
  aerodromeId,
  name,
  icaoCode,
  latitude,
  longitude,
  elevation,
  obstacles,
  protectedAreas,
}: AerodromeLocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  // Read when the map (re)loads, since changing the base style rebuilds it.
  const obstaclesRef = useRef<NearbyObstacle[]>(obstacles ?? []);
  obstaclesRef.current = obstacles ?? [];
  const areasRef = useRef<NearbyProtectedArea[]>(protectedAreas ?? []);
  areasRef.current = protectedAreas ?? [];
  const markerRef = useRef<any>(null);
  const popupRef = useRef<any>(null);
  const [mapStyle, setMapStyle] = useState<MapStyleKey>("default");
  const [copied, setCopied] = useState(false);

  const center = useMemo(() => [longitude, latitude] as [number, number], [latitude, longitude]);
  const coordinatesLabel = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  const internalMapUrl = `/map?highlight=${encodeURIComponent(aerodromeId)}&q=${encodeURIComponent(
    icaoCode || name,
  )}`;

  useEffect(() => {
    let cancelled = false;

    async function mountMap() {
      if (!mapContainerRef.current) return;

      const maplibregl = await import("maplibre-gl");
      await import("maplibre-gl/dist/maplibre-gl.css");

      if (cancelled || !mapContainerRef.current) return;

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: buildRasterStyle(mapStyle) as any,
        center,
        zoom: 14,
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");

      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 18,
      }).setHTML(
        `<div style="font-weight:600">${name}${icaoCode ? ` (${icaoCode})` : ""}</div>` +
          `<div style="font-size:12px;color:#64748b">${coordinatesLabel}${
            elevation != null ? ` · ${elevation} ft` : ""
          }</div>`,
      );

      markerRef.current = new maplibregl.Marker({
        color: "#2563eb",
        scale: 1.1,
      })
        .setLngLat(center)
        .setPopup(popupRef.current)
        .addTo(map);

      map.on("load", () => {
        popupRef.current?.addTo(map);

        // Areas first, so obstacles are drawn on top of them.
        map.addSource(AREAS_SOURCE, { type: "geojson", data: areasGeoJson(areasRef.current) });
        map.addLayer({
          id: "protected-areas-fill",
          type: "fill",
          source: AREAS_SOURCE,
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.15 },
        });
        map.addLayer({
          id: "protected-areas-line",
          type: "line",
          source: AREAS_SOURCE,
          paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-dasharray": [3, 2] },
        });
        map.on("click", "protected-areas-fill", (event: any) => {
          // An obstacle click inside an area takes precedence.
          if (map.queryRenderedFeatures(event.point, { layers: ["obstacles"] }).length > 0) return;
          const id = event.features?.[0]?.properties?.id;
          const area = areasRef.current.find((a) => a.id === id);
          if (!area) return;
          new maplibregl.Popup({ offset: 8 })
            .setLngLat(event.lngLat)
            .setDOMContent(areaPopupContent(area))
            .addTo(map);
        });

        map.addSource(OBSTACLES_SOURCE, { type: "geojson", data: obstaclesGeoJson(obstaclesRef.current) });
        map.addLayer({
          id: "obstacles",
          type: "circle",
          source: OBSTACLES_SOURCE,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 6],
            "circle-color": ["get", "color"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
          },
        });
        map.on("click", "obstacles", (event: any) => {
          const id = event.features?.[0]?.properties?.id;
          const obstacle = obstaclesRef.current.find((o) => o.id === id);
          if (!obstacle) return;
          new maplibregl.Popup({ offset: 8 })
            .setLngLat([obstacle.longitude, obstacle.latitude])
            .setDOMContent(obstaclePopupContent(obstacle))
            .addTo(map);
        });
        map.on("mouseenter", "obstacles", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "obstacles", () => { map.getCanvas().style.cursor = ""; });
      });

      mapRef.current = map;
    }

    void mountMap();

    return () => {
      cancelled = true;
      popupRef.current?.remove?.();
      markerRef.current?.remove?.();
      popupRef.current = null;
      markerRef.current = null;
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
  }, [center, coordinatesLabel, elevation, icaoCode, mapStyle, name]);

  // Obstacles usually arrive after the map: push them into the loaded source.
  useEffect(() => {
    const source = mapRef.current?.getSource?.(OBSTACLES_SOURCE);
    source?.setData?.(obstaclesGeoJson(obstacles ?? []));
  }, [obstacles]);

  useEffect(() => {
    const source = mapRef.current?.getSource?.(AREAS_SOURCE);
    source?.setData?.(areasGeoJson(protectedAreas ?? []));
  }, [protectedAreas]);

  const presentKinds = useMemo(
    () => (Object.keys(PROTECTED_AREA_LABELS) as NearbyProtectedArea["kind"][]).filter((k) => protectedAreas?.some((a) => a.kind === k)),
    [protectedAreas],
  );

  const presentTypes = useMemo(
    () => (Object.keys(OBSTACLE_LABELS) as NearbyObstacle["type"][]).filter((t) => obstacles?.some((o) => o.type === t)),
    [obstacles],
  );

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopyCoordinates = async () => {
    try {
      await navigator.clipboard.writeText(coordinatesLabel);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleRecenter = () => {
    mapRef.current?.flyTo?.({
      center,
      zoom: 14,
      essential: true,
    });
    popupRef.current?.addTo?.(mapRef.current);
  };

  return (
    <Card className="mb-6">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Map className="h-5 w-5" />
              Localisation
            </CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Coordonnees : {coordinatesLabel}
              {elevation != null ? ` · ${elevation} ft` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={mapStyle}
              onChange={(event) => setMapStyle(event.target.value as MapStyleKey)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Style de carte"
            >
              {MAP_STYLE_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>

            <Button type="button" variant="outline" size="sm" onClick={handleRecenter}>
              <Crosshair className="mr-2 h-4 w-4" />
              Recentrer
            </Button>

            <Button type="button" variant="outline" size="sm" onClick={handleCopyCoordinates}>
              <Copy className="mr-2 h-4 w-4" />
              {copied ? "Copie" : "Copier"}
            </Button>

            <Button asChild type="button" variant="outline" size="sm">
              <Link href={internalMapUrl}>
                Voir sur la carte
              </Link>
            </Button>

            <Button asChild type="button" variant="outline" size="sm">
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Google Maps
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={mapContainerRef}
          className="h-[360px] overflow-hidden rounded-xl border bg-muted/20"
          data-aerodrome-id={aerodromeId}
        />
        {presentKinds.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>Zones :</span>
            {presentKinds.map((kind) => (
              <span key={kind} className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-3 rounded-sm border" style={{ background: `${PROTECTED_AREA_COLORS[kind]}33`, borderColor: PROTECTED_AREA_COLORS[kind] }} />
                {PROTECTED_AREA_LABELS[kind]}
              </span>
            ))}
          </div>
        )}
        {presentTypes.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>Obstacles :</span>
            {presentTypes.map((type) => (
              <span key={type} className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: OBSTACLE_COLORS[type] }} />
                {OBSTACLE_LABELS[type]}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
