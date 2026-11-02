"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wind } from "lucide-react";

/** GET /aerodromes/:id/wind-climate */
export interface WindClimate {
  station: { name: string; altitudeM: number | null; distanceKm: number };
  period: { from: number; to: number };
  sectors: { heading: number; classes: number[]; total: number }[];
  calm: number;
  prevailingHeading: number;
  observations: number;
}

const CLASS_COLORS = ["#93c5fd", "#3b82f6", "#1e3a8a"];
const CLASS_LABELS = ["1–10 kt", "11–20 kt", "> 20 kt"];
const CARDINALS = ["N", "NNE", "ENE", "E", "ESE", "SSE", "S", "SSO", "OSO", "O", "ONO", "NNO"];

const SIZE = 240;
const C = SIZE / 2;
const R = 96;
const HALF = (Math.PI / 12) * 0.82; // 30° sectors, with a small gap

/** Point at `radius` from the centre, `degrees` clockwise from north. */
function polar(degrees: number, radius: number): [number, number] {
  const a = (degrees * Math.PI) / 180;
  return [C + radius * Math.sin(a), C - radius * Math.cos(a)];
}

function wedge(heading: number, r0: number, r1: number): string {
  const a0 = (heading * Math.PI) / 180 - HALF;
  const a1 = (heading * Math.PI) / 180 + HALF;
  const p = (a: number, r: number) => `${(C + r * Math.sin(a)).toFixed(1)},${(C - r * Math.cos(a)).toFixed(1)}`;
  return `M${p(a0, r0)} L${p(a0, r1)} A${r1},${r1} 0 0 1 ${p(a1, r1)} L${p(a1, r0)} A${r0},${r0} 0 0 0 ${p(a0, r0)} Z`;
}

/**
 * Prevailing-wind rose: each petal points to where the wind blows from, its
 * length is the share of hours, stacked by speed class. Runway axes are
 * drawn across it.
 */
export function WindRoseCard({ climate, runwayHeadings }: { climate: WindClimate; runwayHeadings: number[] }) {
  const max = Math.max(...climate.sectors.map((s) => s.total), 1);
  // Scale rings to a round percentage above the longest petal.
  const ringStep = max > 30 ? 10 : 5;
  const top = Math.ceil(max / ringStep) * ringStep;
  const scale = (pct: number) => (pct / top) * R;
  const prevailing = climate.sectors.find((s) => s.heading === climate.prevailingHeading)!;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg"><Wind className="h-5 w-5" /> Vent dominant</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={`Rose des vents, vent dominant du ${climate.prevailingHeading}°`} className="shrink-0">
            {Array.from({ length: top / ringStep }, (_, i) => (i + 1) * ringStep).map((pct) => (
              <g key={pct}>
                <circle cx={C} cy={C} r={scale(pct)} fill="none" stroke="#e2e8f0" strokeDasharray={pct === top ? undefined : "2 3"} />
                <text x={C + 3} y={C - scale(pct) + 10} fontSize="8" fill="#94a3b8">{pct} %</text>
              </g>
            ))}
            {runwayHeadings.map((h, i) => {
              const [x1, y1] = polar(h, R + 8);
              const [x2, y2] = polar(h + 180, R + 8);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0f172a" strokeOpacity={0.35} strokeWidth={6} strokeLinecap="round" />;
            })}
            {climate.sectors.map((s) => {
              let r0 = 0;
              return s.classes.map((pct, c) => {
                const r1 = r0 + scale(pct);
                const d = pct > 0 ? wedge(s.heading, r0, r1) : null;
                r0 = r1;
                return d ? <path key={`${s.heading}-${c}`} d={d} fill={CLASS_COLORS[c]} stroke="white" strokeWidth={0.5} /> : null;
              });
            })}
            {(["N", "E", "S", "O"] as const).map((label, i) => {
              const [x, y] = polar(i * 90, R + 16);
              return <text key={label} x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="#334155">{label}</text>;
            })}
          </svg>
          <div className="min-w-0 text-sm">
            <p className="text-base font-semibold">
              {String(climate.prevailingHeading).padStart(3, "0")}° ({CARDINALS[climate.prevailingHeading / 30]}) · {prevailing.total} % du temps
            </p>
            <p className="mt-1 text-muted-foreground">Calme : {climate.calm} % · d&apos;où vient le vent, toutes heures confondues</p>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {CLASS_LABELS.map((label, c) => (
                <span key={label} className="inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CLASS_COLORS[c] }} />{label}
                </span>
              ))}
              {runwayHeadings.length > 0 && (
                <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-3 rounded-sm bg-slate-900/35" />Axe des pistes</span>
              )}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Station Météo-France {climate.station.name} à {climate.station.distanceKm.toLocaleString("fr-FR")} km
              {climate.station.altitudeM != null ? ` (${climate.station.altitudeM} m)` : ""}, {climate.period.from}–{climate.period.to}.
              Source : Météo-France, données climatologiques horaires (Licence Ouverte).
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
