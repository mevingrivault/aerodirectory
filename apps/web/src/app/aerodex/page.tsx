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
  Plane,
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
  };
}

function VisitRow({ v }: { v: VisitEntry }) {
  const icon =
    v.status === "FAVORITE" ? (
      <Heart className="h-4 w-4 text-red-500" />
    ) : (
      <Star className="h-4 w-4 text-yellow-500" />
    );
  return (
    <Link href={`/aerodrome/${v.aerodrome.id}`}>
      <div className="flex items-center justify-between rounded-md border p-3 hover:bg-accent/50 transition-colors gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0">{icon}</div>
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

function VisitList({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  items: VisitEntry[];
  empty: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
          {items.length > 0 && (
            <span className="ml-auto text-sm font-normal text-muted-foreground">
              {items.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          <>
            <div className="space-y-2">
              {visible.map((v) => (
                <VisitRow key={v.id} v={v} />
              ))}
            </div>
            {items.length > PAGE_SIZE && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setShowAll((s) => !s)}
              >
                {showAll ? "Voir moins" : `Voir les ${items.length - PAGE_SIZE} suivants`}
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

  const visited = visits.filter((v) => v.status === "VISITED" || v.status === "FAVORITE");
  const favorites = visits.filter((v) => v.status === "FAVORITE");

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

      {/* Stats */}
      {stats && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Card>
              <CardContent className="p-3 sm:p-4 text-center">
                <Plane className="mx-auto h-5 w-5 sm:h-6 sm:w-6 text-primary mb-1" />
                <div className="text-xl sm:text-2xl font-bold">{stats.visitedCount}</div>
                <div className="text-xs sm:text-sm text-muted-foreground">Visités</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4 text-center">
                <Heart className="mx-auto h-5 w-5 sm:h-6 sm:w-6 text-red-500 mb-1" />
                <div className="text-xl sm:text-2xl font-bold">{stats.favoriteCount}</div>
                <div className="text-xs sm:text-sm text-muted-foreground">Favoris</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4 text-center">
                <MapPin className="mx-auto h-5 w-5 sm:h-6 sm:w-6 text-green-500 mb-1" />
                <div className="text-xl sm:text-2xl font-bold">
                  {formatNm(stats.estimatedDistanceNm)}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">Dist. estimée</div>
              </CardContent>
            </Card>
          </div>

          {/* Progress bar */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Progression de la collection</span>
                <span className="text-sm text-muted-foreground">
                  {stats.visitedCount} / {stats.totalAerodromes}
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-secondary">
                <div
                  className="h-3 rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, (stats.visitedCount / Math.max(1, stats.totalAerodromes)) * 100)}%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Badges */}
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

      {/* Lists */}
      <div className="space-y-6">
        <VisitList
          title="Mes Visites"
          icon={<Star className="h-5 w-5 text-yellow-500" />}
          items={visited}
          empty="Aucune visite pour l'instant. Commencez à explorer les aérodromes !"
        />
        <VisitList
          title="Mes Favoris"
          icon={<Heart className="h-5 w-5 text-red-500" />}
          items={favorites}
          empty="Aucun favori pour l'instant."
        />
      </div>
    </div>
  );
}
