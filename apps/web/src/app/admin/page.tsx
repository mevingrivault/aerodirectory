"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Clock3,
  FileText,
  ImagePlus,
  Mail,
  MessageSquare,
  RefreshCw,
  ServerCog,
  Shield,
  Users,
} from "lucide-react";
import type {
  AdminMailTestResponse,
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
  AIRSPACES: "Espaces aériens",
  OSM: "OSM + flags",
  REGIONS: "Régions / villes",
  RGPD: "Nettoyage RGPD",
};

export default function AdminPage() {
  const apiBase = process.env["NEXT_PUBLIC_API_URL"] || "http://localhost:4000/api/v1";
  const { user, loading } = useAuth();
  const router = useRouter();
  const [triggeringSource, setTriggeringSource] = useState<AdminSyncRunItem["source"] | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncMsgType, setSyncMsgType] = useState<"success" | "error">("success");
  const [mailActionLoading, setMailActionLoading] = useState<"test" | "download" | null>(null);
  const [mailMsg, setMailMsg] = useState<string | null>(null);
  const [mailMsgType, setMailMsgType] = useState<"success" | "error">("success");

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

  const moderationQueues = stats
    ? [
        {
          href: "/admin/reports",
          icon: AlertTriangle,
          title: "Signalements",
          value: stats.pendingReports,
          valueLabel:
            stats.pendingReports > 1 ? "contenus à examiner" : "contenu à examiner",
          tone:
            stats.pendingReports > 0
              ? "border-amber-300/70 bg-amber-50/70"
              : "border-border bg-background",
          accent:
            stats.pendingReports > 0 ? "text-amber-700" : "text-muted-foreground",
          summary: "Commentaires, corrections et photos remontés par la communauté.",
          cta: "Ouvrir la file",
        },
        {
          href: "/admin/photos",
          icon: ImagePlus,
          title: "Photos",
          value: stats.pendingPhotos,
          valueLabel:
            stats.pendingPhotos > 1 ? "photos à valider" : "photo à valider",
          tone:
            stats.pendingPhotos > 0
              ? "border-primary/30 bg-primary/5"
              : "border-border bg-background",
          accent: stats.pendingPhotos > 0 ? "text-primary" : "text-muted-foreground",
          summary: "Valider ou rejeter avant publication publique.",
          cta: "Traiter les photos",
        },
        {
          href: "/admin/comments",
          icon: MessageSquare,
          title: "Commentaires",
          value: stats.activeComments,
          valueLabel:
            stats.activeComments > 1 ? "commentaires visibles" : "commentaire visible",
          tone: "border-border bg-background",
          accent: "text-foreground",
          summary: "Rechercher, restaurer ou modérer les discussions.",
          cta: "Accéder à la modération",
        },
      ]
    : [];

  const governanceModules = stats
    ? [
        {
          href: "/admin/corrections",
          icon: FileText,
          title: "Corrections",
          metric: "Contributions",
          value: "Publier ou rejeter",
          summary: "Garder la main sur les enrichissements sans toucher aux imports.",
        },
        {
          href: "/admin/users",
          icon: Users,
          title: "Utilisateurs",
          metric: `${stats.totalUsers}`,
          value: stats.bannedUsers > 0 ? `${stats.bannedUsers} bannis` : "Aucun banni",
          summary: "Profils, rôles et bannissements.",
        },
        {
          href: "/admin/audit",
          icon: Clock3,
          title: "Audit",
          metric: "Journal",
          value: "Actions sensibles",
          summary: "Retrouver l’acteur, la cible, l’action et le motif en cas de litige.",
        },
      ]
    : [];

  const healthMetrics = stats
    ? [
        {
          label: "Utilisateurs",
          value: stats.totalUsers,
          hint: stats.bannedUsers > 0 ? `${stats.bannedUsers} bannis` : "Communauté active",
        },
        {
          label: "Échecs login 24h",
          value: stats.failedLogins24h,
          hint: "Surveiller les pics d’authentification",
        },
        {
          label: "Échecs captcha 24h",
          value: stats.altchaFailures24h,
          hint: "Détecter la pression bot ou formulaires cassés",
        },
        {
          label: "Mail",
          value: stats.mailFailed24h,
          hint: `${stats.mailSent24h} envoyés sur 24h`,
        },
      ]
    : [];

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

  const handleSendTestMail = async () => {
    setMailActionLoading("test");
    setMailMsg(null);

    try {
      const response = await apiClient.post<AdminMailTestResponse>("/admin/mail/test");
      setMailMsgType("success");
      setMailMsg(
        `Mail de test envoyé à ${response.data.sentTo}. Message ID : ${response.data.messageId}`,
      );
    } catch (error) {
      setMailMsgType("error");
      setMailMsg(
        error instanceof Error ? error.message : "Impossible d'envoyer le mail de test.",
      );
    } finally {
      setMailActionLoading(null);
    }
  };

  const handleDownloadDiagnostics = async () => {
    setMailActionLoading("download");
    setMailMsg(null);

    try {
      const response = await fetch(`${apiBase}/admin/mail/diagnostics`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Impossible de télécharger le diagnostic.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition");
      const fileNameMatch = disposition?.match(/filename=\"?([^"]+)\"?/i);
      anchor.href = url;
      anchor.download = fileNameMatch?.[1] || "navventura-mail-diagnostics.txt";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      setMailMsgType("success");
      setMailMsg("Diagnostic téléchargé.");
    } catch (error) {
      setMailMsgType("error");
      setMailMsg(
        error instanceof Error ? error.message : "Impossible de télécharger le diagnostic.",
      );
    } finally {
      setMailActionLoading(null);
    }
  };

  if (loading || !user || user.role !== "ADMIN") {
    return null;
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-border/70 bg-gradient-to-br from-background via-background to-muted/30 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <Shield className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold tracking-tight">Administration</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              File de modération, supervision opérationnelle et outils de contrôle pour les
              contenus communautaires.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <div className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-muted-foreground">
            Worker {syncStatus?.workerEnabled ? "actif" : "désactivé"}
          </div>
          <div className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-muted-foreground">
            {stats?.pendingReports ?? 0} signalement{(stats?.pendingReports ?? 0) > 1 ? "s" : ""} en attente
          </div>
          <div className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-muted-foreground">
            {stats?.pendingPhotos ?? 0} photo{(stats?.pendingPhotos ?? 0) > 1 ? "s" : ""} à valider
          </div>
          <div className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-muted-foreground">
            {recentRuns.length > 0 ? "Historique sync à jour" : "Aucun run récent"}
          </div>
        </div>
      </div>

      {stats && (
        <div className="mb-8 grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">À traiter maintenant</CardTitle>
              <p className="text-sm text-muted-foreground">
                Les files utiles en premier, avec accès direct aux actions de modération.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3">
              {moderationQueues.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={`group rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm ${item.tone}`}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <div className="rounded-2xl bg-background/80 p-2.5 shadow-sm ring-1 ring-black/5">
                            <Icon className={`h-5 w-5 ${item.accent}`} />
                          </div>
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold">{item.title}</h3>
                              <span className={`text-sm font-medium ${item.accent}`}>
                                {item.value} {item.valueLabel}
                              </span>
                            </div>
                            <p className="max-w-xl text-sm text-muted-foreground">
                              {item.summary}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm font-medium text-foreground/80 transition-transform group-hover:translate-x-0.5">
                          {item.cta}
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">État rapide</CardTitle>
              <p className="text-sm text-muted-foreground">
                Quelques signaux pour repérer un incident sans quitter la page.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3">
              {healthMetrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3"
                >
                  <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {metric.label}
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{metric.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{metric.hint}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {governanceModules.length > 0 && (
        <div className="mb-8">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">Modération & gouvernance</h2>
            <p className="text-sm text-muted-foreground">
              Les modules secondaires restent accessibles, sans concurrencer la file principale.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {governanceModules.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <Card className="h-full border-border/80 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm">
                    <CardContent className="flex h-full flex-col gap-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="rounded-2xl bg-muted/50 p-2.5">
                          <Icon className="h-5 w-5 text-foreground" />
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-lg font-semibold">{item.title}</div>
                        <div className="text-sm font-medium text-foreground/80">{item.value}</div>
                        <p className="text-sm text-muted-foreground">{item.summary}</p>
                      </div>
                      <div className="mt-auto text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        {item.metric}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ServerCog className="h-5 w-5 text-primary" />
              Synchronisations
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Lancer un refresh ciblé sans quitter l’espace d’administration.
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
                Zone sensible
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Bannissements, suppressions, validations et rejets restent tracés dans le journal
              d’audit avec l’acteur, la cible, l’action et le motif.
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
              {mailMsg && (
                <div
                  className={`rounded-lg border px-4 py-3 text-sm ${
                    mailMsgType === "error"
                      ? "border-destructive/40 bg-destructive/5 text-destructive"
                      : "border-green-600/30 bg-green-50 text-green-700"
                  }`}
                >
                  {mailMsg}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={handleSendTestMail}
                  disabled={mailActionLoading !== null}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  {mailActionLoading === "test" ? "Envoi..." : "Envoyer un mail de test"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownloadDiagnostics}
                  disabled={mailActionLoading !== null}
                >
                  <Clock3 className="mr-2 h-4 w-4" />
                  {mailActionLoading === "download"
                    ? "Préparation..."
                    : "Télécharger le diagnostic"}
                </Button>
              </div>
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
            Derniers runs
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
