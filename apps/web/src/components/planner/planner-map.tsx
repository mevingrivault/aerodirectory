"use client";

import { useEffect, useRef, useState } from "react";
import { EARTH_RADIUS_NM, type PlannerResult } from "@aerodirectory/shared";
import { popupContent } from "@/lib/map-popup";
import { formatEuros, formatFlightTime, formatNm } from "@/lib/utils";
import type { AerodromeOption } from "./types";


type PlannerMapStyle = "osm" | "satellite" | "hybrid";

const PLANNER_MAP_STYLES: Record<PlannerMapStyle, object> = {
  osm: {
    version: 8,
    sources: {
      base: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "&copy; OpenStreetMap contributors",
      },
    },
    layers: [{ id: "base", type: "raster", source: "base" }],
  },
  satellite: {
    version: 8,
    sources: {
      base: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Tiles &copy; Esri",
      },
    },
    layers: [{ id: "base", type: "raster", source: "base" }],
  },
  hybrid: {
    version: 8,
    sources: {
      base: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Tiles &copy; Esri",
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
  },
};

export interface PlannerRanges {
  oneWayNm: number; // usable range, reserve off: one way, or round trip refuelling there
  roundTripNm: number | null; // round trip on one tank
}

type Point = [number, number]; // [lon, lat]

/** Circle of `radiusNm` around a point, as a closed ring of great-circle destinations. */
function circle(lat: number, lon: number, radiusNm: number, steps = 96): Point[] {
  const rad = Math.PI / 180;
  const δ = radiusNm / EARTH_RADIUS_NM;
  const φ1 = lat * rad;
  const λ1 = lon * rad;
  const ring: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const θ = (i / steps) * 2 * Math.PI;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
    ring.push([λ2 / rad, φ2 / rad]);
  }
  return ring;
}

interface Overlays {
  departure: AerodromeOption | null;
  ranges: PlannerRanges | null;
  selected: PlannerResult | null;
}

/** Range circles and the line to the selected field. Redrawn after every style change, which drops them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawOverlays(map: any, { departure, ranges, selected }: Overlays) {
  const rings: GeoJSON.Feature[] = [];
  if (departure && ranges) {
    const add = (radiusNm: number, kind: string) =>
      rings.push({ type: "Feature", properties: { kind }, geometry: { type: "LineString", coordinates: circle(departure.latitude, departure.longitude, radiusNm) } });
    if (ranges.oneWayNm > 0) add(ranges.oneWayNm, "one-way");
    if (ranges.roundTripNm) add(ranges.roundTripNm, "round-trip");
  }
  const route: GeoJSON.Feature[] =
    departure && selected
      ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[departure.longitude, departure.latitude], [selected.aerodrome.longitude, selected.aerodrome.latitude]] } }]
      : [];

  const set = (id: string, features: GeoJSON.Feature[]) => {
    const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    if (map.getSource(id)) map.getSource(id).setData(data);
    else map.addSource(id, { type: "geojson", data });
  };
  set("planner-range", rings);
  set("planner-route", route);
  if (!map.getLayer("planner-range")) {
    map.addLayer({
      id: "planner-range",
      type: "line",
      source: "planner-range",
      paint: {
        "line-color": ["match", ["get", "kind"], "round-trip", "#1d4ed8", "#64748b"],
        "line-width": 2,
        "line-dasharray": ["match", ["get", "kind"], "round-trip", ["literal", [1, 0]], ["literal", [3, 2]]],
      },
    });
  }
  if (!map.getLayer("planner-route")) {
    map.addLayer({ id: "planner-route", type: "line", source: "planner-route", paint: { "line-color": "#c2410c", "line-width": 3 } });
  }
}

export function PlannerMap({ departure, results, ranges }: { departure: AerodromeOption | null; results: PlannerResult[]; ranges: PlannerRanges | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapStyle, setMapStyle] = useState<PlannerMapStyle>("osm");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = results.find((r) => r.aerodrome.id === selectedId) ?? null;
  const overlaysRef = useRef<Overlays>({ departure, ranges, selected });
  overlaysRef.current = { departure, ranges, selected };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    import("maplibre-gl").then((ml) => {
      if (cancelled || !containerRef.current) return;
      // @ts-ignore
      import("maplibre-gl/dist/maplibre-gl.css");

      const map = new ml.Map({
        container: containerRef.current,
        style: PLANNER_MAP_STYLES.osm as any,
        center: [2.3, 46.6],
        zoom: 6,
      });

      map.addControl(new ml.NavigationControl(), "top-right");
      map.on("load", () => setMapLoaded(true));
      map.on("style.load", () => drawOverlays(map, overlaysRef.current));
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

  useEffect(() => {
    if (mapRef.current && mapLoaded) drawOverlays(mapRef.current, { departure, ranges, selected });
  }, [mapLoaded, departure, ranges, selected]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    import("maplibre-gl").then((ml) => {
      if (!mapRef.current) return;

      if (departure) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:16px;height:16px;border-radius:50%;background:var(--horizon-700);border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)";
        const popup = new ml.Popup({ offset: 10, closeButton: false }).setDOMContent(
          popupContent([
            { text: departure.name, style: { fontSize: "12px", fontWeight: "600" } },
            { text: "Départ", style: { fontSize: "11px", color: "var(--ink-500)" } },
          ]),
        );
        const marker = new ml.Marker({ element: el })
          .setLngLat([departure.longitude, departure.latitude])
          .setPopup(popup)
          .addTo(mapRef.current!);
        el.addEventListener("click", () => marker.togglePopup());
        markersRef.current.push(marker);
      }

      for (const r of results) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:10px;height:10px;border-radius:50%;background:var(--terrain-500);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3);cursor:pointer";

        const content = popupContent([
          { text: r.aerodrome.name, style: { fontSize: "12px", fontWeight: "600" } },
          {
            text: `${r.aerodrome.icaoCode ?? ""}${r.aerodrome.city ? ` · ${r.aerodrome.city}` : ""}`,
            style: { fontSize: "11px", color: "var(--ink-500)" },
          },
          {
            text: `${formatFlightTime(r.timeHours)} · ${formatNm(r.distanceNm)}${r.estimatedCost > 0 ? ` · ${formatEuros(r.estimatedCost)}` : ""}`,
            style: { fontSize: "11px", marginTop: "4px" },
          },
        ]);
        const link = document.createElement("a");
        link.href = `/aerodrome/${encodeURIComponent(r.aerodrome.id)}`;
        link.textContent = "Voir la fiche →";
        Object.assign(link.style, { color: "var(--horizon-700)", fontSize: "11px" });
        content.append(link);
        const popup = new ml.Popup({ offset: 8, closeButton: false }).setDOMContent(content);

        const marker = new ml.Marker({ element: el })
          .setLngLat([r.aerodrome.longitude, r.aerodrome.latitude])
          .setPopup(popup)
          .addTo(mapRef.current!);
        el.addEventListener("click", () => {
          marker.togglePopup();
          setSelectedId(r.aerodrome.id);
        });
        markersRef.current.push(marker);
      }

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    map.setStyle(PLANNER_MAP_STYLES[mapStyle]);
  }, [mapStyle, mapLoaded]);

  return (
    <div style={{ position: "relative", width: "100%", borderRadius: 12, overflow: "hidden", border: "1px solid var(--ink-200)", height: 580 }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      {ranges && (
        <div style={{
          position: "absolute", left: 12, top: 12, zIndex: 10, padding: "8px 10px",
          background: "white", border: "1px solid var(--ink-300)", borderRadius: 6,
          boxShadow: "var(--shadow-pop)", fontSize: 11, color: "var(--ink-700)", lineHeight: 1.6,
        }}>
          {ranges.roundTripNm != null && (
            <div><span style={{ display: "inline-block", width: 18, borderTop: "2px solid #1d4ed8", verticalAlign: "middle", marginRight: 6 }} />Aller-retour sans plein · {formatNm(ranges.roundTripNm)}</div>
          )}
          <div><span style={{ display: "inline-block", width: 18, borderTop: "2px dashed #64748b", verticalAlign: "middle", marginRight: 6 }} />{ranges.roundTripNm != null ? "Avec plein sur place" : "Autonomie utile"} · {formatNm(ranges.oneWayNm)}</div>
          {selected && <div><span style={{ display: "inline-block", width: 18, borderTop: "3px solid #c2410c", verticalAlign: "middle", marginRight: 6 }} />Vers {selected.aerodrome.icaoCode ?? selected.aerodrome.name}</div>}
        </div>
      )}
      <div style={{
        position: "absolute", left: 12, bottom: 32, zIndex: 10,
        display: "flex", borderRadius: 6, overflow: "hidden",
        border: "1px solid var(--ink-300)", background: "white",
        boxShadow: "var(--shadow-pop)",
      }}>
        {(["osm", "satellite", "hybrid"] as const).map((s, i) => (
          <button
            key={s}
            onClick={() => setMapStyle(s)}
            style={{
              padding: "6px 12px", fontSize: 12, fontWeight: 500,
              fontFamily: "var(--f-sans)", cursor: "pointer",
              borderLeft: i > 0 ? "1px solid var(--ink-200)" : "none",
              background: mapStyle === s ? "var(--ink-950)" : "transparent",
              color: mapStyle === s ? "white" : "var(--ink-700)",
              border: "none",
            }}
          >
            {s === "osm" ? "Plan" : s === "satellite" ? "Satellite" : "Hybride"}
          </button>
        ))}
      </div>
    </div>
  );
}
