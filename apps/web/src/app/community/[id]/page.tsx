"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { CommunityPublicProfile } from "@aerodirectory/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";
import { MapPin, MessageSquare, Image, FileText, UserCircle2, ArrowLeft } from "lucide-react";

export default function CommunityProfilePage() {
  const params = useParams();
  const id = params.id as string;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["community-profile", id],
    queryFn: () => apiClient.get<CommunityPublicProfile>(`/auth/community/${id}`),
    enabled: !!id,
  });

  const profile = data?.data;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
        Chargement du profil communautaire...
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-12">
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

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/search"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-5 py-6 sm:flex-row sm:items-start">
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
    </div>
  );
}
