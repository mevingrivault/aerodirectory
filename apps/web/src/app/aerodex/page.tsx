"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNm } from "@/lib/utils";
import {
  Trophy,
  MapPin,
  Star,
  Heart,
  BookOpen,
} from "lucide-react";
import type { AerodexStats } from "@aerodirectory/shared";

const PAGE_SIZE = 10;

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

function getTypeBucket(aerodromeType: string): TypeFilter {
  if (aerodromeType === "ULTRALIGHT_FIELD") return "ulm";
  if (aerodromeType === "HELIPORT") return "heli";
  if (aerodromeType === "ALTIPORT") return "altiport";
  return "aerodromes";
}

function VisitRow({ v }: { v: VisitEntry }) {
  return (
    <Link href={`/aerodrome/${v.aerodrome.id}`}>
      <div className="flex items-center justify-between rounded-md border p-3 transition-colors gap-2 hover:bg-accent/50">
        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0">
            {v.status === "FAVORITE"
              ? <Heart className="h-4 w-4 text-red-500" />
              : <Star className="h-4 w-4 text-yellow-500" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium truncate">{v.aerodrome.name}</span>
              {v.aerodrome.icaoCode && (
                <Badge variant="secondary" className="shrink-0">
                  {v.aerodrome.icaoCode}
                </Badge>
              )}
            </div>
            {v.aerodrome.city && (
              <span className="text-xs text-muted-foreground truncate hidden sm:block">
                {v.aerodrome.city}
              </span>
            )}
          </div>
        </div>
        <span className="text-xs sm:text-sm text-muted-foreground shrink-0">
          {new Date(v.visitedAt).toLocaleDateString("fr-FR")}
        </span>
      </div>
    </Link>
  );
}

function VisitSection({ items }: { items: VisitEntry[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [showAll, setShowAll] = useState(false);

  const filtered = items.filter((v) => {
    const statusOk =
      statusFilter === "all" ||
      (statusFilter === "favorite" && v.status === "FAVORITE") ||
      (statusFilter === "visited" && v.status !== "FAVORITE");
    const typeOk = typeFilter === "all" || getTypeBucket(v.aerodrome.aerodromeType) === typeFilter;
    return statusOk && typeOk;
  });

  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);

  const filterBtn = (
    active: boolean,
    onClick: () => void,
    label: string,
  ) => (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-sm border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" />
          Ma collection
          <span className="ml-auto text-sm font-normal text-muted-foreground">{items.length}</span>
        </CardTitle>
        <div className="flex flex-wrap gap-2 pt-1">
          {filterBtn(statusFilter === "all", () => { setStatusFilter("all"); setShowAll(false); }, "Tous")}
          {filterBtn(statusFilter === "visited", () => { setStatusFilter("visited"); setShowAll(false); }, "Visités")}
          {filterBtn(statusFilter === "favorite", () => { setStatusFilter("favorite"); setShowAll(false); }, "Favoris")}
          <span className="w-px bg-border mx-1" />
          {filterBtn(typeFilter === "all", () => { setTypeFilter("all"); setShowAll(false); }, "Tous types")}
          {filterBtn(typeFilter === "aerodromes", () => { setTypeFilter("aerodromes"); setShowAll(false); }, "Aérodromes")}
          {filterBtn(typeFilter === "altiport", () => { setTypeFilter("altiport"); setShowAll(false); }, "Altiports")}
          {filterBtn(typeFilter === "ulm", () => { setTypeFilter("ulm"); setShowAll(false); }, "ULM")}
          {filterBtn(typeFilter === "heli", () => { setTypeFilter("heli"); setShowAll(false); }, "Héli")}
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune entrée pour ces filtres.</p>
        ) : (
          <>
            <div className="space-y-2">
              {visible.map((v) => <VisitRow key={v.id} v={v} />)}
            </div>
            {filtered.length > PAGE_SIZE && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setShowAll((s) => !s)}
              >
                {showAll ? "Voir moins" : `Voir les ${filtered.length - PAGE_SIZE} suivants`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AerodexPage() {
  const { user } = useAuth();

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
  const visits = visitsRes?.data ?? [];

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">Aérodex</h1>
        <p className="text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">
            Connectez-vous
          </Link>{" "}
          pour suivre vos visites et débloquer des badges.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
        <BookOpen className="h-8 w-8 text-primary" />
        Aérodex
      </h1>

      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Aérodromes", icon: <Star className="h-4 w-4 text-primary" />, ...stats.byType.aerodromes },
              { label: "Altiports", icon: <Star className="h-4 w-4 text-blue-500" />, ...stats.byType.altiport },
              { label: "Bases ULM", icon: <Star className="h-4 w-4 text-orange-500" />, ...stats.byType.ulm },
              { label: "Hélistations", icon: <Star className="h-4 w-4 text-purple-500" />, ...stats.byType.heli },
            ].map(({ label, icon, visited, total }) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      {icon}
                      {label}
                    </div>
                    <span className="text-sm text-muted-foreground">{visited} / {total}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-secondary">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, (visited / Math.max(1, total)) * 100)}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex items-center gap-4 mb-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Heart className="h-4 w-4 text-red-500" />
              <span>{stats.favoriteCount} favoris</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-green-500" />
              <span>{formatNm(stats.estimatedDistanceNm)} estimés</span>
            </div>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Trophy className="h-5 w-5" /> Badges
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {stats.badges.map((b) => (
                  <div
                    key={b.id}
                    className={`flex items-center gap-3 rounded-md border p-3 ${
                      b.earned ? "bg-yellow-50 border-yellow-300" : "opacity-40"
                    }`}
                  >
                    <Trophy
                      className={`h-6 w-6 shrink-0 ${
                        b.earned ? "text-yellow-500" : "text-muted-foreground"
                      }`}
                    />
                    <div>
                      <div className="font-medium text-sm">{b.name}</div>
                      <div className="text-xs text-muted-foreground">{b.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <VisitSection items={visits.filter((v) => v.status === "VISITED" || v.status === "FAVORITE")} />
    </div>
  );
}
