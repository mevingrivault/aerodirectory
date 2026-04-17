"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Crosshair, ExternalLink, Map } from "lucide-react";

type MapStyleKey = "default" | "satellite" | "hybrid";

interface AerodromeLocationMapProps {
  aerodromeId: string;
  name: string;
  icaoCode: string | null;
  latitude: number;
  longitude: number;
  elevation: number | null;
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
}: AerodromeLocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
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

      const map = new maplibregl.default.Map({
        container: mapContainerRef.current,
        style: buildRasterStyle(mapStyle) as any,
        center,
        zoom: 14,
      });

      map.addControl(new maplibregl.default.NavigationControl(), "top-right");

      popupRef.current = new maplibregl.default.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 18,
      }).setHTML(
        `<div style="font-weight:600">${name}${icaoCode ? ` (${icaoCode})` : ""}</div>` +
          `<div style="font-size:12px;color:#64748b">${coordinatesLabel}${
            elevation != null ? ` · ${elevation} ft` : ""
          }</div>`,
      );

      markerRef.current = new maplibregl.default.Marker({
        color: "#2563eb",
        scale: 1.1,
      })
        .setLngLat(center)
        .setPopup(popupRef.current)
        .addTo(map);

      map.on("load", () => {
        popupRef.current?.addTo(map);
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
      </CardContent>
    </Card>
  );
}
