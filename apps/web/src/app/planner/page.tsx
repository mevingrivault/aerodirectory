"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { cn, formatNm, formatFlightTime, formatEuros } from "@/lib/utils";
import Link from "next/link";
import type { PlannerResult, SavedSearchItem } from "@aerodirectory/shared";

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
  excludeVisited: boolean;
}

type SearchMode = "time" | "cost" | "unlimited";
type TripScope = "outbound" | "round_trip";
type SortBy = "time" | "cost" | "distance" | "region";

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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

// ─── SVG Icons ──────────────────────────────────────────────────────────────

const IcoSearch = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
  </svg>
);
const IcoPlane = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.8 19.2 16 11l3.5-3.5c.6-.6.8-1.4.6-2.1-.3-.8-1-1.3-1.8-1.5-.8-.1-1.6.1-2.1.6L12.7 8 4 6.4 2.4 8 9 12l-3 3H2l2 3 3 2 3-4v-4l4 6.6 1.8-1.4Z"/>
  </svg>
);
const IcoClock = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
  </svg>
);
const IcoSettings = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const IcoFilter = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z"/>
  </svg>
);
const IcoSort = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/>
  </svg>
);
const IcoNav = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22,strokeWidth:"1.5"}}>
    <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
  </svg>
);
const IcoNavIco = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
  </svg>
);
const IcoMapPin = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const IcoChevronDown = () => (
  <svg style={{width:16,height:16,color:"var(--ink-500)",transition:"transform .2s"}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6"/>
  </svg>
);
const IcoX = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
  </svg>
);
const IcoPlus = () => (
  <svg className="ico" style={{width:12,height:12}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="M12 5v14"/>
  </svg>
);
const IcoTrash = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
  </svg>
);
const IcoCheck = () => (
  <svg style={{width:14,height:14,color:"var(--horizon-700)"}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 13 4 4L19 7"/>
  </svg>
);
const IcoList = () => (
  <svg style={{width:12,height:12,verticalAlign:"-2px",marginRight:4}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/>
  </svg>
);
const IcoMapView = () => (
  <svg style={{width:12,height:12,verticalAlign:"-2px",marginRight:4}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6 9 4l6 2 5-2v14l-5 2-6-2-5 2V6Z"/><path d="M9 4v16"/><path d="M15 6v16"/>
  </svg>
);
const IcoDownload = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>
  </svg>
);
const IcoSave = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
  </svg>
);
const IcoGlobe = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);
const IcoBookmark = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
  </svg>
);
const IcoInfo = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
  </svg>
);

// ─── PlannerMap ─────────────────────────────────────────────────────────────

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

function PlannerMap({ departure, results }: { departure: AerodromeOption | null; results: PlannerResult[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapStyle, setMapStyle] = useState<PlannerMapStyle>("osm");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    import("maplibre-gl").then((ml) => {
      if (cancelled || !containerRef.current) return;
      // @ts-ignore
      import("maplibre-gl/dist/maplibre-gl.css");

      const map = new ml.default.Map({
        container: containerRef.current,
        style: PLANNER_MAP_STYLES.osm as any,
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
        const popup = new ml.default.Popup({ offset: 10, closeButton: false }).setHTML(
          `<div style="font-size:12px;font-weight:600">${departure.name}</div>
           <div style="font-size:11px;color:var(--ink-500)">Départ</div>`,
        );
        const marker = new ml.default.Marker({ element: el })
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

        const popup = new ml.default.Popup({ offset: 8, closeButton: false }).setHTML(
          `<div style="font-size:12px">
            <div style="font-weight:600">${r.aerodrome.name}</div>
            <div style="color:var(--ink-500);font-size:11px">${r.aerodrome.icaoCode ?? ""}${r.aerodrome.city ? ` · ${r.aerodrome.city}` : ""}</div>
            <div style="margin-top:4px;font-size:11px">
              ${formatFlightTime(r.timeHours)} · ${formatNm(r.distanceNm)}
              ${r.estimatedCost > 0 ? ` · ${formatEuros(r.estimatedCost)}` : ""}
            </div>
            <a href="/aerodrome/${r.aerodrome.id}" style="color:var(--horizon-700);font-size:11px">Voir la fiche →</a>
           </div>`,
        );

        const marker = new ml.default.Marker({ element: el })
          .setLngLat([r.aerodrome.longitude, r.aerodrome.latitude])
          .setPopup(popup)
          .addTo(mapRef.current!);
        el.addEventListener("click", () => marker.togglePopup());
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

// ─── ResultRow ───────────────────────────────────────────────────────────────

function ResultRow({ result: r, tripScope }: { result: PlannerResult; tripScope: TripScope }) {
  const displayTime = tripScope === "round_trip" ? r.tripTimeHours : r.timeHours;
  const displayFuel = tripScope === "round_trip" ? r.tripFuelLiters : r.fuelUsedLiters;
  const isUlm = r.aerodrome.aerodromeType === "ULTRALIGHT_FIELD";
  const isHydro = r.aerodrome.aerodromeType === "SEAPLANE_BASE";

  return (
    <Link href={`/aerodrome/${r.aerodrome.id}`} style={{ textDecoration: "none" }}>
      <div className="result-row">
        <div className={cn("result-ico", isUlm && "ulm", isHydro && "hydro")}>
          <IcePlane />
        </div>
        <div className="result-main">
          <div className="result-head">
            <span className="result-name">{r.aerodrome.name}</span>
            {r.aerodrome.icaoCode && (
              <span className="badge badge-oaci">{r.aerodrome.icaoCode}</span>
            )}
            {r.aerodrome.status === "OPEN" && <span className="badge badge-vfr">Ouvert</span>}
            {r.aerodrome.city && <span className="result-city">{r.aerodrome.city}</span>}
          </div>
          <div className="result-line">
            <span><span className="mono">{formatNm(r.distanceNm)}</span></span>
            <span className="sep" />
            <span>◷ <span className="mono">{formatFlightTime(displayTime)}{tripScope === "round_trip" ? " A/R" : ""}</span></span>
            <span className="sep" />
            <span>⛽ <span className="mono">{displayFuel.toFixed(1)} L</span></span>
            {r.aerodrome.maxRunwayLength && (
              <>
                <span className="sep" />
                <span><span className="mono">{r.aerodrome.maxRunwayLength} m piste</span></span>
              </>
            )}
            {r.aerodrome.elevation != null && (
              <>
                <span className="sep" />
                <span><span className="mono">{r.aerodrome.elevation} ft</span></span>
              </>
            )}
          </div>
          {(r.aerodrome.hasRestaurant || r.aerodrome.hasAccommodation || r.aerodrome.hasTransport || r.aerodrome.hasBikes || r.aerodrome.fuels.length > 0) && (
            <div className="result-amen">
              {r.aerodrome.hasRestaurant && (
                <span className="amen">
                  <RestaurantIcon />
                  Restaurant
                </span>
              )}
              {r.aerodrome.hasAccommodation && (
                <span className="amen">
                  <HomeIcon />
                  Hébergement
                </span>
              )}
              {r.aerodrome.hasTransport && (
                <span className="amen">
                  <BusIcon />
                  Transport
                </span>
              )}
              {r.aerodrome.hasBikes && (
                <span className="amen">
                  <BikeIcon />
                  Vélo
                </span>
              )}
              {r.aerodrome.fuels.map((fuel: string) => {
                const label = fuel === "AVGAS_100LL" ? "100LL" : fuel === "SP98" ? "SP98" : fuel === "UL91" ? "UL91" : null;
                return label ? (
                  <span key={fuel} className="amen fuel">
                    <FuelIcon />
                    {label}
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>
        <div className="result-right">
          {r.estimatedCost > 0 && (
            <div className="result-price">
              <div className="result-price-val">
                {r.estimatedCost.toFixed(2).replace(".", ",")} <span className="unit">€</span>
              </div>
              <div className="result-price-sub">avec redevance</div>
            </div>
          )}
          <svg className="ico result-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </div>
      </div>
    </Link>
  );
}

function IcePlane() {
  return <IcoPlane />;
}

function RestaurantIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11V4a1 1 0 0 1 2 0v7"/><path d="M7 11V4a1 1 0 0 1 2 0v7"/>
      <path d="M11 4v11c0 1 1 2 2 2h1v6"/><path d="M16 14c0-6 3-10 5-10v17"/>
    </svg>
  );
}
function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h16"/><path d="M4 20V10l8-6 8 6v10"/><path d="M9 20v-6h6v6"/>
    </svg>
  );
}
function BusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2-3h6l2 3h4"/><rect x="3" y="12" width="18" height="7" rx="1"/>
    </svg>
  );
}
function BikeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/>
      <path d="M6 18 9 9h6l3 9"/><path d="m9 9 3-5h3"/>
    </svg>
  );
}
function FuelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 6h14v12H5z"/><path d="M9 6V4h6v2"/>
    </svg>
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
  const [minDistanceKm, setMinDistanceKm] = useState("0");

  // ── Filters ──
  const [filters, setFilters] = useState<PlannerFilters>({
    hasRestaurant: false,
    hasTransport: false,
    hasBikes: false,
    hasAccommodation: false,
    fuel100LL: false,
    fuelSP98: false,
    excludeVisited: false,
  });

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

  // ── Mobile drawer ──
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
      setProfileForm({ name: "", tas: "", fuelConsumption: "", hourlyCost: "", fuelRange: "", minRunwayLength: "", allowedSurfaces: DEFAULT_SURFACES });
    },
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
    });
  };

  const buildPlannerSearchParams = useCallback(() => {
    const params: Record<string, string> = {
      searchMode, tripScope, reserveMinutes: String(reserveMinutes), sortBy,
      departureGroundMinutes, arrivalGroundMinutes, minDistanceKm, fuelPricePerLiter,
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
  }, [arrivalGroundMinutes, departureAerodrome, departureGroundMinutes, filters, fuelPricePerLiter, maxCost, maxTimeMinutes, minCost, minDistanceKm, minTimeMinutes, reserveMinutes, searchMode, selectedProfileId, sortBy, tripScope, viewMode]);

  const applySavedPlannerSearch = useCallback(async (saved: SavedSearchItem) => {
    const params = saved.params ?? {};
    setSearchMode((params["searchMode"] as SearchMode) || "time");
    setTripScope((params["tripScope"] as TripScope) || "round_trip");
    setReserveMinutes(Number(params["reserveMinutes"] ?? "30"));
    setSortBy((params["sortBy"] as SortBy) || "time");
    setViewMode((params["viewMode"] as "list" | "map") || "list");
    setDepartureGroundMinutes(params["departureGroundMinutes"] ?? "0");
    setArrivalGroundMinutes(params["arrivalGroundMinutes"] ?? "0");
    setMinDistanceKm(params["minDistanceKm"] ?? "0");
    setFuelPricePerLiter(params["fuelPricePerLiter"] ?? "");
    setMaxTimeMinutes(Number(params["maxTimeMinutes"] ?? "60"));
    setMinTimeMinutes(params["minTimeMinutes"] ?? "");
    setMaxCost(Number(params["maxCost"] ?? "100"));
    setMinCost(params["minCost"] ?? "");
    setFilters({
      hasRestaurant: params["hasRestaurant"] === "true",
      hasTransport: params["hasTransport"] === "true",
      hasBikes: params["hasBikes"] === "true",
      hasAccommodation: params["hasAccommodation"] === "true",
      fuel100LL: params["fuel100LL"] === "true",
      fuelSP98: params["fuelSP98"] === "true",
      excludeVisited: params["excludeVisited"] === "true",
    });
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
      const { excludeVisited, ...destinationFilters } = activeFilters as PlannerFilters;
      if (excludeVisited) payload.excludeVisited = true;
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

  const handleExportBriefing = () => {
    if (!sortedResults || sortedResults.length === 0) return;
    const briefing = [
      "BRIEFING PLANIFICATEUR NAVVENTURA",
      `Date: ${new Date().toLocaleString("fr-FR")}`,
      `Depart: ${departureAerodrome?.name ?? "-"}`,
      `Profile: ${selectedProfile?.name ?? "-"}`,
      `Mode: ${searchMode}`, `Scope: ${tripScope}`,
      `Resultats: ${sortedResults.length}`, "",
      ...sortedResults.slice(0, 30).map((r, i) =>
        `${i + 1}. ${r.aerodrome.name} (${r.aerodrome.icaoCode ?? "N/A"}) - ${formatNm(r.distanceNm)} - ${formatFlightTime(r.tripTimeHours)} - ${formatEuros(r.estimatedCost)}`
      ),
      "", "Rappel: verifier AIP/NOTAM/METEO avant le vol.",
    ].join("\n");
    downloadFile(`briefing-${new Date().toISOString().slice(0, 10)}.txt`, briefing, "text/plain;charset=utf-8");
  };

  const handleExportPdf = () => {
    if (!sortedResults || sortedResults.length === 0) return;
    const rows = sortedResults.slice(0, 50).map((r) =>
      `<tr><td>${escapeHtml(r.aerodrome.name)}</td><td>${escapeHtml(r.aerodrome.icaoCode ?? "")}</td><td>${r.distanceNm} NM</td><td>${r.tripTimeHours} h</td><td>${r.estimatedCost} EUR</td></tr>`
    ).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Briefing PDF</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin:0 0 8px}p{margin:0 0 12px;color:#555}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f7f7f7}</style></head><body><h1>Briefing vol</h1><p>${escapeHtml(departureAerodrome?.name ?? "-")} - ${escapeHtml(selectedProfile?.name ?? "-")} - ${new Date().toLocaleString("fr-FR")}</p><table><thead><tr><th>Destination</th><th>ICAO</th><th>Distance</th><th>Temps</th><th>Cout</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
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
      <style>{`
        .planner-layout {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 24px;
          align-items: start;
        }
        .planner-sidebar {
          display: flex;
          flex-direction: column;
          gap: 18px;
          padding-right: 4px;
          padding-bottom: 24px;
          font-size: 13px;
        }
        .planner-panel {
          background: white;
          border: 1px solid var(--ink-200);
          border-radius: 12px;
          overflow: hidden;
        }
        .planner-panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 18px;
          border-bottom: 1px solid var(--ink-200);
        }
        .planner-panel-head.collapsed-head {
          border-bottom: 0;
        }
        .planner-panel-head-l {
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--ink-500);
        }
        .planner-panel-title {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--ink-800);
        }
        .planner-panel-body {
          padding: 18px 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .planner-panel-link {
          font-size: 12px;
          font-weight: 500;
          color: var(--horizon-700);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: none;
          border: 0;
          padding: 0;
        }
        .planner-input {
          height: 40px;
          width: 100%;
          padding: 0 12px 0 36px;
          background: var(--paper-50);
          border: 1px solid var(--ink-200);
          border-radius: 8px;
          font-family: var(--f-sans);
          font-size: 13px;
          color: var(--ink-950);
          transition: all .15s;
        }
        .planner-input.no-ico { padding-left: 12px; }
        .planner-input::placeholder { color: var(--ink-500); }
        .planner-input:focus {
          outline: none;
          border-color: var(--horizon-700);
          background: white;
          box-shadow: 0 0 0 3px var(--horizon-100);
        }
        .planner-input-wrap { position: relative; }
        .planner-input-wrap .ico-abs {
          position: absolute; left: 12px; top: 50%;
          transform: translateY(-50%); color: var(--ink-500);
          pointer-events: none;
        }
        .planner-input-clear {
          position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
          width: 22px; height: 22px; border-radius: 50%;
          display: grid; place-items: center;
          background: var(--ink-200); color: var(--ink-700);
          cursor: pointer; border: 0;
        }
        .planner-dep-selected {
          padding: 12px 14px;
          background: var(--horizon-100);
          border: 1px solid var(--horizon-600);
          border-radius: 8px;
          display: flex; flex-direction: column; gap: 2px;
        }
        .planner-dep-name {
          display: flex; align-items: center; gap: 8px;
        }
        .planner-dep-name strong {
          font-size: 13px; color: var(--horizon-900); font-weight: 600;
        }
        .planner-dep-meta {
          font-size: 11px; color: var(--horizon-800); opacity: 0.85;
          font-family: var(--f-mono);
        }
        .planner-badge-oaci {
          font-family: var(--f-mono);
          font-weight: 500;
          background: white;
          color: var(--ink-950);
          border: 1px solid var(--ink-300);
          letter-spacing: 0.08em;
          height: 20px; font-size: 10px;
          display: inline-flex; align-items: center;
          padding: 0 7px; border-radius: 4px;
        }
        .planner-ac-item {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px;
          border: 1px solid var(--ink-200);
          border-radius: 8px;
          background: var(--paper-50);
          cursor: pointer;
          transition: all .15s;
        }
        .planner-ac-item:hover { border-color: var(--ink-400); }
        .planner-ac-item.active {
          background: var(--horizon-100);
          border-color: var(--horizon-600);
        }
        .planner-ac-badge {
          width: 30px; height: 30px; border-radius: 6px;
          background: white; border: 1px solid var(--ink-200);
          display: grid; place-items: center;
          color: var(--ink-700); flex-shrink: 0;
        }
        .planner-ac-item.active .planner-ac-badge {
          border-color: var(--horizon-600); color: var(--horizon-700);
        }
        .planner-ac-name {
          font-size: 13px; font-weight: 600; color: var(--ink-950);
          display: flex; align-items: center; gap: 6px;
        }
        .planner-ac-specs {
          font-size: 11px; color: var(--ink-500);
          font-family: var(--f-mono); margin-top: 2px;
        }
        .planner-ac-del {
          width: 28px; height: 28px; border-radius: 6px;
          background: transparent; border: 0; cursor: pointer;
          color: var(--ink-400); display: grid; place-items: center;
          flex-shrink: 0;
        }
        .planner-ac-del:hover { color: oklch(0.45 0.15 25); background: var(--paper-100); }
        .planner-seg {
          display: flex;
          background: var(--paper-100);
          border: 1px solid var(--ink-200);
          border-radius: 8px;
          padding: 3px; gap: 3px;
        }
        .planner-seg button {
          flex: 1; height: 30px;
          background: transparent; border: 0; border-radius: 6px;
          font-size: 12px; font-weight: 500; color: var(--ink-700);
          cursor: pointer; transition: all .15s; font-family: inherit;
        }
        .planner-seg button:hover { color: var(--ink-950); }
        .planner-seg button.active {
          background: white; color: var(--ink-950);
          box-shadow: 0 1px 2px rgba(20,30,50,.06), 0 1px 1px rgba(20,30,50,.04);
        }
        .planner-seg.small button { height: 26px; font-size: 11px; }
        .planner-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .planner-field-label {
          font-size: 11px; color: var(--ink-500); margin-bottom: 4px; font-weight: 500;
        }
        .planner-field-suffix { position: relative; }
        .planner-field-suffix .suffix {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          font-size: 11px; color: var(--ink-500); font-family: var(--f-mono);
          pointer-events: none;
        }
        .planner-field-suffix .planner-input { padding-right: 36px; font-family: var(--f-mono); }
        .planner-check {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; color: var(--ink-800); cursor: pointer; padding: 4px 0;
        }
        .planner-check input { display: none; }
        .planner-check-box {
          width: 16px; height: 16px; border-radius: 4px;
          border: 1.5px solid var(--ink-300);
          display: grid; place-items: center;
          background: white; flex-shrink: 0;
          transition: all .15s;
        }
        .planner-check input:checked + .planner-check-box {
          background: var(--horizon-700); border-color: var(--horizon-700);
        }
        .planner-check input:checked + .planner-check-box::after {
          content: "";
          width: 8px; height: 5px;
          border-left: 2px solid white; border-bottom: 2px solid white;
          transform: rotate(-45deg) translate(1px, -1px);
        }
        .planner-pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 10px;
          font-size: 12px; font-weight: 500;
          border: 1px solid var(--ink-300); border-radius: 999px;
          color: var(--ink-700); background: white;
          cursor: pointer; transition: all .15s;
          font-family: inherit;
        }
        .planner-pill:hover { border-color: var(--ink-400); }
        .planner-pill.active {
          background: var(--horizon-100);
          border-color: var(--horizon-600);
          color: var(--horizon-900);
        }
        .planner-pill-group { display: flex; flex-wrap: wrap; gap: 6px; }
        .planner-eyebrow {
          font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.12em;
          color: var(--ink-500);
        }
        .planner-btn-primary {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          height: 44px; padding: 0 18px; width: 100%;
          border-radius: 8px; font-family: var(--f-sans); font-size: 14px; font-weight: 500;
          cursor: pointer; border: 0;
          background: var(--horizon-700); color: white;
          transition: background .15s;
        }
        .planner-btn-primary:hover { background: var(--horizon-900); }
        .planner-btn-primary:disabled {
          opacity: 0.5; cursor: not-allowed;
        }
        .planner-btn-secondary {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          height: 32px; padding: 0 10px;
          border-radius: 8px; font-family: var(--f-sans); font-size: 12px; font-weight: 500;
          cursor: pointer;
          background: white; color: var(--ink-950);
          border: 1px solid var(--ink-300);
          transition: all .15s;
        }
        .planner-btn-secondary:hover {
          background: var(--paper-100); border-color: var(--ink-400);
        }
        .planner-btn-ghost {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          height: 32px; padding: 0 10px;
          border-radius: 8px; font-family: var(--f-sans); font-size: 12px; font-weight: 500;
          cursor: pointer; background: transparent; color: var(--ink-700); border: 0;
          transition: all .15s;
        }
        .planner-btn-ghost:hover { background: var(--paper-100); color: var(--ink-950); }
        .planner-suggestions {
          position: absolute; z-index: 20; width: 100%; margin-top: 4px;
          background: white; border: 1px solid var(--ink-200);
          border-radius: 8px; overflow: hidden;
          box-shadow: 0 12px 32px -12px rgba(20,30,50,.18);
        }
        .planner-suggestion-item {
          width: 100%; text-align: left; padding: 10px 14px;
          background: none; border: 0; cursor: pointer;
          border-bottom: 1px solid var(--ink-100);
          font-family: inherit;
        }
        .planner-suggestion-item:last-child { border-bottom: 0; }
        .planner-suggestion-item:hover { background: var(--paper-50); }
        .planner-surface-btn {
          font-size: 11px; border-radius: 4px;
          padding: 4px 8px; border: 1px solid var(--ink-300);
          background: white; color: var(--ink-700);
          cursor: pointer; font-family: inherit; transition: all .15s;
        }
        .planner-surface-btn.active {
          background: var(--horizon-700); color: white; border-color: var(--horizon-700);
        }
        .planner-home-shortcut {
          width: 100%; text-align: left; font-size: 12px; font-weight: 500;
          border: 1px dashed var(--horizon-600); border-radius: 6px;
          padding: 8px 12px; color: var(--horizon-700);
          background: transparent; cursor: pointer; font-family: inherit;
          transition: background .15s;
        }
        .planner-home-shortcut:hover { background: var(--horizon-50); }

        /* Results */
        .planner-results-head {
          display: flex; align-items: center; justify-content: space-between;
          gap: 16px; margin-bottom: 16px; flex-wrap: wrap;
        }
        .planner-results-count { font-size: 13px; color: var(--ink-700); }
        .planner-results-count strong { color: var(--ink-950); font-weight: 600; }
        .planner-results-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .planner-warning {
          padding: 10px 14px;
          background: oklch(0.95 0.05 80);
          border: 1px solid oklch(0.85 0.08 80);
          border-radius: 8px;
          font-size: 12px; color: oklch(0.45 0.10 80);
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 16px;
        }
        .planner-error {
          padding: 12px 16px;
          background: oklch(0.96 0.04 25);
          border: 1px solid oklch(0.87 0.08 25);
          border-radius: 8px;
          font-size: 13px; color: oklch(0.45 0.15 25);
          margin-bottom: 16px;
        }
        .planner-empty {
          background: white; border: 1px solid var(--ink-200);
          border-radius: 12px; padding: 64px 32px; text-align: center;
        }
        .planner-region {
          background: white; border: 1px solid var(--ink-200);
          border-radius: 12px; overflow: hidden; margin-bottom: 14px;
        }
        .planner-region-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 20px;
          background: var(--paper-50); border-bottom: 1px solid var(--ink-200);
          cursor: pointer;
          font-family: var(--f-mono); font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-800);
        }
        .planner-region.collapsed .planner-region-head { border-bottom: 0; }
        .planner-region-count {
          display: inline-grid; place-items: center;
          min-width: 22px; height: 20px; padding: 0 6px;
          background: white; border: 1px solid var(--ink-300);
          border-radius: 999px; font-size: 11px; font-weight: 600;
          color: var(--ink-700); font-family: var(--f-sans); letter-spacing: 0;
        }
        .planner-region-chevron { color: var(--ink-500); transition: transform .2s; }
        .planner-region.collapsed .planner-region-chevron { transform: rotate(-90deg); }
        .result-row {
          display: grid; grid-template-columns: 36px 1fr auto;
          gap: 14px; padding: 16px 20px; align-items: center;
          border-bottom: 1px solid var(--ink-100);
          cursor: pointer; transition: background .15s;
          text-decoration: none;
        }
        .result-row:last-child { border-bottom: 0; }
        .result-row:hover { background: var(--paper-50); }
        .result-ico {
          width: 36px; height: 36px; border-radius: 6px;
          background: var(--paper-100); border: 1px solid var(--ink-200);
          display: grid; place-items: center; color: var(--ink-700);
        }
        .result-ico.ulm { background: var(--terrain-100); border-color: oklch(0.80 0.06 130); color: var(--terrain-800); }
        .result-ico.hydro { background: oklch(0.94 0.05 220); border-color: oklch(0.82 0.06 220); color: oklch(0.45 0.12 220); }
        .result-main { min-width: 0; }
        .result-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
        .result-name { font-size: 14px; font-weight: 600; color: var(--ink-950); letter-spacing: 0.01em; }
        .result-city { font-size: 13px; color: var(--ink-500); }
        .result-line { display: flex; align-items: center; flex-wrap: wrap; font-size: 12px; color: var(--ink-500); gap: 0; }
        .result-line span { display: inline-flex; align-items: center; gap: 4px; }
        .result-line .mono { color: var(--ink-700); font-size: 12px; font-family: var(--f-mono); }
        .result-line .sep { width: 3px; height: 3px; border-radius: 50%; background: var(--ink-300); margin: 0 10px; }
        .result-amen { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
        .amen {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; color: var(--ink-700);
          padding: 3px 8px 3px 7px; border: 1px solid var(--ink-200);
          border-radius: 999px; background: var(--paper-50);
        }
        .amen svg { width: 11px; height: 11px; stroke-width: 1.8; flex-shrink: 0; }
        .amen.fuel { color: var(--horizon-900); background: var(--horizon-100); border-color: oklch(0.85 0.04 250); }
        .result-right { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
        .result-price { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .result-price-val {
          font-family: var(--f-serif); font-weight: 500;
          font-size: 20px; line-height: 1; color: var(--ink-950); letter-spacing: -0.01em;
        }
        .result-price-val .unit { font-family: var(--f-sans); font-size: 12px; color: var(--ink-500); font-weight: 500; margin-left: 2px; }
        .result-price-sub { font-size: 11px; color: var(--ink-500); font-family: var(--f-mono); }
        .result-chevron { color: var(--ink-400); }
        .result-row:hover .result-chevron { color: var(--horizon-700); }
        .badge { display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 7px; border-radius: 4px; font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
        .badge-oaci { font-family: var(--f-mono); font-weight: 500; background: var(--paper-100); color: var(--ink-950); border: 1px solid var(--ink-300); letter-spacing: 0.08em; height: 20px; font-size: 10px; }
        .badge-vfr { background: var(--vfr-100); color: var(--vfr-700); }
        .badge-vfr::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: var(--vfr-500); }

        /* Mobile FAB + drawer */
        .planner-fab {
          display: none; position: fixed; right: 16px; bottom: 16px; z-index: 25;
          height: 52px; padding: 0 18px; border-radius: 999px;
          background: var(--ink-950); color: white; border: 0;
          box-shadow: 0 12px 32px -12px rgba(20,30,50,.18);
          font-size: 14px; font-weight: 500;
          align-items: center; gap: 8px; cursor: pointer; font-family: inherit;
        }
        .planner-scrim {
          display: none; position: fixed; inset: 0;
          background: rgba(20, 30, 50, 0.4); z-index: 45;
        }
        .planner-sidebar-mobile-head {
          display: none; align-items: center; justify-content: space-between;
          padding-bottom: 14px; margin-bottom: 4px;
          border-bottom: 1px solid var(--ink-200);
        }
        .planner-saved-panel {
          background: white; border: 1px solid var(--ink-200); border-radius: 12px;
          padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;
        }
        .planner-saved-label {
          display: flex; align-items: center; gap: 8px;
          font-size: 12px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.1em; color: var(--ink-800);
        }
        .planner-saved-select {
          height: 38px; width: 100%;
          background: var(--paper-50); border: 1px solid var(--ink-200);
          border-radius: 8px; font-family: var(--f-sans); font-size: 13px;
          color: var(--ink-950); padding: 0 12px;
        }

        /* Create profile form */
        .planner-form { display: flex; flex-direction: column; gap: 12px; padding: 14px; border: 1px solid var(--ink-200); border-radius: 10px; background: var(--paper-50); }

        @media (max-width: 1200px) {
          .planner-layout { grid-template-columns: 290px 1fr; gap: 20px; }
        }
        @media (max-width: 960px) {
          .planner-layout { grid-template-columns: 1fr; }
          .planner-sidebar {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            max-height: 100dvh; background: var(--paper-50);
            z-index: 50; padding: 20px; overflow-y: auto;
            transform: translateX(-100%);
            transition: transform .25s cubic-bezier(.2,.8,.2,1);
          }
          .planner-sidebar.open { transform: translateX(0); }
          .planner-fab { display: inline-flex; }
          .planner-scrim { display: block; }
          .planner-sidebar-mobile-head { display: flex; }
          body.drawer-open .planner-fab { display: none; }
          body.drawer-open .planner-scrim { display: block; }
          body:not(.drawer-open) .planner-scrim { display: none; }
          .result-row { grid-template-columns: 32px 1fr auto; padding: 14px 16px; }
        }
        @media (max-width: 640px) {
          .result-row { grid-template-columns: 1fr; gap: 10px; padding: 14px; }
          .result-ico { display: none; }
          .result-right { width: 100%; justify-content: space-between; padding-top: 10px; border-top: 1px dashed var(--ink-200); }
          .planner-region-head { padding: 12px 14px; }
        }
      `}</style>

      {/* Mobile scrim */}
      <div
        className="planner-scrim"
        style={{ display: sidebarOpen ? "block" : "none" }}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Mobile FAB */}
      <button className="planner-fab" onClick={() => setSidebarOpen(true)}>
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

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 32px 64px" }}>

        {/* Page head */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{
            display: "flex", alignItems: "center", gap: 14,
            fontFamily: "var(--f-serif)", fontWeight: 500,
            fontSize: 40, lineHeight: 1.05, letterSpacing: "-0.015em",
            margin: 0, color: "var(--ink-950)",
          }}>
            <span style={{
              width: 40, height: 40, borderRadius: 8,
              background: "var(--horizon-100)", color: "var(--horizon-700)",
              display: "grid", placeItems: "center",
            }}>
              <IcoNav />
            </span>
            Planificateur de vol
          </h1>
          <p style={{ fontSize: 15, color: "var(--ink-700)", margin: "10px 0 0 54px", maxWidth: 620 }}>
            Trouvez les destinations accessibles depuis votre terrain de départ, selon vos contraintes de temps et de budget.
          </p>
        </div>

        <div className="planner-layout">

          {/* ─── SIDEBAR ─── */}
          <aside className={cn("planner-sidebar", sidebarOpen && "open")}>

            {/* Mobile header */}
            <div className="planner-sidebar-mobile-head">
              <div style={{ fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: 22 }}>Filtres</div>
              <button className="planner-btn-ghost" onClick={() => setSidebarOpen(false)}>
                <IcoX /> Fermer
              </button>
            </div>

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
                          <div className="planner-ac-specs">{p.tas} kt · {p.fuelConsumption} L/h · {p.fuelRange} NM</div>
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
                <button className="planner-panel-link" onClick={() => setFilters({ hasRestaurant: false, hasTransport: false, hasBikes: false, hasAccommodation: false, fuel100LL: false, fuelSP98: false, excludeVisited: false })}>
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
                    <button className={cn("planner-pill", filters.fuelSP98 && "active")} onClick={() => toggleFilter("fuelSP98")}>SP98</button>
                  </div>
                </div>
                <label className="planner-check">
                  <input type="checkbox" checked={filters.excludeVisited} onChange={() => toggleFilter("excludeVisited")} />
                  <span className="planner-check-box"></span>
                  <span>Exclure les terrains déjà visités</span>
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

            {/* Saved searches */}
            {user && (
              <div className="planner-saved-panel">
                <div className="planner-saved-label">
                  <IcoBookmark />
                  Recherches sauvegardées
                </div>
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
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="planner-btn-secondary" onClick={handleSaveCurrentPlannerSearch} disabled={savePlannerSearchMutation.isPending}>
                    <IcoSave />
                    Sauvegarder
                  </button>
                  {selectedSavedSearchId && (
                    <>
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
                    </>
                  )}
                </div>
              </div>
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
                  <button className="planner-btn-secondary" onClick={handleExportBriefing}><IcoDownload />Briefing</button>
                  <button className="planner-btn-secondary" onClick={handleExportPdf}><IcoDownload />PDF</button>
                  <div className="planner-seg" style={{ marginLeft: 6 }}>
                    <button className={cn(viewMode === "list" && "active")} onClick={() => setViewMode("list")}>
                      <IcoList />Liste
                    </button>
                    <button className={cn(viewMode === "map" && "active")} onClick={() => setViewMode("map")}>
                      <IcoMapView />Carte
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
              <PlannerMap departure={departureAerodrome} results={sortedResults} />
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
                      Configurez votre départ, votre aéronef et la contrainte, puis lancez la recherche.
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
                                <ResultRow key={r.aerodrome.id} result={r} tripScope={tripScope} />
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
