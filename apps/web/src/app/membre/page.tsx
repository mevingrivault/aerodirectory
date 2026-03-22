"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNm } from "@/lib/utils";
import {
  BookOpen,
  Navigation,
  User,
  Eye,
  Star,
  Heart,
  MapPin,
  Trophy,
  Plane,
  ChevronRight,
  Map,
  Search,
} from "lucide-react";
import type { AerodexStats } from "@aerodirectory/shared";

interface VisitEntry {
  id: string;
  status: string;
  visitedAt: string;
  aerodrome: { id: string; name: string; icaoCode: string | null; city: string | null };
}

export default function MemberPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

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
  const recentVisits = (visitsRes?.data ?? []).slice(0, 5);
  const earnedBadges = stats?.badges.filter((b) => b.earned) ?? [];

  if (!user) return null;

  const initials = (user.displayName || user.email)
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const statusIcon = (status: string) => {
    switch (status) {
      case "SEEN": return <Eye className="h-4 w-4 text-blue-500" />;
      case "VISITED": return <Star className="h-4 w-4 text-yellow-500" />;
      case "FAVORITE": return <Heart className="h-4 w-4 text-red-500" />;
      default: return null;
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold">
          {initials}
        </div>
        <div>
          <h1 className="text-2xl font-bold">
            {user.displayName || user.email}
          </h1>
          <p className="text-muted-foreground text-sm">
            {user.role === "ADMIN" && <Badge variant="destructive" className="mr-2">Admin</Badge>}
            {user.role === "MODERATOR" && <Badge variant="secondary" className="mr-2">Modérateur</Badge>}
            Membre depuis {new Date(user.createdAt).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-6">
          <Card>
            <CardContent className="p-4 text-center">
              <Plane className="mx-auto h-5 w-5 text-primary mb-1" />
              <div className="text-2xl font-bold">{stats.visitedCount}</div>
              <div className="text-xs text-muted-foreground">Visités</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Eye className="mx-auto h-5 w-5 text-blue-500 mb-1" />
              <div className="text-2xl font-bold">{stats.seenCount}</div>
              <div className="text-xs text-muted-foreground">Vus</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Heart className="mx-auto h-5 w-5 text-red-500 mb-1" />
              <div className="text-2xl font-bold">{stats.favoriteCount}</div>
              <div className="text-xs text-muted-foreground">Favoris</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <MapPin className="mx-auto h-5 w-5 text-green-500 mb-1" />
              <div className="text-2xl font-bold">{formatNm(stats.estimatedDistanceNm)}</div>
              <div className="text-xs text-muted-foreground">Estimée</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Quick actions */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Navigation rapide
          </h2>
          {[
            { href: "/aerodex", icon: BookOpen, label: "Aérodex", desc: "Mes visites et badges" },
            { href: "/planner", icon: Navigation, label: "Planificateur", desc: "Calculer mes routes" },
            { href: "/map", icon: Map, label: "Carte", desc: "Explorer la carte" },
            { href: "/search", icon: Search, label: "Recherche", desc: "Trouver un aérodrome" },
            { href: "/profile", icon: User, label: "Profil", desc: "Paramètres du compte" },
          ].map(({ href, icon: Icon, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="font-medium text-sm">{label}</div>
                  <div className="text-xs text-muted-foreground">{desc}</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>

        <div className="space-y-6">
          {/* Badges */}
          {earnedBadges.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Badges obtenus
              </h2>
              <div className="flex flex-wrap gap-2">
                {earnedBadges.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-1.5 rounded-full border border-yellow-300 bg-yellow-50 px-3 py-1"
                    title={b.description}
                  >
                    <Trophy className="h-3.5 w-3.5 text-yellow-500" />
                    <span className="text-xs font-medium">{b.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent visits */}
          {recentVisits.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Dernières visites
                </h2>
                <Link href="/aerodex" className="text-xs text-primary hover:underline">
                  Voir tout
                </Link>
              </div>
              <div className="space-y-1.5">
                {recentVisits.map((v) => (
                  <Link key={v.id} href={`/aerodrome/${v.aerodrome.id}`}>
                    <div className="flex items-center justify-between rounded-md border p-2.5 hover:bg-accent/50 transition-colors">
                      <div className="flex items-center gap-2">
                        {statusIcon(v.status)}
                        <span className="text-sm font-medium">{v.aerodrome.name}</span>
                        {v.aerodrome.icaoCode && (
                          <Badge variant="secondary" className="text-xs">{v.aerodrome.icaoCode}</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(v.visitedAt).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {recentVisits.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Plane className="mx-auto h-8 w-8 text-muted-foreground mb-2 opacity-40" />
              <p className="text-sm text-muted-foreground">
                Aucune visite pour l&apos;instant.{" "}
                <Link href="/search" className="text-primary hover:underline">
                  Explorer des aérodromes
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
