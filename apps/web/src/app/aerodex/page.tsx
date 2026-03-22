"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNm } from "@/lib/utils";
import {
  Trophy,
  MapPin,
  Eye,
  Star,
  Heart,
  Plane,
  BookOpen,
} from "lucide-react";
import type { AerodexStats } from "@aerodirectory/shared";

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

  const statusIcon = (status: string) => {
    switch (status) {
      case "SEEN": return <Eye className="h-4 w-4 text-blue-500" />;
      case "VISITED": return <Star className="h-4 w-4 text-yellow-500" />;
      case "FAVORITE": return <Heart className="h-4 w-4 text-red-500" />;
      default: return null;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
        <BookOpen className="h-8 w-8 text-primary" />
        Aérodex
      </h1>

      {/* Stats */}
      {stats && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <Card>
              <CardContent className="p-4 text-center">
                <Plane className="mx-auto h-6 w-6 text-primary mb-1" />
                <div className="text-2xl font-bold">{stats.visitedCount}</div>
                <div className="text-sm text-muted-foreground">Visités</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Eye className="mx-auto h-6 w-6 text-blue-500 mb-1" />
                <div className="text-2xl font-bold">{stats.seenCount}</div>
                <div className="text-sm text-muted-foreground">Vus</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Heart className="mx-auto h-6 w-6 text-red-500 mb-1" />
                <div className="text-2xl font-bold">{stats.favoriteCount}</div>
                <div className="text-sm text-muted-foreground">Favoris</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <MapPin className="mx-auto h-6 w-6 text-green-500 mb-1" />
                <div className="text-2xl font-bold">
                  {formatNm(stats.estimatedDistanceNm)}
                </div>
                <div className="text-sm text-muted-foreground">Dist. estimée</div>
              </CardContent>
            </Card>
          </div>

          {/* Progress bar */}
          <Card className="mb-8">
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
          <Card className="mb-8">
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
                      className={`h-6 w-6 ${
                        b.earned ? "text-yellow-500" : "text-muted-foreground"
                      }`}
                    />
                    <div>
                      <div className="font-medium text-sm">{b.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.description}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Visit list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mes Visites</CardTitle>
        </CardHeader>
        <CardContent>
          {visits.length === 0 ? (
            <p className="text-muted-foreground">
              Aucune visite pour l&apos;instant. Commencez à explorer les aérodromes !
            </p>
          ) : (
            <div className="space-y-2">
              {visits.map((v) => (
                <Link key={v.id} href={`/aerodrome/${v.aerodrome.id}`}>
                  <div className="flex items-center justify-between rounded-md border p-3 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      {statusIcon(v.status)}
                      <div>
                        <span className="font-medium">{v.aerodrome.name}</span>
                        {v.aerodrome.icaoCode && (
                          <Badge variant="secondary" className="ml-2">
                            {v.aerodrome.icaoCode}
                          </Badge>
                        )}
                        {v.aerodrome.city && (
                          <span className="ml-2 text-sm text-muted-foreground">
                            {v.aerodrome.city}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(v.visitedAt).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
