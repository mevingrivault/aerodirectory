"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Coins, ExternalLink, X } from "lucide-react";
import type { AdminCommunityInfoListItem } from "@aerodirectory/shared";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { COMMUNITY_KIND_LABELS, communityInfoSummary, safeHttpUrl } from "@/lib/community-info";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STATUS_LABELS: Record<AdminCommunityInfoListItem["contentStatus"], string> = {
  PENDING: "En attente",
  APPROVED: "Publiée",
  REJECTED: "Rejetée",
  FLAGGED: "Signalée",
};

export default function AdminCommunityInfosPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!loading && user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [loading, router, user]);

  const infosQuery = useQuery({
    queryKey: ["admin-community-infos", search, state],
    queryFn: () =>
      apiClient.get<AdminCommunityInfoListItem[]>("/admin/community-infos", {
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

  const infos = infosQuery.data?.data ?? [];

  const review = async (info: AdminCommunityInfoListItem, decision: "approve" | "reject") => {
    const note = window.prompt(decision === "approve" ? "Note interne optionnelle :" : "Motif interne optionnel :") ?? "";
    try {
      await apiClient.post(`/admin/community-infos/${info.id}/${decision}`, { note: note.trim() || undefined });
      setFeedback({ type: "success", message: decision === "approve" ? "Information publiée." : "Information rejetée." });
      await infosQuery.refetch();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Action impossible pour le moment.",
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
        <h1 className="text-3xl font-bold">Infos pratiques</h1>
        <p className="text-sm text-muted-foreground">
          Prix carburant, taxes, hangars et webcams proposés par les membres. Une info publiée remplace la précédente du même type sur la fiche.
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
          placeholder="Rechercher par aérodrome, code OACI, auteur..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          value={state}
          onChange={(event) => setState(event.target.value as "pending" | "approved" | "rejected" | "all")}
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
            <Coins className="h-5 w-5" />
            File de modération
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {infos.map((info) => {
            const webcamUrl = info.kind === "WEBCAM" ? safeHttpUrl(info.data["url"]) : null;
            return (
              <div key={info.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{COMMUNITY_KIND_LABELS[info.kind]}</Badge>
                  <Badge
                    variant={
                      info.contentStatus === "PENDING"
                        ? "warning"
                        : info.contentStatus === "APPROVED"
                          ? "success"
                          : info.contentStatus === "REJECTED"
                            ? "destructive"
                            : "outline"
                    }
                  >
                    {STATUS_LABELS[info.contentStatus]}
                  </Badge>
                  <Badge variant="outline">
                    {info.aerodrome.icaoCode ? `${info.aerodrome.name} (${info.aerodrome.icaoCode})` : info.aerodrome.name}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="text-muted-foreground">
                    Proposé par {info.user.displayName || info.user.email} · {new Date(info.createdAt).toLocaleString("fr-FR")} ·
                    constaté le {new Date(info.observedAt).toLocaleDateString("fr-FR", { timeZone: "UTC" })}
                  </div>
                  <div className="rounded-md border bg-primary/5 p-3 whitespace-pre-wrap">{communityInfoSummary(info)}</div>
                  {webcamUrl && (
                    <a href={webcamUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-primary underline">
                      Vérifier le lien <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                {info.contentStatus === "PENDING" && (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => review(info, "approve")}>
                      <Check className="mr-2 h-4 w-4" />
                      Publier
                    </Button>
                    <Button variant="destructive" onClick={() => review(info, "reject")}>
                      <X className="mr-2 h-4 w-4" />
                      Rejeter
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {infos.length === 0 && <p className="text-sm text-muted-foreground">Aucune information trouvée.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
