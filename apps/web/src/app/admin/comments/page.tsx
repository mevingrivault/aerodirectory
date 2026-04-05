"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye, MessageSquareWarning, Trash2 } from "lucide-react";
import type { AdminCommentListItem } from "@aerodirectory/shared";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function AdminCommentsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"active" | "reported" | "deleted" | "all">("active");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!loading && user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [loading, router, user]);

  const commentsQuery = useQuery({
    queryKey: ["admin-comments", search, state],
    queryFn: () =>
      apiClient.get<AdminCommentListItem[]>("/admin/comments", {
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

  const comments = commentsQuery.data?.data ?? [];

  const handleDelete = async (comment: AdminCommentListItem) => {
    if (!window.confirm("Supprimer ce commentaire ?")) {
      return;
    }

    const reason = window.prompt("Raison de la suppression (optionnel) :") ?? "";

    try {
      await apiClient.post(`/admin/comments/${comment.id}/delete`, {
        reason: reason.trim() || undefined,
      });
      setFeedback({ type: "success", message: "Commentaire supprime avec succes." });
      await commentsQuery.refetch();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Impossible de supprimer ce commentaire.",
      });
    }
  };

  const handleRestore = async (comment: AdminCommentListItem) => {
    if (!window.confirm("Reafficher ce commentaire ?")) {
      return;
    }

    const note = window.prompt("Note de moderation (optionnel) :") ?? "";

    try {
      await apiClient.post(`/admin/comments/${comment.id}/restore`, {
        note: note.trim() || undefined,
      });
      setFeedback({ type: "success", message: "Commentaire reaffiche avec succes." });
      await commentsQuery.refetch();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Impossible de reafficher ce commentaire.",
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
        <h1 className="text-3xl font-bold">Commentaires</h1>
        <p className="text-sm text-muted-foreground">
          Recherche et moderation des commentaires publies.
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
          placeholder="Rechercher par contenu, auteur, e-mail ou aerodrome"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          value={state}
          onChange={(event) =>
            setState(event.target.value as "active" | "reported" | "deleted" | "all")
          }
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="active">Commentaires actifs</option>
          <option value="reported">Commentaires signales</option>
          <option value="deleted">Commentaires supprimes</option>
          <option value="all">Tous les commentaires</option>
        </select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquareWarning className="h-5 w-5" />
            Liste des commentaires
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-lg border p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">{comment.user.displayName || "Sans pseudo"}</span>
                  <span className="text-muted-foreground"> · {comment.user.email}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={
                      comment.deletedAt
                        ? "destructive"
                        : comment.contentStatus === "FLAGGED"
                          ? "warning"
                          : "success"
                    }
                  >
                    {comment.deletedAt
                      ? "Supprime"
                      : comment.contentStatus === "FLAGGED"
                        ? "Signale"
                        : "Actif"}
                  </Badge>
                  <Badge variant="outline">
                    {comment.aerodrome.icaoCode
                      ? `${comment.aerodrome.name} (${comment.aerodrome.icaoCode})`
                      : comment.aerodrome.name}
                  </Badge>
                </div>
              </div>

              <p className="mb-3 whitespace-pre-wrap text-sm">{comment.content}</p>

              <div className="space-y-1 text-xs text-muted-foreground">
                <div>Publie le {new Date(comment.createdAt).toLocaleString("fr-FR")}</div>
                {comment.pendingReports.count > 0 && (
                  <div>{comment.pendingReports.count} signalement(s) en attente</div>
                )}
                {comment.pendingReports.reasons.map((reason, index) => (
                  <div key={`${comment.id}-report-${index}`}>Signalement : {reason}</div>
                ))}
                {comment.deletedAt && (
                  <div>
                    Supprime le {new Date(comment.deletedAt).toLocaleString("fr-FR")}
                    {comment.deletedBy
                      ? ` par ${comment.deletedBy.displayName || comment.deletedBy.email}`
                      : ""}
                  </div>
                )}
                {comment.deletedReason && <div>Raison : {comment.deletedReason}</div>}
              </div>

              {!comment.deletedAt && (
                <div className="mt-3">
                  <div className="flex flex-wrap gap-2">
                    {comment.contentStatus === "FLAGGED" && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleRestore(comment)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Reafficher
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => handleDelete(comment)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Supprimer
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun commentaire trouve.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
