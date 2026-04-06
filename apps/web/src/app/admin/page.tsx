"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Ban, MessageSquare, RefreshCw, Shield, Users } from "lucide-react";
import type { AdminDashboardStats } from "@aerodirectory/shared";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [loading, router, user]);

  const { data } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => apiClient.get<AdminDashboardStats>("/admin/stats"),
    enabled: user?.role === "ADMIN",
  });

  const [syncState, setSyncState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncState("running");
    setSyncMsg(null);
    try {
      await apiClient.post("/admin/sync/openaip", {});
      setSyncState("done");
      setSyncMsg("Sync lancé en arrière-plan. Consultez les logs API pour le résultat.");
    } catch {
      setSyncState("error");
      setSyncMsg("Erreur lors du lancement du sync.");
    }
  };

  if (loading || !user || user.role !== "ADMIN") {
    return null;
  }

  const stats = data?.data;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-3 text-primary">
          <Shield className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Administration</h1>
          <p className="text-sm text-muted-foreground">
            Moderation et supervision de la plateforme.
          </p>
        </div>
      </div>

      {stats && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <div className="mb-2 text-sm text-muted-foreground">Utilisateurs</div>
              <div className="text-3xl font-bold">{stats.totalUsers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="mb-2 text-sm text-muted-foreground">Utilisateurs bannis</div>
              <div className="text-3xl font-bold text-destructive">{stats.bannedUsers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="mb-2 text-sm text-muted-foreground">Commentaires actifs</div>
              <div className="text-3xl font-bold">{stats.activeComments}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="mb-2 text-sm text-muted-foreground">Commentaires supprimes</div>
              <div className="text-3xl font-bold">{stats.deletedComments}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/admin/users">
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Users className="h-5 w-5" />
                Utilisateurs
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Rechercher des membres, consulter leurs informations et gerer les bannissements.
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/comments">
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <MessageSquare className="h-5 w-5" />
                Commentaires
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Rechercher, filtrer et moderer les commentaires avec tracabilite.
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <RefreshCw className="h-5 w-5 text-primary" />
              Synchronisation openAIP
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Importe les aérodromes français depuis openAIP. Tourne automatiquement chaque nuit à 2h.
            </p>
            <Button
              onClick={handleSync}
              disabled={syncState === "running"}
              variant="outline"
              className="w-full"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncState === "running" ? "animate-spin" : ""}`} />
              {syncState === "running" ? "Sync en cours…" : "Lancer le sync maintenant"}
            </Button>
            {syncMsg && (
              <p className={`text-xs ${syncState === "error" ? "text-destructive" : "text-green-600"}`}>
                {syncMsg}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-destructive">
              <Ban className="h-5 w-5" />
              Actions sensibles
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Les bannissements et suppressions de commentaires sont journalises avec l&apos;identite
            de l&apos;administrateur et la date de l&apos;action.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
