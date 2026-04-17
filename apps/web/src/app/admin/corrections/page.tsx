"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, PencilLine, X } from "lucide-react";
import type { AdminCorrectionListItem } from "@aerodirectory/shared";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  APPROVED: "Validée",
  REJECTED: "Rejetée",
  FLAGGED: "Signalée",
};

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
      setFeedback({ type: "success", message: "Correction validée." });
      await correctionsQuery.refetch();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Impossible de valider cette correction.",
      });
    }
  };

  const handleReject = async (correction: AdminCorrectionListItem) => {
    const note = window.prompt("Note interne optionnelle :") ?? "";
    try {
      await apiClient.post(`/admin/corrections/${correction.id}/reject`, {
        note: note.trim() || undefined,
      });
      setFeedback({ type: "success", message: "Correction rejetée." });
      await correctionsQuery.refetch();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Impossible de rejeter cette correction.",
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
          Retour à l&apos;administration
        </Link>
        <h1 className="text-3xl font-bold">Corrections communautaires</h1>
        <p className="text-sm text-muted-foreground">
          Valider ou rejeter les propositions de correction des membres.
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
          placeholder="Rechercher par champ, valeur, auteur, aérodrome…"
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
          <option value="approved">Validées</option>
          <option value="rejected">Rejetées</option>
          <option value="all">Toutes</option>
        </select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PencilLine className="h-5 w-5" />
            File de modération
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {corrections.map((correction) => (
            <div key={correction.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {correction.aerodrome.icaoCode
                    ? `${correction.aerodrome.name} (${correction.aerodrome.icaoCode})`
                    : correction.aerodrome.name}
                </Badge>
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
                  {STATUS_LABELS[correction.contentStatus] ?? correction.contentStatus}
                </Badge>
              </div>

              <div className="text-sm">
                <div className="text-muted-foreground">
                  Proposé par {correction.user.displayName || correction.user.email} ·{" "}
                  {new Date(correction.createdAt).toLocaleString("fr-FR")}
                </div>
                <div className="mt-2">
                  <span className="font-medium">Champ :</span>{" "}
                  <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{correction.field}</span>
                </div>
                {correction.currentValue && (
                  <div className="mt-1">
                    <span className="font-medium">Valeur actuelle :</span>{" "}
                    <span className="text-muted-foreground">{correction.currentValue}</span>
                  </div>
                )}
                <div className="mt-1">
                  <span className="font-medium">Valeur proposée :</span> {correction.proposedValue}
                </div>
                {correction.reason && (
                  <div className="mt-1">
                    <span className="font-medium">Justification :</span>{" "}
                    <span className="text-muted-foreground">{correction.reason}</span>
                  </div>
                )}
                {correction.reviewedBy && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Traité par {correction.reviewedBy.displayName || correction.reviewedBy.email} ·{" "}
                    {correction.reviewedAt
                      ? new Date(correction.reviewedAt).toLocaleString("fr-FR")
                      : "—"}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/aerodrome/${correction.aerodrome.id}`} target="_blank">
                  <Button variant="ghost" size="sm">
                    Voir la fiche
                  </Button>
                </Link>
                {correction.contentStatus === "PENDING" && (
                  <>
                    <Button size="sm" onClick={() => handleApprove(correction)}>
                      <Check className="mr-2 h-4 w-4" />
                      Valider
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleReject(correction)}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Rejeter
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}

          {corrections.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune correction trouvée.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
