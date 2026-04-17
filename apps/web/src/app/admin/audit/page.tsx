"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock3, FileText, Shield } from "lucide-react";
import type { AdminContentAuditItem } from "@aerodirectory/shared";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ACTION_LABELS: Record<AdminContentAuditItem["actionType"], string> = {
  COMMENT_DELETE: "Suppression de commentaire",
  COMMENT_RESTORE: "Restauration de commentaire",
  CORRECTION_APPROVE: "Validation de contribution",
  CORRECTION_REJECT: "Rejet de contribution",
  PHOTO_APPROVE: "Validation de photo",
  PHOTO_REJECT: "Rejet de photo",
  REPORT_APPROVE: "Validation de signalement",
  REPORT_REJECT: "Rejet de signalement",
  USER_BAN: "Bannissement de membre",
  USER_UNBAN: "Débannissement de membre",
  USER_DELETE: "Suppression de membre",
};

const TARGET_LABELS: Record<AdminContentAuditItem["targetType"], string> = {
  comment: "Commentaire",
  correction: "Contribution",
  photo: "Photo",
  user: "Membre",
};

export default function AdminAuditPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [targetType, setTargetType] = useState<
    "comment" | "correction" | "photo" | "user" | "all"
  >("all");
  const [actionType, setActionType] = useState<
    | AdminContentAuditItem["actionType"]
    | "all"
  >("all");

  useEffect(() => {
    if (!loading && user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [loading, router, user]);

  const auditQuery = useQuery({
    queryKey: ["admin-content-audit", targetType, actionType],
    queryFn: () =>
      apiClient.get<AdminContentAuditItem[]>("/admin/content-audit", {
        page: "1",
        limit: "50",
        targetType,
        actionType,
      }),
    enabled: user?.role === "ADMIN",
  });

  if (loading || !user || user.role !== "ADMIN") {
    return null;
  }

  const items = auditQuery.data?.data ?? [];

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
        <h1 className="text-3xl font-bold">Journal d&apos;audit</h1>
        <p className="text-sm text-muted-foreground">
          Historique horodaté des actions sensibles sur les contenus communautaires.
        </p>
      </div>

      <div className="mb-6 grid gap-3 lg:grid-cols-[220px_260px]">
        <select
          value={targetType}
          onChange={(event) =>
            setTargetType(
              event.target.value as "comment" | "correction" | "photo" | "user" | "all",
            )
          }
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">Toutes les cibles</option>
          <option value="comment">Commentaires</option>
          <option value="correction">Contributions</option>
          <option value="photo">Photos</option>
          <option value="user">Membres</option>
        </select>
        <select
          value={actionType}
          onChange={(event) =>
            setActionType(
              event.target.value as AdminContentAuditItem["actionType"] | "all",
            )
          }
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">Toutes les actions</option>
          <option value="COMMENT_DELETE">Suppression de commentaire</option>
          <option value="COMMENT_RESTORE">Restauration de commentaire</option>
          <option value="CORRECTION_APPROVE">Validation de contribution</option>
          <option value="CORRECTION_REJECT">Rejet de contribution</option>
          <option value="PHOTO_APPROVE">Validation de photo</option>
          <option value="PHOTO_REJECT">Rejet de photo</option>
          <option value="REPORT_APPROVE">Validation de signalement</option>
          <option value="REPORT_REJECT">Rejet de signalement</option>
          <option value="USER_BAN">Bannissement</option>
          <option value="USER_UNBAN">Débannissement</option>
          <option value="USER_DELETE">Suppression de membre</option>
        </select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            Historique consultable
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{TARGET_LABELS[item.targetType]}</Badge>
                <Badge variant="secondary">{ACTION_LABELS[item.actionType]}</Badge>
                {item.aerodrome && (
                  <Badge variant="outline">
                    {item.aerodrome.icaoCode
                      ? `${item.aerodrome.name} (${item.aerodrome.icaoCode})`
                      : item.aerodrome.name}
                  </Badge>
                )}
              </div>

              <div className="grid gap-3 text-sm lg:grid-cols-[1.4fr_0.8fr]">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock3 className="h-4 w-4" />
                    {new Date(item.createdAt).toLocaleString("fr-FR")}
                  </div>
                  <div>
                    <span className="font-medium">Acteur :</span>{" "}
                    {item.actor?.displayName || item.actor?.email || "Administrateur supprimé"}
                  </div>
                  <div>
                    <span className="font-medium">Cible :</span>{" "}
                    <span className="font-mono text-xs">{item.targetId}</span>
                  </div>
                  {item.targetSummary && (
                    <div className="rounded-md border bg-muted/20 p-3">
                      <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                        Résumé de la cible
                      </div>
                      <div>{item.targetSummary}</div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="font-medium">Motif</div>
                  <div className="min-h-20 rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                    {item.reason || "Aucun motif saisi."}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucune action d&apos;audit correspondant aux filtres.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
