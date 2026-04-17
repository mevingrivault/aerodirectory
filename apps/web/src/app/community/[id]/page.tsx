"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CommunityFollowListItem,
  CommunityPublicProfile,
  PublicSavedSearchItem,
} from "@aerodirectory/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import {
  ArrowLeft,
  FileText,
  Footprints,
  Heart,
  Image,
  MapPin,
  MessageSquare,
  Route,
  Search,
  ShieldCheck,
  UserCircle2,
  UserPlus,
  Users,
} from "lucide-react";

function buildReplayHref(searchItem: PublicSavedSearchItem) {
  const replayParams = { ...searchItem.params };
  if (searchItem.scope === "planner") {
    delete replayParams["profileId"];
  }
  const params = new URLSearchParams(replayParams);
  return searchItem.scope === "planner"
    ? `/planner?${params.toString()}`
    : `/search?${params.toString()}`;
}

function FollowListCard({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: CommunityFollowListItem[];
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={`/community/${item.id}`}
              className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40"
            >
              {item.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.avatarUrl}
                  alt={`Avatar de ${item.displayName}`}
                  className="h-11 w-11 rounded-full border object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full border bg-muted">
                  <UserCircle2 className="h-5 w-5 text-muted-foreground" />
                </div>
              )}

              <div className="min-w-0">
                <div className="truncate font-medium">{item.displayName}</div>
                <div className="truncate text-sm text-muted-foreground">
                  {item.bio || "Membre Navventura"}
                </div>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SavedSearchSummary({ params }: { params: Record<string, string> }) {
  const visibleEntries = Object.entries(params)
    .filter(([, value]) => value)
    .slice(0, 4);

  if (visibleEntries.length === 0) {
    return <span className="text-sm text-muted-foreground">Recherche sans filtre detaille</span>;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {visibleEntries.map(([key, value]) => (
        <Badge key={`${key}:${value}`} variant="outline">
          {key}: {value}
        </Badge>
      ))}
    </div>
  );
}

export default function CommunityProfilePage() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["community-profile", id],
    queryFn: () => apiClient.get<CommunityPublicProfile>(`/auth/community/${id}`),
    enabled: !!id,
  });

  const { data: followersData } = useQuery({
    queryKey: ["community-followers", id],
    queryFn: () => apiClient.get<CommunityFollowListItem[]>(`/auth/community/${id}/followers`),
    enabled: !!id,
  });

  const { data: followingData } = useQuery({
    queryKey: ["community-following", id],
    queryFn: () => apiClient.get<CommunityFollowListItem[]>(`/auth/community/${id}/following`),
    enabled: !!id,
  });

  const { data: followStatusData } = useQuery({
    queryKey: ["community-follow-status", id],
    queryFn: () => apiClient.get<{ isFollowing: boolean; canFollow: boolean }>(`/auth/community/${id}/follow-status`),
    enabled: !!id && !!user && user.id !== id,
  });

  const { data: publicSearchesData } = useQuery({
    queryKey: ["community-public-searches", id],
    queryFn: () => apiClient.get<PublicSavedSearchItem[]>(`/search/public/${id}`),
    enabled: !!id,
  });

  const { data: similarSearchesData } = useQuery({
    queryKey: ["community-similar-searches", id],
    queryFn: () => apiClient.get<PublicSavedSearchItem[]>(`/search/public/${id}/similar`),
    enabled: !!id,
  });

  const followMutation = useMutation({
    mutationFn: () => apiClient.post(`/auth/community/${id}/follow`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["community-profile", id] }),
        queryClient.invalidateQueries({ queryKey: ["community-follow-status", id] }),
        queryClient.invalidateQueries({ queryKey: ["community-followers", id] }),
      ]);
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: () => apiClient.delete(`/auth/community/${id}/follow`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["community-profile", id] }),
        queryClient.invalidateQueries({ queryKey: ["community-follow-status", id] }),
        queryClient.invalidateQueries({ queryKey: ["community-followers", id] }),
      ]);
    },
  });

  const profile = data?.data;
  const followers = followersData?.data ?? [];
  const following = followingData?.data ?? [];
  const followStatus = followStatusData?.data;
  const publicSearches = publicSearchesData?.data ?? [];
  const similarSearches = similarSearchesData?.data ?? [];
  const isOwnProfile = user?.id === id;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
        Chargement du profil communautaire...
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-12">
        <Link
          href="/search"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Ce profil communautaire n&apos;est pas disponible.
          </CardContent>
        </Card>
      </div>
    );
  }

  const followButtonVisible = !!user && !isOwnProfile && followStatus?.canFollow !== false;
  const followPending = followMutation.isPending || unfollowMutation.isPending;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/search"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>

      <Card className="mb-6 overflow-hidden">
        <CardContent className="grid gap-6 py-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt={`Avatar de ${profile.displayName}`}
                className="h-28 w-28 rounded-full border object-cover"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full border bg-muted">
                <UserCircle2 className="h-14 w-14 text-muted-foreground" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-bold">{profile.displayName}</h1>
                <Badge variant="secondary">Membre</Badge>
                {profile.badges.length > 0 && (
                  <Badge variant="outline">
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                    {profile.badges.length} badge{profile.badges.length > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>

              <p className="mt-2 text-sm text-muted-foreground">
                Membre depuis {new Date(profile.createdAt).toLocaleDateString("fr-FR")}
              </p>

              {profile.homeAerodrome && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{profile.homeAerodrome.name}</span>
                  {profile.homeAerodrome.icaoCode && (
                    <Badge variant="outline">{profile.homeAerodrome.icaoCode}</Badge>
                  )}
                </div>
              )}

              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground">
                {profile.bio || "Ce membre n'a pas encore ajoute de presentation."}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="text-sm text-muted-foreground">Followers</div>
              <div className="mt-1 text-3xl font-semibold">{profile.followersCount}</div>
            </div>
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="text-sm text-muted-foreground">Following</div>
              <div className="mt-1 text-3xl font-semibold">{profile.followingCount}</div>
            </div>
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="text-sm text-muted-foreground">Visites</div>
              <div className="mt-1 text-3xl font-semibold">{profile.stats.visitedCount}</div>
            </div>

            {followButtonVisible ? (
              <Button
                className="lg:mt-2"
                disabled={followPending}
                onClick={() => {
                  if (followStatus?.isFollowing) {
                    unfollowMutation.mutate();
                    return;
                  }

                  followMutation.mutate();
                }}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                {followPending
                  ? "Mise a jour..."
                  : followStatus?.isFollowing
                    ? "Ne plus suivre"
                    : "Suivre"}
              </Button>
            ) : !user ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Connectez-vous pour suivre ce membre.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Statistiques publiques</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Footprints className="h-4 w-4" /> Terrains visites
                </div>
                <div className="mt-2 text-2xl font-semibold">{profile.stats.visitedCount}</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Heart className="h-4 w-4" /> Favoris
                </div>
                <div className="mt-2 text-2xl font-semibold">{profile.stats.favoriteCount}</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" /> Terrains vus
                </div>
                <div className="mt-2 text-2xl font-semibold">{profile.stats.seenCount}</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Route className="h-4 w-4" /> Distance estimee
                </div>
                <div className="mt-2 text-2xl font-semibold">{profile.stats.estimatedDistanceNm} NM</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Participation communautaire</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MessageSquare className="h-4 w-4" /> Commentaires
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {profile.contributionStats.comments}
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" /> Contributions
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {profile.contributionStats.corrections}
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Image className="h-4 w-4" /> Photos
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {profile.contributionStats.photos}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dernieres visites</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.recentVisits.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune visite publique a afficher pour le moment.
                </p>
              ) : (
                profile.recentVisits.map((visit) => (
                  <div
                    key={visit.id}
                    className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="font-medium">{visit.aerodrome.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {[visit.aerodrome.icaoCode, visit.aerodrome.city].filter(Boolean).join(" · ") || "Terrain visite"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={visit.status === "FAVORITE" ? "default" : "secondary"}>
                        {visit.status === "FAVORITE" ? "Favori" : "Visite"}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {new Date(visit.visitedAt).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {publicSearches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recherches publiques recentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {publicSearches.map((searchItem) => (
                  <div key={searchItem.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{searchItem.name}</div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          <Search className="mr-1 h-3.5 w-3.5" />
                          {searchItem.scope === "planner" ? "Planif" : "Recherche"}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {new Date(searchItem.updatedAt).toLocaleDateString("fr-FR")}
                        </span>
                      </div>
                    </div>
                    <SavedSearchSummary params={searchItem.params} />
                    <div className="mt-3">
                      <Link href={buildReplayHref(searchItem)}>
                        <Button variant="outline" size="sm">
                          Rejouer
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {similarSearches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Les utilisateurs similaires ont cherche…</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {similarSearches.map((searchItem) => (
                  <div key={searchItem.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{searchItem.name}</div>
                        <div className="text-sm text-muted-foreground">
                          <Link href={`/community/${searchItem.user.id}`} className="hover:underline">
                            {searchItem.user.displayName}
                          </Link>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          <Search className="mr-1 h-3.5 w-3.5" />
                          {searchItem.scope === "planner" ? "Planif" : "Recherche"}
                        </Badge>
                        <Link href={buildReplayHref(searchItem)}>
                          <Button variant="outline" size="sm">
                            Rejouer
                          </Button>
                        </Link>
                      </div>
                    </div>
                    <SavedSearchSummary params={searchItem.params} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Badges obtenus</CardTitle>
            </CardHeader>
            <CardContent>
              {profile.badges.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun badge debloque publiquement pour le moment.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {profile.badges.map((badge) => (
                    <Badge key={badge.id} variant="outline" className="px-3 py-1">
                      {badge.name}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <FollowListCard
            title="Followers"
            items={followers}
            emptyLabel="Aucun follower public pour le moment."
          />

          <FollowListCard
            title="Abonnements"
            items={following}
            emptyLabel="Aucun abonnement public a afficher."
          />
        </div>
      </div>
    </div>
  );
}
