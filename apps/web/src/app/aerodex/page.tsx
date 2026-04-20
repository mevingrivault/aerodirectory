"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  BadgeCheck,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock3,
  Compass,
  Eye,
  Grid2X2,
  Heart,
  List,
  Lock,
  Map,
  MapPin,
  Mountain,
  Plane,
  Route,
  Sparkles,
  Star,
  Target,
  Trophy,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { formatNm } from "@/lib/utils";
import type { AerodexStats, Badge as AerodexBadge } from "@aerodirectory/shared";

const PAGE_SIZE = 12;
const EMPTY_STAMP_COUNT = 6;

interface VisitEntry {
  id: string;
  status: string;
  visitedAt: string;
  aerodrome: {
    id: string;
    name: string;
    icaoCode: string | null;
    city: string | null;
    aerodromeType: string;
  };
}

type StatusFilter = "all" | "visited" | "favorite";
type TypeFilter = "all" | "aerodromes" | "altiport" | "ulm" | "heli";
type ViewMode = "stamps" | "list";

const typeMeta: Record<
  Exclude<TypeFilter, "all">,
  { label: string; shortLabel: string; icon: typeof Plane; tone: string }
> = {
  aerodromes: {
    label: "Aérodromes",
    shortLabel: "AD",
    icon: Plane,
    tone: "text-[var(--horizon-700)] bg-[var(--horizon-50)]",
  },
  altiport: {
    label: "Altiports",
    shortLabel: "ALP",
    icon: Mountain,
    tone: "text-[var(--terrain-800)] bg-[var(--terrain-100)]",
  },
  ulm: {
    label: "Bases ULM",
    shortLabel: "ULM",
    icon: Compass,
    tone: "text-[var(--ifr-500)] bg-[var(--ifr-100)]",
  },
  heli: {
    label: "Hélistations",
    shortLabel: "HEL",
    icon: MapPin,
    tone: "text-[var(--ink-700)] bg-[var(--paper-100)]",
  },
};

function getTypeBucket(aerodromeType: string): TypeFilter {
  if (aerodromeType === "ULTRALIGHT_FIELD") return "ulm";
  if (aerodromeType === "HELIPORT") return "heli";
  if (aerodromeType === "ALTIPORT") return "altiport";
  return "aerodromes";
}

function progressPercent(current: number, total: number): number {
  return Math.min(100, Math.round((current / Math.max(1, total)) * 100));
}

function formatStampDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  })
    .format(new Date(value))
    .replace(/\//g, "·");
}

function buildProgress(stats?: AerodexStats) {
  const visited = stats?.visitedCount ?? 0;
  const seen = stats?.seenCount ?? 0;
  const favorites = stats?.favoriteCount ?? 0;
  const earnedBadges = stats?.badges.filter((badge) => badge.earned).length ?? 0;
  const xp = visited * 80 + seen * 12 + favorites * 30 + earnedBadges * 140;
  const level = Math.max(1, Math.floor(Math.sqrt(xp / 180)) + 1);
  const levelStart = Math.pow(level - 1, 2) * 180;
  const nextLevel = Math.pow(level, 2) * 180;
  const levelXp = xp - levelStart;
  const neededXp = Math.max(1, nextLevel - levelStart);

  return {
    xp,
    level,
    levelXp,
    nextLevel,
    percent: progressPercent(levelXp, neededXp),
    remaining: Math.max(0, nextLevel - xp),
    rank:
      visited >= 100
        ? "Légende Navventura"
        : visited >= 50
          ? "Grand voyageur"
          : visited >= 10
            ? "Explorateur"
            : visited > 0
              ? "Aéroventurier"
              : "Nouveau carnet",
  };
}

function Panel({
  title,
  icon: Icon,
  right,
  children,
  className = "",
}: {
  title: string;
  icon: typeof BookOpen;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-[var(--ink-200)] bg-white ${className}`}>
      <div className="flex min-h-16 items-center justify-between gap-3 border-b border-[var(--ink-200)] px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon className="h-4 w-4 shrink-0 text-[var(--ink-500)]" />
          <h2 className="truncate font-[var(--f-serif)] text-xl font-medium tracking-normal text-[var(--ink-950)]">
            {title}
          </h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Hero({ stats }: { stats?: AerodexStats }) {
  const progress = buildProgress(stats);
  const circumference = 2 * Math.PI * 58;
  const dashOffset = circumference - (progress.percent / 100) * circumference;

  return (
    <section className="relative overflow-hidden rounded-xl bg-[linear-gradient(145deg,var(--ink-950),oklch(0.22_0.05_250)_55%,oklch(0.20_0.08_250))] p-5 text-white shadow-[var(--shadow-pop)] sm:p-8">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] bg-[length:40px_40px]" />
      <div className="relative grid gap-6 lg:grid-cols-[150px_1fr_auto] lg:items-center">
        <div className="relative mx-auto h-36 w-36 lg:mx-0">
          <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
            <circle cx="70" cy="70" r="58" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="8" />
            <circle
              cx="70"
              cy="70"
              r="58"
              fill="none"
              stroke="oklch(0.70 0.12 75)"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              strokeWidth="8"
            />
          </svg>
          <div className="absolute inset-3 grid place-items-center rounded-full border border-white/10 bg-white/[.04] text-center">
            <div>
              <div className="font-[var(--f-serif)] text-5xl font-semibold leading-none">{progress.level}</div>
              <div className="mt-1 font-[var(--f-mono)] text-[10px] font-semibold uppercase tracking-[.18em] text-[oklch(0.85_0.08_75)]">
                niveau
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 text-center lg:text-left">
          <div className="mb-3 flex items-center justify-center gap-3 font-[var(--f-mono)] text-[10px] font-semibold uppercase tracking-[.2em] text-[oklch(0.85_0.08_75)] lg:justify-start">
            <span className="hidden h-px w-7 bg-[oklch(0.75_0.12_75)] sm:block" />
            Carnet de bord
          </div>
          <h1 className="font-[var(--f-serif)] text-4xl font-medium leading-tight tracking-normal sm:text-5xl">
            {progress.rank}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/65">
            Collectionne tes tampons, débloque des écussons et visualise ta progression sur les terrains visités.
          </p>
          <div className="mt-5 max-w-xl">
            <div className="mb-2 flex items-center justify-between text-xs text-white/65">
              <span>Progression du niveau</span>
              <span className="font-[var(--f-mono)] font-semibold text-white">
                {progress.xp} XP
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,oklch(0.70_0.12_75),var(--terrain-500))]"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-white/50 lg:justify-start">
              <Sparkles className="h-3 w-3 text-[oklch(0.85_0.08_75)]" />
              Encore {progress.remaining} XP avant le niveau {progress.level + 1}.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
          {[
            { label: "Visites", value: stats?.visitedCount ?? 0 },
            { label: "Vus", value: stats?.seenCount ?? 0 },
            { label: "Favoris", value: stats?.favoriteCount ?? 0 },
            { label: "Distance", value: formatNm(stats?.estimatedDistanceNm ?? 0), unit: "" },
          ].map((item) => (
            <div
              key={item.label}
              className="min-w-0 rounded-md border border-white/10 bg-white/[.06] px-3 py-3 text-right"
            >
              <div className="truncate font-[var(--f-serif)] text-2xl font-medium leading-none">{item.value}</div>
              <div className="mt-1 font-[var(--f-mono)] text-[9px] uppercase tracking-[.12em] text-white/55">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TypeTabs({
  stats,
  active,
  onChange,
}: {
  stats?: AerodexStats;
  active: TypeFilter;
  onChange: (value: TypeFilter) => void;
}) {
  const entries = (Object.keys(typeMeta) as Exclude<TypeFilter, "all">[]).map((key) => ({
    key,
    ...typeMeta[key],
    ...(stats?.byType[key] ?? { visited: 0, total: 0 }),
  }));

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {entries.map(({ key, label, icon: Icon, tone, visited, total }) => {
        const selected = active === key;
        const percent = progressPercent(visited, total);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(selected ? "all" : key)}
            className={`min-h-[138px] rounded-lg border p-4 text-left transition hover:-translate-y-0.5 ${
              selected
                ? "border-[var(--ink-950)] bg-[var(--ink-950)] text-white"
                : "border-[var(--ink-200)] bg-white text-[var(--ink-950)] hover:border-[var(--ink-300)]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${selected ? "bg-white/10 text-white" : tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <span className={`font-[var(--f-mono)] text-xs ${selected ? "text-white/55" : "text-[var(--ink-500)]"}`}>
                {percent}%
              </span>
            </div>
            <div className="mt-4 text-sm font-semibold">{label}</div>
            <div className="mt-1 flex items-baseline gap-1 font-[var(--f-mono)]">
              <span className="font-[var(--f-serif)] text-3xl font-semibold leading-none">{visited}</span>
              <span className={selected ? "text-white/55" : "text-[var(--ink-500)]"}>/ {total}</span>
            </div>
            <div className={`mt-3 h-1 overflow-hidden rounded-full ${selected ? "bg-white/15" : "bg-[var(--ink-100)]"}`}>
              <div
                className={`h-full rounded-full ${selected ? "bg-[oklch(0.70_0.12_75)]" : "bg-[var(--horizon-700)]"}`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
        active
          ? "border-[var(--ink-950)] bg-[var(--ink-950)] text-white"
          : "border-[var(--ink-300)] bg-white text-[var(--ink-700)] hover:border-[var(--ink-400)]"
      }`}
    >
      {children}
    </button>
  );
}

function StampCard({ visit }: { visit: VisitEntry }) {
  const bucket = getTypeBucket(visit.aerodrome.aerodromeType);
  const meta = bucket === "all" ? typeMeta.aerodromes : typeMeta[bucket];

  return (
    <Link href={`/aerodrome/${visit.aerodrome.id}`} className="group block min-w-0">
      <article className="relative min-h-[172px] rounded-lg border border-[var(--ink-200)] bg-[var(--paper-50)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--ink-400)]">
        <div className="mx-auto grid aspect-[1.24] max-w-[160px] place-items-center border-2 border-dashed border-[oklch(0.55_0.10_25)] bg-white/70 p-3 text-center text-[oklch(0.40_0.15_25)] [clip-path:polygon(6%_0,94%_0,100%_6%,100%_94%,94%_100%,6%_100%,0_94%,0_6%)]">
          <div className="min-w-0">
            <div className="font-[var(--f-mono)] text-xl font-bold uppercase tracking-[.12em]">
              {visit.aerodrome.icaoCode ?? meta.shortLabel}
            </div>
            <div className="mt-1 truncate font-[var(--f-serif)] text-sm font-semibold">
              {visit.aerodrome.name}
            </div>
            <div className="mt-2 font-[var(--f-mono)] text-[10px] tracking-[.12em]">
              {formatStampDate(visit.visitedAt)}
            </div>
          </div>
        </div>
        {visit.status === "FAVORITE" && (
          <div className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-[var(--ifr-100)] text-[var(--ifr-500)]">
            <Heart className="h-4 w-4 fill-current" />
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[var(--ink-500)]">
          <span className="truncate">{visit.aerodrome.city ?? "Terrain visité"}</span>
          <ChevronRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5" />
        </div>
      </article>
    </Link>
  );
}

function VisitListRow({ visit }: { visit: VisitEntry }) {
  const bucket = getTypeBucket(visit.aerodrome.aerodromeType);
  const meta = bucket === "all" ? typeMeta.aerodromes : typeMeta[bucket];
  const Icon = meta.icon;

  return (
    <Link href={`/aerodrome/${visit.aerodrome.id}`} className="block">
      <div className="grid min-h-[76px] grid-cols-[44px_1fr_auto] items-center gap-3 rounded-lg border border-[var(--ink-200)] bg-white p-3 transition hover:border-[var(--ink-400)] hover:bg-[var(--paper-50)] sm:gap-4 sm:p-4">
        <div className={`grid h-11 w-11 place-items-center rounded-md border border-[var(--ink-200)] ${meta.tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-[var(--ink-950)]">{visit.aerodrome.name}</span>
            {visit.aerodrome.icaoCode && (
              <span className="rounded border border-[var(--ink-300)] bg-[var(--paper-100)] px-2 py-0.5 font-[var(--f-mono)] text-[10px] uppercase tracking-[.08em]">
                {visit.aerodrome.icaoCode}
              </span>
            )}
            {visit.status === "FAVORITE" && <Heart className="h-3.5 w-3.5 fill-current text-[var(--ifr-500)]" />}
          </div>
          <div className="mt-1 truncate text-xs text-[var(--ink-500)]">
            {visit.aerodrome.city ?? meta.label}
          </div>
        </div>
        <div className="hidden text-right sm:block">
          <div className="font-[var(--f-mono)] text-xs text-[var(--ink-950)]">{formatStampDate(visit.visitedAt)}</div>
          <div className="mt-1 text-xs text-[var(--ink-500)]">{meta.label}</div>
        </div>
        <ChevronRight className="h-4 w-4 text-[var(--ink-400)] sm:hidden" />
      </div>
    </Link>
  );
}

function CollectionSection({ items }: { items: VisitEntry[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("stamps");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(
    () =>
      items.filter((visit) => {
        const statusOk =
          statusFilter === "all" ||
          (statusFilter === "favorite" && visit.status === "FAVORITE") ||
          (statusFilter === "visited" && visit.status !== "FAVORITE");
        const typeOk = typeFilter === "all" || getTypeBucket(visit.aerodrome.aerodromeType) === typeFilter;
        return statusOk && typeOk;
      }),
    [items, statusFilter, typeFilter],
  );

  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);

  return (
    <Panel
      title="Ma collection"
      icon={BookOpen}
      right={<span className="font-[var(--f-mono)] text-xs text-[var(--ink-500)]">{filtered.length} tampons</span>}
    >
      <div className="flex flex-col gap-3 border-b border-[var(--ink-200)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-wrap gap-2">
          <FilterChip active={statusFilter === "all"} onClick={() => { setStatusFilter("all"); setShowAll(false); }}>
            Tous
          </FilterChip>
          <FilterChip active={statusFilter === "visited"} onClick={() => { setStatusFilter("visited"); setShowAll(false); }}>
            Visités
          </FilterChip>
          <FilterChip active={statusFilter === "favorite"} onClick={() => { setStatusFilter("favorite"); setShowAll(false); }}>
            <Heart className="h-3.5 w-3.5" />
            Favoris
          </FilterChip>
          {(Object.keys(typeMeta) as Exclude<TypeFilter, "all">[]).map((key) => (
            <FilterChip
              key={key}
              active={typeFilter === key}
              onClick={() => {
                setTypeFilter(typeFilter === key ? "all" : key);
                setShowAll(false);
              }}
            >
              {typeMeta[key].label}
            </FilterChip>
          ))}
        </div>
        <div className="grid w-full grid-cols-2 rounded-md border border-[var(--ink-200)] bg-[var(--paper-100)] p-1 sm:w-auto">
          {[
            { key: "stamps" as const, label: "Tampons", icon: Grid2X2 },
            { key: "list" as const, label: "Liste", icon: List },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setViewMode(key)}
              className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-sm px-3 text-xs font-medium transition ${
                viewMode === key ? "bg-white text-[var(--ink-950)] shadow-[var(--shadow-lift)]" : "text-[var(--ink-700)]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--ink-300)] bg-[var(--paper-50)] p-8 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-[var(--ink-400)]" />
            <p className="mt-3 text-sm font-medium text-[var(--ink-950)]">Aucun tampon pour ces filtres.</p>
            <p className="mt-1 text-sm text-[var(--ink-500)]">Change les filtres ou marque un terrain comme visité.</p>
          </div>
        ) : viewMode === "stamps" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((visit) => (
              <StampCard key={visit.id} visit={visit} />
            ))}
            {Array.from({ length: Math.max(0, EMPTY_STAMP_COUNT - Math.min(EMPTY_STAMP_COUNT, visible.length)) }).map((_, index) => (
              <div
                key={`empty-${index}`}
                className="grid min-h-[172px] place-items-center rounded-lg border border-dashed border-[var(--ink-200)] bg-[var(--paper-100)] p-4 text-center text-[var(--ink-400)]"
              >
                <div>
                  <MapPin className="mx-auto h-6 w-6" />
                  <div className="mt-2 font-[var(--f-mono)] text-[10px] uppercase tracking-[.12em]">À découvrir</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((visit) => (
              <VisitListRow key={visit.id} visit={visit} />
            ))}
          </div>
        )}

        {filtered.length > PAGE_SIZE && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-4 w-full"
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? "Voir moins" : `Voir les ${filtered.length - PAGE_SIZE} suivants`}
          </Button>
        )}
      </div>
    </Panel>
  );
}

function BadgeMedal({ badge, visitedCount }: { badge: AerodexBadge; visitedCount: number }) {
  const targetMatch = badge.description.match(/(\d+)/);
  const target = targetMatch ? Number(targetMatch[1]) : badge.earned ? 1 : 100;
  const current = badge.earned ? target : Math.min(visitedCount, target);

  return (
    <div
      className={`relative rounded-lg border p-4 transition hover:-translate-y-0.5 ${
        badge.earned
          ? "border-[oklch(0.85_0.08_75)] bg-[linear-gradient(160deg,oklch(0.95_0.04_75),white)]"
          : "border-[var(--ink-200)] bg-[var(--paper-100)] opacity-70"
      }`}
    >
      <div className="absolute right-2 top-2 rounded-sm bg-black/[.04] px-1.5 py-0.5 font-[var(--f-mono)] text-[9px] font-semibold uppercase tracking-[.1em] text-[var(--ink-700)]">
        {badge.earned ? "Validé" : "Objectif"}
      </div>
      <div className="mx-auto mt-2 grid h-16 w-16 place-items-center rounded-full border bg-white text-[var(--terrain-800)]">
        {badge.earned ? <Trophy className="h-8 w-8" /> : <Lock className="h-7 w-7 text-[var(--ink-500)]" />}
      </div>
      <div className="mt-3 text-center">
        <div className="font-[var(--f-serif)] text-base font-semibold text-[var(--ink-950)]">{badge.name}</div>
        <p className="mt-1 min-h-10 text-xs text-[var(--ink-500)]">{badge.description}</p>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="w-12 shrink-0 font-[var(--f-mono)] text-[10px] text-[var(--ink-700)]">
          {current}/{target}
        </span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--ink-200)]">
          <div className="h-full rounded-full bg-[var(--horizon-700)]" style={{ width: `${progressPercent(current, target)}%` }} />
        </div>
      </div>
    </div>
  );
}

function BadgesPanel({ stats }: { stats?: AerodexStats }) {
  const badges = stats?.badges ?? [];

  return (
    <Panel title="Écussons" icon={Trophy}>
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
        {badges.map((badge) => (
          <BadgeMedal key={badge.id} badge={badge} visitedCount={stats?.visitedCount ?? 0} />
        ))}
        {badges.length === 0 && (
          <p className="col-span-full text-sm text-[var(--ink-500)]">Les badges apparaîtront après tes premières visites.</p>
        )}
      </div>
    </Panel>
  );
}

function GoalsPanel({ stats }: { stats?: AerodexStats }) {
  const goals = [
    {
      name: "Grand voyageur",
      icon: Star,
      current: stats?.visitedCount ?? 0,
      target: 10,
      xp: 250,
      hint: "Encore quelques terrains pour décrocher l'écusson bronze.",
    },
    {
      name: "Premier altiport",
      icon: Mountain,
      current: stats?.byType.altiport.visited ?? 0,
      target: 1,
      xp: 400,
      hint: "Un terrain de montagne suffit pour ouvrir la série.",
    },
    {
      name: "Favoris qualifiés",
      icon: Heart,
      current: stats?.favoriteCount ?? 0,
      target: 5,
      xp: 180,
      hint: "Garde tes meilleurs terrains sous la main.",
    },
  ];

  return (
    <Panel title="Prochains objectifs" icon={Target}>
      <div className="space-y-4 p-4 sm:p-5">
        {goals.map(({ name, icon: Icon, current, target, xp, hint }) => (
          <div key={name} className="rounded-lg border border-[var(--ink-200)] bg-[var(--paper-50)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 font-semibold text-[var(--ink-950)]">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--terrain-100)] text-[var(--terrain-800)]">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="truncate">{name}</span>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--horizon-50)] px-2 py-1 font-[var(--f-mono)] text-[10px] font-semibold text-[var(--horizon-700)]">
                +{xp} XP
              </span>
            </div>
            <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
              <span className="font-[var(--f-mono)] text-[10px] text-[var(--ink-700)]">{Math.min(current, target)} / {target}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--ink-200)]">
                <div className="h-full rounded-full bg-[var(--horizon-700)]" style={{ width: `${progressPercent(current, target)}%` }} />
              </div>
              <span className="font-[var(--f-mono)] text-[10px] text-[var(--ink-500)]">{progressPercent(current, target)}%</span>
            </div>
            <p className="mt-2 text-xs text-[var(--ink-500)]">{hint}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ActivityPanel({ visits, badges }: { visits: VisitEntry[]; badges: AerodexBadge[] }) {
  const items = [
    ...badges
      .filter((badge) => badge.earned)
      .slice(0, 2)
      .map((badge) => ({
        key: `badge-${badge.id}`,
        type: "badge" as const,
        title: `Badge débloqué : ${badge.name}`,
        meta: badge.earnedAt ? new Date(badge.earnedAt).toLocaleDateString("fr-FR") : "+140 XP",
      })),
    ...visits.slice(0, 5).map((visit) => ({
      key: `visit-${visit.id}`,
      type: "visit" as const,
      title: `Nouveau tampon : ${visit.aerodrome.icaoCode ?? ""} ${visit.aerodrome.name}`.trim(),
      meta: `${formatStampDate(visit.visitedAt)} · +80 XP`,
    })),
  ].slice(0, 6);

  return (
    <Panel title="Activité" icon={Clock3}>
      <div className="p-4 sm:p-5">
        {items.length === 0 ? (
          <p className="text-sm text-[var(--ink-500)]">Aucune activité pour le moment.</p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const Icon = item.type === "badge" ? BadgeCheck : MapPin;
              return (
                <div key={item.key} className="grid grid-cols-[32px_1fr] gap-3">
                  <div
                    className={`grid h-8 w-8 place-items-center rounded-full ${
                      item.type === "badge"
                        ? "bg-[var(--terrain-100)] text-[var(--terrain-800)]"
                        : "bg-[var(--horizon-50)] text-[var(--horizon-700)]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--ink-950)]">{item.title}</div>
                    <div className="mt-0.5 text-xs text-[var(--ink-500)]">{item.meta}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}

export default function AerodexPage() {
  const { user } = useAuth();
  const [activeType, setActiveType] = useState<TypeFilter>("all");

  const { data: statsRes } = useQuery({
    queryKey: ["aerodex-stats"],
    queryFn: () => apiClient.get<AerodexStats>("/visits/stats"),
    enabled: !!user,
  });

  const { data: visitsRes } = useQuery({
    queryKey: ["visits"],
    queryFn: () => apiClient.get<VisitEntry[]>("/visits"),
    enabled: !!user,
  });

  const stats = statsRes?.data;
  const visits = (visitsRes?.data ?? [])
    .filter((visit) => visit.status === "VISITED" || visit.status === "FAVORITE")
    .sort((a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime());

  const typedVisits = activeType === "all"
    ? visits
    : visits.filter((visit) => getTypeBucket(visit.aerodrome.aerodromeType) === activeType);

  if (!user) {
    return (
      <div className="min-h-[70vh] bg-[var(--paper-50)] px-4 py-16">
        <div className="mx-auto max-w-lg rounded-xl border border-[var(--ink-200)] bg-white p-8 text-center shadow-[var(--shadow-lift)]">
          <BookOpen className="mx-auto h-12 w-12 text-[var(--horizon-700)]" />
          <h1 className="mt-4 font-[var(--f-serif)] text-3xl font-medium text-[var(--ink-950)]">Aérodex</h1>
          <p className="mt-2 text-sm text-[var(--ink-500)]">
            Connecte-toi pour suivre tes visites, collectionner tes tampons et débloquer tes badges.
          </p>
          <Button asChild className="mt-6">
            <Link href="/login">Se connecter</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[radial-gradient(900px_420px_at_8%_-8%,oklch(0.94_0.04_85),transparent_60%),radial-gradient(720px_360px_at_108%_2%,oklch(0.95_0.03_250),transparent_55%),var(--paper-50)]">
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Hero stats={stats} />

        <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="font-[var(--f-mono)] text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--terrain-700)]">
              Progression par terrain
            </div>
            <h1 className="mt-2 flex items-center gap-3 font-[var(--f-serif)] text-3xl font-medium tracking-normal text-[var(--ink-950)] sm:text-4xl">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-[var(--brass-100)] text-[var(--brass-700)]">
                <BookOpen className="h-5 w-5" />
              </span>
              Aérodex
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-[var(--ink-500)]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ink-200)] bg-white px-3 py-1.5">
              <Route className="h-3.5 w-3.5 text-[var(--terrain-700)]" />
              {formatNm(stats?.estimatedDistanceNm ?? 0)} estimés
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ink-200)] bg-white px-3 py-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-[var(--horizon-700)]" />
              {visits.length} tampons
            </span>
          </div>
        </div>

        <div className="mt-5">
          <TypeTabs stats={stats} active={activeType} onChange={setActiveType} />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px] xl:items-start">
          <div className="space-y-6">
            <Panel
              title="Carte de progression"
              icon={Map}
              right={<span className="text-xs text-[var(--ink-500)]">Vue synthèse</span>}
            >
              <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1fr_260px]">
                <div className="grid min-h-[260px] place-items-center rounded-lg border border-dashed border-[var(--ink-200)] bg-[var(--paper-50)] p-6 text-center">
                  <div>
                    <Map className="mx-auto h-12 w-12 text-[var(--horizon-700)]" />
                    <p className="mt-3 font-[var(--f-serif)] text-xl font-medium text-[var(--ink-950)]">
                      Couverture nationale
                    </p>
                    <p className="mx-auto mt-1 max-w-md text-sm text-[var(--ink-500)]">
                      La carte détaillée arrivera quand les visites exposeront les régions. Pour l'instant,
                      cette vue conserve la progression par type et la collection réelle.
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="font-[var(--f-mono)] text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--ink-500)]">
                    Légende
                  </div>
                  {(Object.keys(typeMeta) as Exclude<TypeFilter, "all">[]).map((key) => {
                    const entry = stats?.byType[key] ?? { visited: 0, total: 0 };
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setActiveType(activeType === key ? "all" : key)}
                        className="grid w-full grid-cols-[1fr_auto] items-center gap-3 border-b border-dashed border-[var(--ink-200)] py-2 text-left text-xs"
                      >
                        <span className="truncate text-[var(--ink-800)]">{typeMeta[key].label}</span>
                        <span className="font-[var(--f-mono)] text-[var(--ink-700)]">
                          {entry.visited}/{entry.total}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Panel>

            <BadgesPanel stats={stats} />
            <CollectionSection items={typedVisits} />
          </div>

          <aside className="space-y-6">
            <GoalsPanel stats={stats} />
            <ActivityPanel visits={visits} badges={stats?.badges ?? []} />
          </aside>
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-lg border border-[var(--ink-200)] bg-white px-4 py-3 text-xs text-[var(--ink-500)]">
          <Eye className="mt-0.5 h-4 w-4 shrink-0 text-[var(--horizon-700)]" />
          <span>
            Les tampons et l'XP se mettent à jour avec tes visites. Les objectifs utilisent les données déjà
            disponibles dans Navventura.
          </span>
        </div>
      </main>
    </div>
  );
}
