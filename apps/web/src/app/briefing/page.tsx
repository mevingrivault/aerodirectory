"use client";

import { Fragment, Suspense, useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Plus, Printer, X } from "lucide-react";
import {
  FUEL_LABELS,
  windComponents,
  type AerodromeCommunityInfo,
  type BriefingField,
  type BriefingTrip,
} from "@aerodirectory/shared";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { formatEuros, formatFlightTime, formatNm } from "@/lib/utils";
import { communityInfoSummary, isStale, safeHttpUrl } from "@/lib/community-info";
import { OBSTACLE_LABELS, formatObstacleDistance, formatObstacleElevation, formatObstacleHeight, type NearbyObstacle } from "@/lib/obstacles";
import { aerialLineTitle, type NearbyAerialLine } from "@/lib/aerial-lines";
import { PROTECTED_AREA_LABELS, formatAreaDistance, type NearbyProtectedArea } from "@/lib/protected-areas";
import { WindRoseCard, type WindClimate } from "@/components/ui/wind-rose";
import { WebcamLinks } from "@/components/ui/community-info-card";

// ─── Types (as the API returns them) ─────────────────────────────────────────

interface AircraftProfile {
  id: string;
  name: string;
}

interface AerodromeOption {
  id: string;
  name: string;
  icaoCode: string | null;
}

interface OpeningSlot {
  day: number; // 0 = Monday
  from: string | null;
  to: string | null;
  byNotam: boolean;
  remarks: string | null;
}

interface FieldDetail {
  id: string;
  name: string;
  icaoCode: string | null;
  elevation: number | null;
  city: string | null;
  ppr: boolean;
  privateUse: boolean;
  skydiveActivity: boolean;
  winchOnly: boolean;
  nightOperations: boolean;
  phones: { label: string | null; number: string; remarks: string | null }[];
  contactInfo: string | null;
  openingHours: OpeningSlot[];
  sourceRemarks: string | null;
  runways: { id: string; identifier: string; length: number; width: number | null; trueHeading: number | null; surface: string; lighting: boolean; remarks: string | null }[];
  frequencies: { id: string; type: string; mhz: number; isPrimary: boolean; callsign: string | null; notes: string | null }[];
  fuels: { id: string; type: string; available: boolean; selfService: boolean; availabilityHours: string | null }[];
}

interface FieldDocuments {
  vacUrl: string | null;
  aipUrl: string | null;
  airac: string | null; // effective date of the cycle, YYYY-MM-DD
}

interface WeatherResult {
  icao: string;
  stationName: string | null;
  isNearest: boolean;
  distanceNm?: number;
  metar: {
    raw: string;
    observedAt: string;
    flight_category: string | null;
    wind: { degrees: number | null; speed_kts: number; gust_kts: number | null } | null;
  } | null;
  taf: { raw: string; issuedAt: string } | null;
}

interface SunTimes {
  sunrise: string | null;
  sunset: string | null;
  aeronauticalDayStart: string | null;
  aeronauticalDayEnd: string | null;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

const SURFACES: Record<string, string> = { ASPHALT: "Asphalte", CONCRETE: "Béton", GRASS: "Herbe", GRAVEL: "Gravier", DIRT: "Terre", WATER: "Eau", OTHER: "Autre" };
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const CATEGORIES: Record<string, string> = { ULM: "ULM", LIGHT: "avion ≤ 1,5 t", HEAVY: "avion > 1,5 t" };

const course = (deg: number | null) => (deg == null ? "—" : `${String(deg).padStart(3, "0")}°`);
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");
const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "UTC" });
const fieldName = (f: { name: string; icaoCode: string | null }) => (f.icaoCode ? `${f.icaoCode} — ${f.name}` : f.name);
const shortName = (f: { name: string; icaoCode: string | null }) => f.icaoCode ?? f.name;
const MAX_STOPS = 4;

/** openAIP codes kept on a route (see the API's ROUTE_AIRSPACE_TYPES). */
const AIRSPACE_TYPES: Record<number, string> = {
  1: "Zone R", 2: "Zone D", 3: "Zone P", 4: "CTR", 5: "TMA", 6: "RMZ", 7: "TMZ",
  11: "ATZ", 18: "HTZ", 19: "Secteur vol à voile", 21: "TIZ", 22: "TIA",
};

type Wind = NonNullable<NonNullable<WeatherResult["metar"]>["wind"]>;

/** Wind on the better end of a runway, gusts counted; null for a variable wind or an unknown heading. */
function runwayWind(wind: Wind, runway: { identifier: string; trueHeading: number | null }) {
  if (wind.degrees == null || runway.trueHeading == null) return null;
  const speed = Math.max(wind.speed_kts, wind.gust_kts ?? 0);
  const ends = runway.identifier.split("/").map((e) => e.trim());
  const options = [0, 180].map((offset, i) => ({
    end: ends[i] ?? (i === 0 ? runway.identifier : ""),
    ...windComponents(wind.degrees!, speed, (runway.trueHeading! + offset) % 360),
  }));
  return options[0]!.headwind >= options[1]!.headwind ? options[0]! : options[1]!;
}

const xml = (value: string) => value.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** GPX 1.1 route through the fields, for an EFB or a GPS. */
function downloadGpx(trip: BriefingTrip) {
  const points = [trip.departure, ...trip.stops, trip.destination, ...(trip.tripScope === "round_trip" ? [trip.departure] : [])];
  const name = points.map(shortName).join(" - ");
  const gpx = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="Navventura" xmlns="http://www.topografix.com/GPX/1/1">`,
    `  <rte>`,
    `    <name>${xml(name)}</name>`,
    ...points.map((p) => `    <rtept lat="${p.latitude.toFixed(6)}" lon="${p.longitude.toFixed(6)}"><name>${xml(shortName(p))}</name><desc>${xml(p.name)}</desc></rtept>`),
    `  </rte>`,
    `</gpx>`,
  ].join("\n");
  const url = URL.createObjectURL(new Blob([gpx], { type: "application/gpx+xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${points.map(shortName).join("-").replace(/[^A-Za-z0-9-]+/g, "_")}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}

function slotLabel(slot: OpeningSlot) {
  if (slot.byNotam) return "sur NOTAM";
  const time = (t: string | null) => (t === "SR" ? "lever du soleil" : t === "SS" ? "coucher du soleil" : t ?? "?");
  return `${time(slot.from)} – ${time(slot.to)}`;
}

// ─── Layout pieces ───────────────────────────────────────────────────────────

const card: CSSProperties = { background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 20, marginBottom: 16 };
const h2: CSSProperties = { fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: 20, margin: "0 0 12px" };
const h3: CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "14px 0 6px" };
const small: CSSProperties = { fontSize: 12, color: "var(--ink-500)" };
const mono: CSSProperties = { fontFamily: "var(--f-mono)" };
const warn: CSSProperties = { display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "oklch(0.95 0.06 75)", color: "oklch(0.45 0.12 60)", marginRight: 6 };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="brief-card" style={card}>
      <h2 style={h2}>{title}</h2>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "minmax(120px, auto) 1fr", columnGap: 16, rowGap: 6, fontSize: 14, margin: 0 }}>
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <dt style={{ color: "var(--ink-500)" }}>{label}</dt>
          <dd style={{ margin: 0 }}>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BriefingPage() {
  return (
    <Suspense fallback={null}>
      <BriefingContent />
    </Suspense>
  );
}

function BriefingContent() {
  const params = useSearchParams();
  const { user, loading } = useAuth();
  const from = params.get("from");
  const to = params.get("to");
  const profile = params.get("profile");

  if (loading) return null;
  if (!user) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold mb-4">Briefing</h1>
        <p><Link href="/login" className="underline">Connectez-vous</Link> pour préparer un vol avec vos profils d&apos;avion.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <style>{`
        @media print {
          header, footer, .no-print { display: none !important; }
          body { background: white !important; }
          .brief-card { break-inside: avoid; border-color: #ccc !important; }
        }
      `}</style>
      {from && to && profile ? (
        <Briefing params={params} />
      ) : (
        <BriefingForm
          initialFrom={from ?? user.homeAerodrome?.id ?? null}
          initialTo={to}
          initialVia={(params.get("via") ?? "").split(",").filter(Boolean)}
          initialProfile={profile}
        />
      )}
    </div>
  );
}

// ─── Form (direct access) ────────────────────────────────────────────────────

function AerodromePicker({ label, value, onChange }: { label: string; value: AerodromeOption | null; onChange: (v: AerodromeOption | null) => void }) {
  const [text, setText] = useState(value ? fieldName(value) : "");
  const [open, setOpen] = useState(false);
  useEffect(() => setText(value ? fieldName(value) : ""), [value]);
  const { data } = useQuery({
    queryKey: ["briefing-search", text],
    queryFn: () => apiClient.get<AerodromeOption[]>("/aerodromes/map", { q: text }),
    enabled: open && text.trim().length >= 2,
  });
  const options = (data?.data ?? []).slice(0, 8);

  return (
    <div style={{ position: "relative" }}>
      <label className="text-sm font-medium" style={{ display: "block", marginBottom: 4 }}>{label}</label>
      <input
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={text}
        placeholder="Code OACI ou nom"
        onChange={(e) => { setText(e.target.value); setOpen(true); onChange(null); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && options.length > 0 && (
        <ul style={{ position: "absolute", zIndex: 10, left: 0, right: 0, background: "white", border: "1px solid var(--ink-200)", borderRadius: 8, margin: "4px 0 0", padding: 4, listStyle: "none" }}>
          {options.map((o) => (
            <li key={o.id}>
              <button type="button" onMouseDown={() => { onChange(o); setOpen(false); }} style={{ width: "100%", textAlign: "left", padding: "6px 8px", background: "none", border: 0, cursor: "pointer", fontSize: 13 }}>
                {fieldName(o)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BriefingForm({ initialFrom, initialTo, initialVia, initialProfile }: { initialFrom: string | null; initialTo: string | null; initialVia: string[]; initialProfile: string | null }) {
  const router = useRouter();
  const [from, setFrom] = useState<AerodromeOption | null>(null);
  const [to, setTo] = useState<AerodromeOption | null>(null);
  const [stops, setStops] = useState<(AerodromeOption | null)[]>([]);
  const [profileId, setProfileId] = useState(initialProfile ?? "");
  const [scope, setScope] = useState<"round_trip" | "outbound">("round_trip");
  const [departure, setDeparture] = useState("");
  const [stay, setStay] = useState("60");

  const { data: profilesRes } = useQuery({ queryKey: ["profiles"], queryFn: () => apiClient.get<AircraftProfile[]>("/planner/profiles") });
  const profiles = profilesRes?.data ?? [];
  useEffect(() => {
    if (!profileId && profiles[0]) setProfileId(profiles[0].id);
  }, [profileId, profiles]);

  // Prefill from the sheet (destination) or the home field (departure).
  useEffect(() => {
    if (initialFrom) apiClient.get<AerodromeOption>(`/aerodromes/${initialFrom}`).then((r) => setFrom(r.data)).catch(() => undefined);
    if (initialTo) apiClient.get<AerodromeOption>(`/aerodromes/${initialTo}`).then((r) => setTo(r.data)).catch(() => undefined);
    Promise.all(initialVia.slice(0, MAX_STOPS).map((id) => apiClient.get<AerodromeOption>(`/aerodromes/${id}`).then((r) => r.data).catch(() => null)))
      .then(setStops);
  // initialVia is a fresh array each render; the ids come from the URL once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFrom, initialTo]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!from || !to || !profileId) return;
    const qs = new URLSearchParams({ from: from.id, to: to.id, profile: profileId, scope });
    const via = stops.filter((s): s is AerodromeOption => !!s).map((s) => s.id);
    if (via.length > 0) qs.set("via", via.join(","));
    if (departure) {
      const at = new Date(departure);
      if (!Number.isNaN(at.getTime())) qs.set("dep", at.toISOString());
    }
    if (scope === "round_trip") qs.set("stay", stay || "0");
    router.replace(`/briefing?${qs.toString()}`);
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Briefing</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Choisissez le trajet : la fiche rassemble terrains, météo, soleil, environs et infos pratiques, prête à imprimer.
      </p>
      {profiles.length === 0 && profilesRes && (
        <p className="mb-4 text-sm">
          Créez d&apos;abord un profil d&apos;avion dans le <Link href="/planner" className="underline">planificateur</Link>.
        </p>
      )}
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" style={card}>
        <AerodromePicker label="Départ" value={from} onChange={setFrom} />
        <AerodromePicker label="Destination" value={to} onChange={setTo} />
        {stops.map((stop, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <AerodromePicker label={`Escale ${i + 1}`} value={stop} onChange={(v) => setStops((all) => all.map((s, j) => (j === i ? v : s)))} />
            </div>
            <button type="button" aria-label={`Retirer l'escale ${i + 1}`} onClick={() => setStops((all) => all.filter((_, j) => j !== i))} className="h-10 rounded-md border px-2">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {stops.length < MAX_STOPS && (
          <div className="sm:col-span-2">
            <button type="button" onClick={() => setStops((all) => [...all, null])} className="inline-flex items-center gap-2 text-sm underline">
              <Plus className="h-4 w-4" /> Ajouter une escale
            </button>
            <span className="text-xs text-muted-foreground"> · dans l&apos;ordre de vol, avant la destination</span>
          </div>
        )}
        <div>
          <label className="text-sm font-medium" style={{ display: "block", marginBottom: 4 }}>Avion</label>
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium" style={{ display: "block", marginBottom: 4 }}>Trajet</label>
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="round_trip">Aller-retour</option>
            <option value="outbound">Aller simple</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium" style={{ display: "block", marginBottom: 4 }}>Heure de départ (optionnel)</label>
          <input type="datetime-local" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={departure} onChange={(e) => setDeparture(e.target.value)} />
        </div>
        {scope === "round_trip" && (
          <div>
            <label className="text-sm font-medium" style={{ display: "block", marginBottom: 4 }}>Temps sur place (min)</label>
            <input type="number" min={0} max={1440} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={stay} onChange={(e) => setStay(e.target.value)} />
          </div>
        )}
        <div className="sm:col-span-2">
          <button type="submit" disabled={!from || !to || !profileId} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
            Préparer le briefing
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Briefing sheet ──────────────────────────────────────────────────────────

function readNumber(params: URLSearchParams, key: string): number | undefined {
  const value = params.get(key);
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function Briefing({ params }: { params: URLSearchParams }) {
  const router = useRouter();
  const body = {
    profileId: params.get("profile"),
    departureId: params.get("from"),
    destinationId: params.get("to"),
    viaIds: (params.get("via") ?? "").split(",").filter(Boolean).slice(0, MAX_STOPS),
    tripScope: params.get("scope") === "outbound" ? "outbound" : "round_trip",
    ...(params.get("dep") ? { departureTime: params.get("dep") } : {}),
    ...(readNumber(params, "stay") != null ? { stayMinutes: readNumber(params, "stay") } : {}),
    ...(readNumber(params, "reserve") != null ? { reserveMinutes: readNumber(params, "reserve") } : {}),
    ...(readNumber(params, "gdep") != null ? { departureGroundMinutes: readNumber(params, "gdep") } : {}),
    ...(readNumber(params, "garr") != null ? { arrivalGroundMinutes: readNumber(params, "garr") } : {}),
    ...(readNumber(params, "fuel") ? { fuelPricePerLiter: readNumber(params, "fuel") } : {}),
  };

  const tripQuery = useQuery({
    queryKey: ["briefing", body],
    queryFn: () => apiClient.post<BriefingTrip>("/planner/briefing", body),
  });
  const trip = tripQuery.data?.data;
  const sunDate = (trip?.departureTime ?? new Date().toISOString()).slice(0, 10);

  if (tripQuery.isError) {
    return (
      <div>
        <p className="mb-4">Impossible de préparer ce briefing : {tripQuery.error instanceof Error ? tripQuery.error.message : "erreur inconnue"}.</p>
        <button type="button" className="underline" onClick={() => router.replace("/briefing")}>Choisir un autre trajet</button>
      </div>
    );
  }
  if (!trip) return <p className="text-sm text-muted-foreground">Préparation du briefing…</p>;

  const roundTrip = trip.tripScope === "round_trip";
  const generatedAt = new Date().toLocaleString("fr-FR");

  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => router.replace(`/briefing?${editParams(params)}`)} className="h-9 rounded-md border px-3 text-sm">Modifier le trajet</button>
          <button type="button" onClick={() => downloadGpx(trip)} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
            <Download className="h-4 w-4" /> GPX
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            <Printer className="h-4 w-4" /> Imprimer / PDF
          </button>
        </div>
      </div>

      <header className="brief-card" style={{ ...card, background: "var(--paper-50)" }}>
        <p style={{ ...small, margin: 0 }}>Briefing Navventura · généré le {generatedAt}</p>
        <h1 style={{ fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: 28, margin: "6px 0 4px" }}>
          {[trip.departure, ...trip.stops, trip.destination].map(shortName).join(" → ")}
          {roundTrip ? ` → ${shortName(trip.departure)}` : ""}
        </h1>
        <p style={{ margin: "0 0 4px", fontSize: 14 }}>{fieldName(trip.departure)} → {fieldName(trip.destination)}</p>
        <p style={{ margin: 0, fontSize: 14 }}>
          {roundTrip ? "Aller-retour" : "Aller simple"} · {trip.aircraft.name}
          {trip.aircraft.fuelType ? ` · ${FUEL_LABELS[trip.aircraft.fuelType] ?? trip.aircraft.fuelType}` : ""}
          {trip.departureTime ? ` · départ ${new Date(trip.departureTime).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : ""}
        </p>
      </header>

      <Section title="Trajet">
        <div style={{ marginBottom: 10 }}>
          {!trip.withinRange && <span style={warn}>Hors autonomie</span>}
          {trip.legs.some((l) => l.refuelBefore) && <span style={warn}>Plein en route obligatoire</span>}
          {trip.nightOperation && <span style={{ ...warn, background: "oklch(0.93 0.04 270)", color: "oklch(0.38 0.12 270)" }}>Nuit aéronautique</span>}
        </div>
        <Facts
          rows={[
            ["Distance", <span key="d" style={mono}>{formatNm(trip.distanceNm)}</span>],
            ["Temps de vol", <span key="t" style={mono}>{formatFlightTime(trip.flightTimeHours)} · {formatFlightTime(trip.tripTimeHours)} roulage compris</span>],
            ["Carburant", <span key="f" style={mono}>{trip.tripFuelLiters} L</span>],
            ["Autonomie utile", <span key="r" style={mono}>{formatNm(trip.usableRangeNm)} (réserve {trip.reserveMinutes} min déduite)</span>],
            ["Coût estimé", (
              <span key="e" style={mono}>
                {formatEuros(trip.estimatedCost)}
                {trip.landingFees > 0 ? `, dont ${formatEuros(trip.landingFees)} de taxes` : ""}
                {trip.parkingFees > 0 ? ` et ${formatEuros(trip.parkingFees)} de parking` : ""}
              </span>
            )],
          ]}
        />
        <LegsTable trip={trip} />
        <p style={{ ...small, marginTop: 10, marginBottom: 0 }}>
          Ligne droite, sans vent, à {trip.aircraft.tas} kt et {trip.aircraft.fuelConsumption} L/h. Réservoir plein au départ ; plein refait en escale
          quand ce qui reste ne suffit pas jusqu&apos;au prochain terrain qui vend votre carburant.
          {trip.stops.length > 0 || roundTrip ? ` ${trip.stayMinutes} min au sol à chaque escale.` : ""}
        </p>
      </Section>

      <RouteSection trip={trip} />
      <FieldSection role="Arrivée" id={trip.destination.id} sunDate={sunDate} maxCrosswindKt={trip.aircraft.maxCrosswindKt} />
      {trip.stops.map((stop, i) => (
        <FieldSection key={`${stop.id}-${i}`} role={`Escale ${i + 1}`} id={stop.id} sunDate={sunDate} maxCrosswindKt={trip.aircraft.maxCrosswindKt} />
      ))}
      <FieldSection role="Départ" id={trip.departure.id} sunDate={sunDate} maxCrosswindKt={trip.aircraft.maxCrosswindKt} compact />
      <SurroundingsSection id={trip.destination.id} />
      <WindSection id={trip.destination.id} />
      <PracticalSection id={trip.destination.id} trip={trip} />

      <section className="brief-card" style={{ ...card, background: "oklch(0.97 0.04 85)", borderColor: "oklch(0.90 0.05 85)" }}>
        <p style={{ margin: 0, fontSize: 13 }}>
          <strong>Avant le vol :</strong> consultez les NOTAM et SUP AIP en vigueur, la VAC à jour et la météo officielle.
          Ce briefing est indicatif et ne remplace aucune documentation aéronautique officielle. Généré le {generatedAt}.
        </p>
      </section>
    </div>
  );
}

/** The briefing's query string, turned back into the form's. */
function editParams(params: URLSearchParams) {
  const qs = new URLSearchParams();
  for (const key of ["from", "to", "via", "profile"]) {
    const value = params.get(key);
    if (value) qs.set(key, value);
  }
  return qs.toString();
}

function LegsTable({ trip }: { trip: BriefingTrip }) {
  const fields = new Map<string, BriefingField>([trip.departure, trip.destination, ...trip.stops].map((f) => [f.id, f]));
  const name = (id: string) => (fields.get(id) ? shortName(fields.get(id)!) : "?");
  const timed = trip.legs.some((l) => l.takeOffAt);
  const cell: CSSProperties = { padding: "6px 8px 6px 0", whiteSpace: "nowrap" };

  return (
    <div style={{ overflowX: "auto", marginTop: 14 }}>
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--ink-500)", fontSize: 12 }}>
            <th style={cell}>Étape</th><th style={cell}>Distance</th><th style={cell}>Route vraie / mag.</th>
            <th style={cell}>Temps</th><th style={cell}>Carburant</th>{timed && <th style={cell}>Décollage → atterrissage</th>}<th style={cell} />
          </tr>
        </thead>
        <tbody>
          {trip.legs.map((leg, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--ink-200)" }}>
              <td style={{ ...cell, ...mono, fontWeight: 600 }}>{name(leg.fromId)} → {name(leg.toId)}</td>
              <td style={{ ...cell, ...mono }}>{formatNm(leg.distanceNm)}</td>
              <td style={{ ...cell, ...mono }}>{course(leg.trueCourse)} / {course(leg.magneticCourse)}</td>
              <td style={{ ...cell, ...mono }}>{formatFlightTime(leg.timeHours)}</td>
              <td style={{ ...cell, ...mono }}>{leg.fuelLiters} L</td>
              {timed && <td style={{ ...cell, ...mono }}>{clock(leg.takeOffAt)} → {clock(leg.landingAt)}</td>}
              <td style={{ ...cell, fontSize: 12 }}>
                {leg.refuelBefore && <span style={warn}>Plein avant</span>}
                {!leg.withinRange && <span style={warn}>Hors autonomie</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ ...small, margin: "6px 0 0" }}>Route magnétique : déclinaison du terrain de départ de l&apos;étape, « — » si inconnue.</p>
    </div>
  );
}

function RouteSection({ trip }: { trip: BriefingTrip }) {
  return (
    <Section title="Sur la route">
      <h3 style={{ ...h3, marginTop: 0 }}>Espaces traversés (plancher ≤ 6 500 ft)</h3>
      {trip.airspaces.length === 0 ? <p style={small}>Aucun espace réglementé, dangereux, interdit ni contrôlé connu sur la ligne droite.</p> : (
        trip.airspaces.map((a) => (
          <p key={a.id} style={{ fontSize: 13, margin: "0 0 3px" }}>
            <span style={{ ...mono, fontWeight: 600 }}>{AIRSPACE_TYPES[a.type] ?? "Espace"}</span> {a.name}
            {/^[A-G]$/.test(a.icaoClass) && a.type > 3 ? ` · classe ${a.icaoClass}` : ""}
            {" · "}<span style={mono}>{a.lowerLimit} – {a.upperLimit}</span>
            {a.onDemand ? " · activable" : ""}{a.onRequest ? " · sur demande" : ""}
            <span style={small}> · à {formatNm(a.alongNm)} du départ</span>
          </p>
        ))
      )}
      <h3 style={h3}>Obstacles les plus hauts à moins de {trip.obstacleCorridorNm} NM</h3>
      {trip.obstacles.length === 0 ? <p style={small}>Aucun obstacle connu dans ce couloir.</p> : (
        <>
          {trip.obstacles.map((o) => (
            <p key={o.id} style={{ fontSize: 13, margin: "0 0 3px" }}>
              {OBSTACLE_LABELS[o.type as NearbyObstacle["type"]] ?? "Obstacle"}{o.name ? ` « ${o.name} »` : ""} · sommet {formatObstacleElevation(o.elevationM)} · {formatObstacleHeight(o.heightM)}
              <span style={small}> · à {formatNm(o.alongNm)} du départ, {o.offsetNm} NM de la route</span>
            </p>
          ))}
          {trip.obstacleCount > trip.obstacles.length && (
            <p style={{ ...small, margin: "4px 0 0" }}>{trip.obstacleCount} obstacles connus dans le couloir, les {trip.obstacles.length} plus hauts affichés.</p>
          )}
        </>
      )}
      <p style={{ ...small, marginTop: 10, marginBottom: 0 }}>
        Ligne droite entre les terrains, données openAIP indicatives : préparez la navigation sur la carte OACI et vérifiez les activations (NOTAM, SUP AIP).
      </p>
    </Section>
  );
}

function FieldSection({ role, id, sunDate, maxCrosswindKt, compact = false }: { role: string; id: string; sunDate: string; maxCrosswindKt: number | null; compact?: boolean }) {
  const { data: adRes } = useQuery({ queryKey: ["aerodrome", id], queryFn: () => apiClient.get<FieldDetail>(`/aerodromes/${id}`) });
  const { data: docsRes } = useQuery({ queryKey: ["aerodrome-documents", id], queryFn: () => apiClient.get<FieldDocuments>(`/aerodromes/${id}/documents`) });
  const { data: weatherRes } = useQuery({ queryKey: ["weather", id], queryFn: () => apiClient.get<WeatherResult | null>(`/aerodromes/${id}/weather`) });
  const { data: sunRes } = useQuery({ queryKey: ["sun", id, sunDate], queryFn: () => apiClient.get<SunTimes>(`/aerodromes/${id}/sun`, { date: sunDate }) });
  const ad = adRes?.data;
  if (!ad) return null;

  const docs = docsRes?.data;
  const weather = weatherRes?.data;
  const sun = sunRes?.data;
  const vac = safeHttpUrl(docs?.vacUrl);
  const aip = safeHttpUrl(docs?.aipUrl);
  const fuels = ad.fuels.filter((f) => f.available);
  const wind = weather?.metar?.wind ?? null;

  return (
    <Section title={`${role} · ${fieldName(ad)}`}>
      <div style={{ marginBottom: 10 }}>
        {ad.ppr && <span style={warn}>PPR</span>}
        {ad.privateUse && <span style={warn}>Terrain privé</span>}
        {ad.skydiveActivity && <span style={warn}>Parachutisme</span>}
        {ad.winchOnly && <span style={warn}>Treuil uniquement</span>}
      </div>
      <Facts
        rows={[
          ["Altitude", ad.elevation != null ? <span key="e" style={mono}>{ad.elevation} ft</span> : "—"],
          ["Documents", (
            <span key="doc">
              {vac ? <a href={vac} target="_blank" rel="noopener noreferrer" className="underline">VAC</a> : "VAC non publiée"}
              {" · "}
              {aip ? <a href={aip} target="_blank" rel="noopener noreferrer" className="underline">AD 2</a> : "AD 2 non publiée"}
              {docs?.airac && <span style={small}> (cycle AIRAC du {day(docs.airac)})</span>}
            </span>
          )],
          ...(!compact ? ([["Carburant", fuels.length ? fuels.map((f) => `${FUEL_LABELS[f.type] ?? f.type}${f.selfService ? " (self)" : ""}${f.availabilityHours ? ` ${f.availabilityHours}` : ""}`).join(", ") : "aucun signalé"]] as [string, ReactNode][]) : []),
          ["Soleil", sun ? <span key="s" style={mono}>lever {clock(sun.sunrise)} · coucher {clock(sun.sunset)} · nuit aéro {clock(sun.aeronauticalDayEnd)} → {clock(sun.aeronauticalDayStart)}</span> : "—"],
        ]}
      />

      <h3 style={h3}>Pistes</h3>
      {ad.runways.length === 0 ? <p style={small}>Aucune piste renseignée.</p> : (
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <tbody>
            {ad.runways.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--ink-200)" }}>
                <td style={{ ...mono, padding: "6px 8px 6px 0", fontWeight: 600 }}>{r.identifier}</td>
                <td style={{ padding: "6px 8px" }}>{r.length} m{r.width ? ` × ${r.width} m` : ""}</td>
                <td style={{ padding: "6px 8px" }}>{SURFACES[r.surface] ?? r.surface}{r.lighting ? " · balisée" : ""}</td>
                <td style={{ padding: "6px 0", color: "var(--ink-500)" }}>{r.trueHeading != null ? `${course(r.trueHeading)} vrai` : ""}{r.remarks ? ` · ${r.remarks}` : ""}</td>
                <td style={{ padding: "6px 0 6px 8px", whiteSpace: "nowrap" }}><RunwayWind wind={wind} runway={r} maxCrosswindKt={maxCrosswindKt} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={h3}>Fréquences</h3>
      {ad.frequencies.length === 0 ? <p style={small}>Aucune fréquence renseignée.</p> : (
        <p style={{ fontSize: 13, margin: 0 }}>
          {ad.frequencies.map((f) => (
            <span key={f.id} style={{ marginRight: 16, whiteSpace: "nowrap" }}>
              <span style={{ ...mono, fontWeight: 600 }}>{f.mhz.toFixed(3)}</span> {f.type}{f.callsign ? ` (${f.callsign})` : ""}
            </span>
          ))}
        </p>
      )}

      {!compact && (ad.phones.length > 0 || ad.contactInfo || ad.openingHours.length > 0 || ad.sourceRemarks) && (
        <>
          <h3 style={h3}>Contact et horaires</h3>
          {ad.phones.map((p) => (
            <p key={p.number} style={{ fontSize: 13, margin: "0 0 4px" }}>
              <span style={{ ...mono, fontWeight: 600 }}>{p.number}</span>{p.label || p.remarks ? ` · ${[p.label, p.remarks].filter(Boolean).join(" · ")}` : ""}
            </p>
          ))}
          {ad.contactInfo && <p style={{ fontSize: 13, whiteSpace: "pre-line", margin: "0 0 6px" }}>{ad.contactInfo}</p>}
          {ad.openingHours.length > 0 && (
            <p style={{ fontSize: 13, margin: "0 0 6px" }}>
              {DAYS.map((label, d) => {
                const slots = ad.openingHours.filter((s) => s.day === d);
                return slots.length ? <span key={label} style={{ marginRight: 12 }}>{label} : {slots.map(slotLabel).join(", ")}</span> : null;
              })}
            </p>
          )}
          {ad.sourceRemarks && <p style={{ fontSize: 13, whiteSpace: "pre-line", margin: 0 }}>{ad.sourceRemarks}</p>}
        </>
      )}

      <h3 style={h3}>Météo</h3>
      {!weather || (!weather.metar && !weather.taf) ? (
        <p style={small}>Pas de METAR ni de TAF disponible à proximité.</p>
      ) : (
        <div style={{ fontSize: 13 }}>
          {!weather.isNearest || weather.icao !== ad.icaoCode ? (
            <p style={{ ...small, margin: "0 0 4px" }}>Station {weather.icao}{weather.stationName ? ` (${weather.stationName})` : ""}{weather.distanceNm != null ? `, à ${Math.round(weather.distanceNm)} NM` : ""}</p>
          ) : null}
          {weather.metar && (
            <p style={{ margin: "0 0 4px" }}>
              <span style={{ ...mono, whiteSpace: "pre-wrap" }}>{weather.metar.raw}</span>
              <span style={small}> · observé à {clock(weather.metar.observedAt)}{weather.metar.flight_category ? ` · ${weather.metar.flight_category}` : ""}</span>
            </p>
          )}
          {weather.taf && <p style={{ ...mono, margin: 0, whiteSpace: "pre-wrap" }}>{weather.taf.raw}</p>}
          {wind && ad.runways.length > 0 && (
            <p style={{ ...small, margin: "4px 0 0" }}>
              Composantes par piste calculées sur le METAR, rafales comprises{maxCrosswindKt == null ? " · indiquez votre limite de vent de travers dans le profil avion pour être averti" : ""}.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

/** METAR wind on the runway end that faces it best. */
function RunwayWind({ wind, runway, maxCrosswindKt }: { wind: Wind | null; runway: { identifier: string; trueHeading: number | null }; maxCrosswindKt: number | null }) {
  if (!wind) return null;
  const best = runwayWind(wind, runway);
  if (!best) return wind.degrees == null && wind.speed_kts > 0 ? <span style={small}>vent variable</span> : null;
  const over = maxCrosswindKt != null && best.crosswind > maxCrosswindKt;
  return (
    <span style={{ fontSize: 12 }}>
      <span style={mono}>{best.end}</span> : {best.headwind >= 0 ? `face ${best.headwind}` : `arrière ${-best.headwind}`} kt, travers {best.crosswind} kt
      {over && <span style={{ ...warn, marginLeft: 6, marginRight: 0 }}>au-delà de {maxCrosswindKt} kt</span>}
    </span>
  );
}

function SurroundingsSection({ id }: { id: string }) {
  const { data: obstaclesRes } = useQuery({ queryKey: ["obstacles", id], queryFn: () => apiClient.get<NearbyObstacle[]>(`/aerodromes/${id}/obstacles`) });
  const { data: linesRes } = useQuery({ queryKey: ["aerial-lines", id], queryFn: () => apiClient.get<NearbyAerialLine[]>(`/aerodromes/${id}/aerial-lines`) });
  const { data: areasRes } = useQuery({ queryKey: ["protected-areas", id], queryFn: () => apiClient.get<NearbyProtectedArea[]>(`/aerodromes/${id}/protected-areas`) });
  const obstacles = (obstaclesRes?.data ?? []).slice(0, 12);
  const lines = (linesRes?.data ?? []).slice(0, 8);
  const areas = areasRes?.data ?? [];
  if (!obstaclesRes || !linesRes || !areasRes) return null;

  return (
    <Section title="Environs de l'arrivée (10 km)">
      {obstacles.length + lines.length + areas.length === 0 && <p style={small}>Aucun obstacle, câble ou zone protégée connu.</p>}
      {obstacles.length > 0 && (
        <>
          <h3 style={{ ...h3, marginTop: 0 }}>Obstacles</h3>
          {obstacles.map((o) => (
            <p key={o.id} style={{ fontSize: 13, margin: "0 0 3px" }}>
              {OBSTACLE_LABELS[o.type]}{o.name ? ` « ${o.name} »` : ""} · {formatObstacleHeight(o.heightM)} · sommet {formatObstacleElevation(o.elevationM)}
              <span style={small}> · {formatObstacleDistance(o.distanceM)} au {course(o.bearingDeg)}</span>
            </p>
          ))}
        </>
      )}
      {lines.length > 0 && (
        <>
          <h3 style={h3}>Lignes et câbles</h3>
          {lines.map((l) => (
            <p key={l.id} style={{ fontSize: 13, margin: "0 0 3px" }}>
              {aerialLineTitle(l)}<span style={small}> · {formatObstacleDistance(l.distanceM)} au {course(l.bearingDeg)}</span>
            </p>
          ))}
        </>
      )}
      {areas.length > 0 && (
        <>
          <h3 style={h3}>Zones protégées</h3>
          {areas.map((a) => (
            <p key={a.id} style={{ fontSize: 13, margin: "0 0 3px" }}>
              {PROTECTED_AREA_LABELS[a.kind]}{a.name ? ` · ${a.name}` : ""}{a.detail ? ` (${a.detail})` : ""}
              <span style={small}> · {a.distanceM === 0 ? "le terrain est dedans" : formatAreaDistance(a.distanceM)}</span>
            </p>
          ))}
        </>
      )}
      <p style={{ ...small, marginTop: 10, marginBottom: 0 }}>Données indicatives et non exhaustives (openAIP, IGN) : la carte OACI et la VAC font foi.</p>
    </Section>
  );
}

function WindSection({ id }: { id: string }) {
  const { data: climateRes } = useQuery({ queryKey: ["wind-climate", id], queryFn: () => apiClient.get<WindClimate | null>(`/aerodromes/${id}/wind-climate`) });
  const { data: adRes } = useQuery({ queryKey: ["aerodrome", id], queryFn: () => apiClient.get<FieldDetail>(`/aerodromes/${id}`) });
  const climate = climateRes?.data;
  if (!climate || !adRes?.data) return null;
  const headings = [...new Set(adRes.data.runways.map((r) => r.trueHeading).filter((h): h is number => h != null).map((h) => h % 180))];

  return (
    <div className="brief-card">
      <WindRoseCard climate={climate} runwayHeadings={headings} />
    </div>
  );
}

function PracticalSection({ id, trip }: { id: string; trip: BriefingTrip }) {
  const { data } = useQuery({
    queryKey: ["aerodrome-community-info", id],
    queryFn: () => apiClient.get<AerodromeCommunityInfo>(`/aerodromes/${id}/community-info`),
  });
  const info = data?.data;
  if (!info) return null;
  const items = info.items.filter((item) => item.kind !== "WEBCAM");
  if (items.length === 0 && info.webcams.length === 0 && !info.items.some((i) => i.kind === "WEBCAM")) return null;

  return (
    <Section title="Infos pratiques (membres)">
      {items.map((item) => (
        <p key={item.id} style={{ fontSize: 13, margin: "0 0 4px" }}>
          {communityInfoSummary(item)}
          <span style={small}> · constaté le {day(item.observedAt)}{isStale(item) ? " · à vérifier" : ""}</span>
        </p>
      ))}
      {trip.landingFee && trip.aircraft.category && (
        <p style={{ ...small, margin: "6px 0 0" }}>
          Taxe retenue dans le coût : catégorie {CATEGORIES[trip.aircraft.category] ?? trip.aircraft.category}.
        </p>
      )}
      <div className="no-print" style={{ marginTop: 10 }}>
        <WebcamLinks info={info} />
      </div>
    </Section>
  );
}
