"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, X } from "lucide-react";
import type { AdminReportListItem } from "@aerodirectory/shared";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  APPROVED: "Validé",
  REJECTED: "Rejeté",
  FLAGGED: "Signalé",
};

const TARGET_LABELS: Record<AdminReportListItem["targetType"], string> = {
  comment: "Commentaire",
  correction: "Correction",
  photo: "Photo",
};

export default function AdminReportsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [targetType, setTargetType] = useState<"comment" | "correction" | "photo" | "all">("all");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!loading && user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [loading, router, user]);

  const reportsQuery = useQuery({
    queryKey: ["admin-reports", search, state, targetType],
    queryFn: () =>
      apiClient.get<AdminReportListItem[]>("/admin/reports", {
        page: "1",
        limit: "30",
        ...(search ? { search } : {}),
        state,
        targetType,
      }),
    enabled: user?.role === "ADMIN",
  });

  if (loading || !user || user.role !== "ADMIN") {
    return null;
  }

  const reports = reportsQuery.data?.data ?? [];

  const handleApprove = async (report: AdminReportListItem) => {
    const note = window.prompt("Note interne optionnelle :") ?? "";
    try {
      await apiClient.post(`/admin/reports/${report.id}/approve`, {
        note: note.trim() || undefined,
      });
      setFeedback({ type: "success", message: "Signalement validé." });
      await reportsQuery.refetch();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Impossible de valider ce signalement.",
      });
    }
  };

  const handleReject = async (report: AdminReportListItem) => {
    const note = window.prompt("Note interne optionnelle :") ?? "";
    try {
      await apiClient.post(`/admin/reports/${report.id}/reject`, {
        note: note.trim() || undefined,
      });
      setFeedback({ type: "success", message: "Signalement rejeté." });
      await reportsQuery.refetch();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Impossible de rejeter ce signalement.",
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
        <h1 className="text-3xl font-bold">Signalements</h1>
        <p className="text-sm text-muted-foreground">
          Valider ou rejeter les signalements utilisateurs.
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

      <div className="mb-6 grid gap-3 lg:grid-cols-[1fr_220px_220px]">
        <Input
          placeholder="Rechercher par raison, auteur, e-mail, aerodrome..."
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
          <option value="approved">Validés</option>
          <option value="rejected">Rejetés</option>
          <option value="all">Tous</option>
        </select>
        <select
          value={targetType}
          onChange={(event) =>
            setTargetType(event.target.value as "comment" | "correction" | "photo" | "all")
          }
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">Tous les types</option>
          <option value="comment">Commentaires</option>
          <option value="correction">Corrections</option>
          <option value="photo">Photos</option>
        </select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5" />
            File de signalements
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {reports.map((report) => (
            <div key={report.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{TARGET_LABELS[report.targetType]}</Badge>
                <Badge
                  variant={
                    report.contentStatus === "PENDING"
                      ? "warning"
                      : report.contentStatus === "APPROVED"
                        ? "success"
                        : report.contentStatus === "REJECTED"
                          ? "destructive"
                          : "outline"
                  }
                >
                  {STATUS_LABELS[report.contentStatus] ?? report.contentStatus}
                </Badge>
                <Badge variant="outline">
                  {report.aerodrome.icaoCode
                    ? `${report.aerodrome.name} (${report.aerodrome.icaoCode})`
                    : report.aerodrome.name}
                </Badge>
              </div>

              <div className="text-sm">
                <div className="text-muted-foreground">
                  Signalé par {report.user.displayName || report.user.email} ·{" "}
                  {new Date(report.createdAt).toLocaleString("fr-FR")}
                </div>
                <div className="mt-2">
                  <span className="font-medium">Raison :</span> {report.reason}
                </div>
                {report.targetPreview && (
                  <div className="mt-2 rounded-md border bg-muted/20 p-3 text-sm">
                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                      Contenu ciblé
                    </div>
                    <div>{report.targetPreview}</div>
                  </div>
                )}
              </div>

              {report.contentStatus === "PENDING" && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => handleApprove(report)}>
                    <Check className="mr-2 h-4 w-4" />
                    Valider le signalement
                  </Button>
                  <Button variant="destructive" onClick={() => handleReject(report)}>
                    <X className="mr-2 h-4 w-4" />
                    Rejeter le signalement
                  </Button>
                </div>
              )}
            </div>
          ))}

          {reports.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun signalement trouvé.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
