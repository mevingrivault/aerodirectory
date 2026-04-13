"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, FileText, X } from "lucide-react";
import type { AdminCorrectionListItem } from "@aerodirectory/shared";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STATUS_LABELS: Record<AdminCorrectionListItem["contentStatus"], string> = {
  PENDING: "En attente",
  APPROVED: "Publiée",
  REJECTED: "Rejetée",
  FLAGGED: "Signalée",
};

function formatFieldLabel(field: string) {
  const labels: Record<string, string> = {
    name: "Nom",
    city: "Ville",
    region: "Région",
    description: "Description",
    website: "Site web",
    aip: "Lien AIP",
    vac: "Lien VAC",
    restaurant: "Restauration",
    transport: "Transport",
    "hébergement": "Hébergement",
    maintenance: "Maintenance",
    hangars: "Hangars",
    runways: "Pistes",
    frequencies: "Fréquences",
    fuels: "Carburants",
    local: "Info locale / conseil pilote",
  };

  return labels[field] ?? field;
}

export default function AdminCorrectionsPage() {
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

  const correctionsQuery = useQuery({
    queryKey: ["admin-corrections", search, state],
    queryFn: () =>
      apiClient.get<AdminCorrectionListItem[]>("/admin/corrections", {
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

  const corrections = correctionsQuery.data?.data ?? [];

  const handleApprove = async (correction: AdminCorrectionListItem) => {
    const note = window.prompt("Note interne optionnelle :") ?? "";
    try {
      await apiClient.post(`/admin/corrections/${correction.id}/approve`, {
        note: note.trim() || undefined,
      });
      setFeedback({ type: "success", message: "Contribution publiée." });
      await correctionsQuery.refetch();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Impossible de publier cette contribution.",
      });
    }
  };

  const handleReject = async (correction: AdminCorrectionListItem) => {
    const note = window.prompt("Motif interne optionnel :") ?? "";
    try {
      await apiClient.post(`/admin/corrections/${correction.id}/reject`, {
        note: note.trim() || undefined,
      });
      setFeedback({ type: "success", message: "Contribution rejetée." });
      await correctionsQuery.refetch();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Impossible de rejeter cette contribution.",
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
        <h1 className="text-3xl font-bold">Contributions communautaires</h1>
        <p className="text-sm text-muted-foreground">
          Publier ou rejeter les propositions membres sans modifier la donnée importée.
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

      <div className="mb-6 grid gap-3 lg:grid-cols-[1fr_220px]">
        <Input
          placeholder="Rechercher par champ, valeur, auteur, aérodrome..."
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
          <option value="pending">En attente</option>
          <option value="approved">Publiées</option>
          <option value="rejected">Rejetées</option>
          <option value="all">Toutes</option>
        </select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            File de modération
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {corrections.map((correction) => (
            <div key={correction.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{formatFieldLabel(correction.field)}</Badge>
                <Badge
                  variant={
                    correction.contentStatus === "PENDING"
                      ? "warning"
                      : correction.contentStatus === "APPROVED"
                        ? "success"
                        : correction.contentStatus === "REJECTED"
                          ? "destructive"
                          : "outline"
                  }
                >
                  {STATUS_LABELS[correction.contentStatus]}
                </Badge>
                <Badge variant="outline">
                  {correction.aerodrome.icaoCode
                    ? `${correction.aerodrome.name} (${correction.aerodrome.icaoCode})`
                    : correction.aerodrome.name}
                </Badge>
              </div>

              <div className="space-y-2 text-sm">
                <div className="text-muted-foreground">
                  Proposé par {correction.user.displayName || correction.user.email} ·{" "}
                  {new Date(correction.createdAt).toLocaleString("fr-FR")}
                </div>
                {correction.currentValue && (
                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                      Référence officielle
                    </div>
                    <div className="whitespace-pre-wrap">{correction.currentValue}</div>
                  </div>
                )}
                <div className="rounded-md border bg-primary/5 p-3">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    Proposition membre
                  </div>
                  <div className="whitespace-pre-wrap">{correction.proposedValue}</div>
                </div>
                {correction.reason && (
                  <div className="text-muted-foreground whitespace-pre-wrap">
                    <span className="font-medium">Contexte :</span> {correction.reason}
                  </div>
                )}
              </div>

              {correction.contentStatus === "PENDING" && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => handleApprove(correction)}>
                    <Check className="mr-2 h-4 w-4" />
                    Publier
                  </Button>
                  <Button variant="destructive" onClick={() => handleReject(correction)}>
                    <X className="mr-2 h-4 w-4" />
                    Rejeter
                  </Button>
                </div>
              )}
            </div>
          ))}

          {corrections.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucune contribution trouvée.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
