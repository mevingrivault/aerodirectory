"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ImagePlus, X } from "lucide-react";
import type { AdminPhotoListItem } from "@aerodirectory/shared";
import { apiClient } from "@/lib/api-client";
import { API_BASE } from "@/lib/public-env";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const PHOTO_STATE_LABELS: Record<string, string> = {
  PENDING: "En attente",
  READY: "Publiée",
  REJECTED: "Rejetée",
  SCANNING: "Analyse",
};

export default function AdminPhotosPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!loading && user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [loading, router, user]);

  const photosQuery = useQuery({
    queryKey: ["admin-photos", search, state],
    queryFn: () =>
      apiClient.get<AdminPhotoListItem[]>("/admin/photos", {
        page: "1",
        limit: "30",
        ...(search ? { search } : {}),
        state,
      }),
    enabled: user?.role === "ADMIN",
  });

  if (loading || !user || user.role !== "ADMIN") {
    return null;
  }

  const photos = photosQuery.data?.data ?? [];

  const handleApprove = async (photo: AdminPhotoListItem) => {
    if (!window.confirm("Valider cette photo pour la rendre publique ?")) {
      return;
    }

    const note = window.prompt("Note interne optionnelle :") ?? "";

    try {
      await apiClient.post(`/admin/photos/${photo.id}/approve`, {
        note: note.trim() || undefined,
      });
      setFeedback({ type: "success", message: "Photo validée avec succès." });
      await photosQuery.refetch();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Impossible de valider cette photo.",
      });
    }
  };

  const handleReject = async (photo: AdminPhotoListItem) => {
    if (!window.confirm("Rejeter cette photo ?")) {
      return;
    }

    const reason = window.prompt("Raison du rejet :") ?? "";

    try {
      await apiClient.post(`/admin/photos/${photo.id}/reject`, {
        reason: reason.trim() || undefined,
      });
      setFeedback({ type: "success", message: "Photo rejetée avec succès." });
      await photosQuery.refetch();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Impossible de rejeter cette photo.",
      });
    }
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/admin"
          className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour a l&apos;administration
        </Link>
        <h1 className="text-3xl font-bold">Photos</h1>
        <p className="text-sm text-muted-foreground">
          Validation des photos avant publication publique.
        </p>
      </div>

      {feedback && (
        <div
          className={`mb-4 rounded-md border p-3 text-sm ${
            feedback.type === "success"
              ? "border-green-300 bg-green-50 text-green-800"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="mb-6 grid gap-3 md:grid-cols-[1fr_220px]">
        <Input
          placeholder="Rechercher par aerodrome, ICAO, auteur ou e-mail"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          value={state}
          onChange={(event) =>
            setState(event.target.value as "pending" | "approved" | "rejected" | "all")
          }
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="pending">Photos en attente</option>
          <option value="approved">Photos publiées</option>
          <option value="rejected">Photos rejetées</option>
          <option value="all">Toutes les photos</option>
        </select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ImagePlus className="h-5 w-5" />
            File de modération photo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {photos.map((photo) => (
            <div key={photo.id} className="grid gap-4 rounded-lg border p-4 lg:grid-cols-[280px_1fr]">
              <div className="overflow-hidden rounded-lg border bg-muted aspect-video">
                <img
                  src={`${API_BASE}/admin/photos/${photo.id}/file`}
                  alt={`Photo proposée par ${photo.user.displayName || photo.user.email}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      photo.status === "PENDING"
                        ? "warning"
                        : photo.status === "READY"
                          ? "success"
                          : photo.status === "REJECTED"
                            ? "destructive"
                            : "outline"
                    }
                  >
                    {PHOTO_STATE_LABELS[photo.status] ?? photo.status}
                  </Badge>
                  <Badge variant="outline">
                    {photo.aerodrome.icaoCode
                      ? `${photo.aerodrome.name} (${photo.aerodrome.icaoCode})`
                      : photo.aerodrome.name}
                  </Badge>
                  {(photo.width || photo.height) && (
                    <Badge variant="outline">
                      {[photo.width, photo.height].filter(Boolean).join(" × ")} px
                    </Badge>
                  )}
                </div>

                <div className="space-y-1 text-sm">
                  <p>
                    <span className="font-medium">
                      {photo.user.displayName || "Sans pseudo"}
                    </span>
                    <span className="text-muted-foreground"> · {photo.user.email}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Envoyée le {new Date(photo.createdAt).toLocaleString("fr-FR")}
                  </p>
                  {photo.reviewedAt && (
                    <p className="text-muted-foreground">
                      Traitée le {new Date(photo.reviewedAt).toLocaleString("fr-FR")}
                      {photo.reviewedBy
                        ? ` par ${photo.reviewedBy.displayName || photo.reviewedBy.email}`
                        : ""}
                    </p>
                  )}
                  {photo.rejectedReason && (
                    <p className="text-sm text-destructive">Motif : {photo.rejectedReason}</p>
                  )}
                </div>

                {photo.status === "PENDING" && (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={() => handleApprove(photo)}>
                      <Check className="mr-2 h-4 w-4" />
                      Valider
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => handleReject(photo)}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Rejeter
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {photos.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune photo trouvée.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
