"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  Clock3,
  ImagePlus,
  Mail,
  MessageSquare,
  RefreshCw,
  ServerCog,
  Shield,
  Users,
} from "lucide-react";
import type {
  AdminMailEventItem,
  AdminDashboardStats,
  AdminSyncRunItem,
  AdminSyncStatusResponse,
} from "@aerodirectory/shared";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const SOURCE_LABELS: Record<AdminSyncRunItem["source"], string> = {
  OPENAIP: "openAIP",
  OSM: "OSM + flags",
  REGIONS: "Régions / villes",
  RGPD: "Nettoyage RGPD",
};

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [triggeringSource, setTriggeringSource] = useState<AdminSyncRunItem["source"] | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncMsgType, setSyncMsgType] = useState<"success" | "error">("success");

  useEffect(() => {
    if (!loading && user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [loading, router, user]);

  const { data: statsData } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => apiClient.get<AdminDashboardStats>("/admin/stats"),
    enabled: user?.role === "ADMIN",
  });

  const {
    data: syncStatusData,
    refetch: refetchSyncStatus,
  } = useQuery({
    queryKey: ["admin-sync-status"],
    queryFn: () => apiClient.get<AdminSyncStatusResponse>("/admin/sync/status"),
    enabled: user?.role === "ADMIN",
    refetchInterval: 30_000,
  });

  const stats = statsData?.data;
  const syncStatus = syncStatusData?.data;
  const { data: mailEventsData } = useQuery({
    queryKey: ["admin-mail-events-preview"],
    queryFn: () =>
      apiClient.get<AdminMailEventItem[]>("/admin/mail-events", {
        page: "1",
        limit: "8",
        status: "all",
        template: "all",
      }),
    enabled: user?.role === "ADMIN",
    refetchInterval: 30_000,
  });
  const mailEvents = mailEventsData?.data ?? [];

  const recentRuns = useMemo(
    () => syncStatus?.recentRuns.slice(0, 8) ?? [],
    [syncStatus?.recentRuns],
  );

  const handleTrigger = async (source: AdminSyncRunItem["source"]) => {
    setTriggeringSource(source);
    setSyncMsg(null);

    try {
      const response = await apiClient.post<{
        started: boolean;
        runId: string;
        source: AdminSyncRunItem["source"];
        status: string;
        message: string;
      }>(`/admin/sync/${source.toLowerCase()}`);

      setSyncMsgType("success");
      setSyncMsg(response.data.message);
      await refetchSyncStatus();
    } catch (error) {
      setSyncMsgType("error");
      setSyncMsg(error instanceof Error ? error.message : "Impossible de lancer la synchronisation.");
    } finally {
      setTriggeringSource(null);
    }
  };

  if (loading || !user || user.role !== "ADMIN") {
    return null;
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-3 text-primary">
          <Shield className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Administration</h1>
          <p className="text-sm text-muted-foreground">
            Modération, supervision et synchronisations nocturnes de la plateforme.
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
              <div className="mb-2 text-sm text-muted-foreground">Photos en attente</div>
              <div className="text-3xl font-bold text-primary">{stats.pendingPhotos}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="mb-2 text-sm text-muted-foreground">Signalements en attente</div>
              <div className="text-3xl font-bold text-amber-600">{stats.pendingReports}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="mb-2 text-sm text-muted-foreground">Échecs captcha (24h)</div>
              <div className="text-3xl font-bold">{stats.altchaFailures24h}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="mb-2 text-sm text-muted-foreground">Échecs login (24h)</div>
              <div className="text-3xl font-bold">{stats.failedLogins24h}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="mb-2 text-sm text-muted-foreground">E-mails KO (24h)</div>
              <div className="text-3xl font-bold text-destructive">{stats.mailFailed24h}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {stats.mailSent24h} envoyés
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Link href="/admin/users">
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Users className="h-5 w-5" />
                Utilisateurs
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Rechercher des membres, consulter leurs informations et gérer les bannissements.
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
              Rechercher, filtrer et modérer les commentaires avec traçabilité.
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/photos">
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ImagePlus className="h-5 w-5" />
                Photos
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Valider ou rejeter les photos avant leur publication publique.
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/reports">
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <AlertTriangle className="h-5 w-5" />
                Signalements
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Traiter les signalements utilisateur (commentaires et corrections).
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/corrections">
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Shield className="h-5 w-5" />
                Corrections
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Valider ou rejeter les propositions de correction et d&apos;enrichissement communautaires.
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ServerCog className="h-5 w-5 text-primary" />
              Refresh nocturne
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Le worker dédié planifie, reprend et journalise les synchronisations de données.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <span>
                Worker :{" "}
                <strong>{syncStatus?.workerEnabled ? "actif" : "désactivé"}</strong>
              </span>
              {syncStatus?.workerId && (
                <span className="text-muted-foreground">ID : {syncStatus.workerId}</span>
              )}
              <span className="text-muted-foreground">
                Exécution en cours : {syncStatus?.running ? "oui" : "non"}
              </span>
            </div>

            {syncMsg && (
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  syncMsgType === "error"
                    ? "border-destructive/40 bg-destructive/5 text-destructive"
                    : "border-green-600/30 bg-green-50 text-green-700"
                }`}
              >
                {syncMsg}
              </div>
            )}

            <div className="grid gap-3">
              {syncStatus?.sources.map((source) => (
                <div
                  key={source.source}
                  className="rounded-xl border p-4 transition-colors hover:border-primary/30"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{SOURCE_LABELS[source.source]}</h3>
                        {source.running && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            en cours
                          </span>
                        )}
                        {source.queued && !source.running && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                            en file
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{source.description}</p>
                      <div className="text-xs text-muted-foreground">
                        Cron : {source.schedule}
                        {source.nextPlannedAt
                          ? ` · prochain run ${new Date(source.nextPlannedAt).toLocaleString("fr-FR")}`
                          : ""}
                      </div>
                      {source.lastRun && (
                        <div className="text-xs text-muted-foreground">
                          Dernier run : {source.lastRun.status.toLowerCase()} le{" "}
                          {new Date(
                            source.lastRun.finishedAt ??
                              source.lastRun.startedAt ??
                              source.lastRun.scheduledFor,
                          ).toLocaleString("fr-FR")}
                        </div>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      onClick={() => handleTrigger(source.source)}
                      disabled={triggeringSource === source.source}
                    >
                      <RefreshCw
                        className={`mr-2 h-4 w-4 ${
                          triggeringSource === source.source ? "animate-spin" : ""
                        }`}
                      />
                      {triggeringSource === source.source ? "Ajout..." : "Lancer maintenant"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-destructive">
                <Ban className="h-5 w-5" />
                Actions sensibles
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Les bannissements et modérations de contenus restent journalisés avec l’identité
              de l’administrateur et la date de l’action.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5 text-primary" />
                Récapitulatif e-mail
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Un mail de synthèse est envoyé chaque nuit aux admins actifs et vérifiés, ou à
                l’adresse de surcouche configurée si tu définis{" "}
                <code>SYNC_REPORT_EMAIL_OVERRIDE</code>.
              </p>
              <div className="space-y-2">
                {mailEvents.map((event) => (
                  <div key={event.id} className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{event.template}</span>
                      <span
                        className={`text-xs ${
                          event.status === "failed" ? "text-destructive" : "text-emerald-700"
                        }`}
                      >
                        {event.status === "failed" ? "échec" : "envoyé"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString("fr-FR")}
                      {event.recipientMasked ? ` · ${event.recipientMasked}` : ""}
                    </div>
                    {event.errorMessage && (
                      <div className="mt-1 text-xs text-destructive">{event.errorMessage}</div>
                    )}
                  </div>
                ))}
                {mailEvents.length === 0 && (
                  <p className="text-xs text-muted-foreground">Aucun événement e-mail récent.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock3 className="h-5 w-5 text-primary" />
            Historique récent
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun run de synchronisation enregistré pour le moment.
            </p>
          ) : (
            <div className="space-y-3">
              {recentRuns.map((run) => (
                <div
                  key={run.id}
                  className="rounded-lg border px-4 py-3 text-sm"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-medium">
                        {SOURCE_LABELS[run.source]} · {run.status.toLowerCase()}
                      </div>
                      <div className="text-muted-foreground">
                        {new Date(run.scheduledFor).toLocaleString("fr-FR")}
                        {run.durationMs ? ` · ${Math.round(run.durationMs / 1000)} s` : ""}
                        {run.attempt > 1 ? ` · tentative ${run.attempt}` : ""}
                      </div>
                    </div>
                    {run.nextRetryAt && (
                      <div className="text-xs text-amber-700">
                        Reprise prévue le {new Date(run.nextRetryAt).toLocaleString("fr-FR")}
                      </div>
                    )}
                  </div>
                  {run.errorMessage && (
                    <div className="mt-2 text-xs text-destructive">{run.errorMessage}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
