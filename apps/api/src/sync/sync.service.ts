import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule/dist";
import { ConfigService } from "@nestjs/config";
import { Prisma, type SyncRun, type SyncRunStatus, type SyncSource } from "@aerodirectory/database";
import Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MailService } from "../mail/mail.service";
import { SyncLockService } from "./sync-lock.service";
import { computeNextCronOccurrence, getSourceScheduleDescription } from "./sync.schedule";
import { runOpenAipSyncTask } from "./tasks/openaip-sync.task";
import { runRegionsSyncTask } from "./tasks/regions-sync.task";
import {
  ensureOsmArtifacts,
  downloadFrancePbfIfMissing,
  exportOsmGeoJsonSeq,
  filterOsmPbf,
  importOsmGeoJsonSeq,
} from "./tasks/osm-sync.task";
import { runSyncAerodromeFlagsTask } from "./tasks/flags-sync.task";

const ACTIVE_RUN_STATUSES: SyncRunStatus[] = ["QUEUED", "RETRY_SCHEDULED", "IN_PROGRESS"];
const OPENAIP_CRON = process.env["SYNC_OPENAIP_CRON"] ?? "0 2 * * *";
const OSM_CRON = process.env["SYNC_OSM_CRON"] ?? "0 3 * * 0";
const RGPD_CRON = process.env["SYNC_RGPD_CRON"] ?? "30 4 * * *";
const REPORT_CRON = process.env["SYNC_REPORT_CRON"] ?? "30 7 * * *";
const REGIONS_FULL_CRON = process.env["SYNC_REGIONS_FULL_CRON"] ?? "0 5 1 * *";
const SYNC_TIMEZONE = process.env["SYNC_TIMEZONE"] ?? "Europe/Paris";
const WORKER_HEARTBEAT_KEY = "navventura:sync:worker-heartbeat";
const WORKER_HEARTBEAT_TTL_SECONDS = 120;

function asBoolean(value: string | boolean | undefined, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function asErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

interface RunExecutionResult {
  source: SyncSource;
  status: SyncRunStatus;
  summary: Prisma.InputJsonValue;
  errorMessage?: string | null;
}

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);
  private readonly workerEnabled: boolean;
  private readonly workerId: string;
  private readonly redis: Redis | null;
  private dispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly syncLock: SyncLockService,
  ) {
    this.workerEnabled = asBoolean(this.config.get<string>("SYNC_ENABLED"), false);
    this.workerId =
      this.config.get<string>("SYNC_WORKER_ID") ??
      process.env["HOSTNAME"] ??
      "sync-worker";
    const redisUrl = this.config.get<string>("REDIS_URL");
    this.redis = redisUrl ? new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;
  }

  async onModuleInit() {
    if (!this.workerEnabled) {
      return;
    }

    await this.updateWorkerHeartbeat();
    await this.recoverInterruptedRuns();
    await this.processDueRuns();
  }

  @Cron("*/30 * * * * *", {
    name: "sync-worker-heartbeat",
    timeZone: SYNC_TIMEZONE,
  })
  async publishWorkerHeartbeat() {
    if (!this.workerEnabled) return;
    await this.updateWorkerHeartbeat();
  }

  @Cron(OPENAIP_CRON, {
    name: "sync-enqueue-openaip",
    timeZone: SYNC_TIMEZONE,
  })
  async scheduleOpenAip() {
    if (!this.workerEnabled) return;
    await this.enqueueRun("OPENAIP", "SCHEDULED");
  }

  @Cron(OSM_CRON, {
    name: "sync-enqueue-osm",
    timeZone: SYNC_TIMEZONE,
  })
  async scheduleOsm() {
    if (!this.workerEnabled) return;
    await this.enqueueRun("OSM", "SCHEDULED");
  }

  @Cron(RGPD_CRON, {
    name: "sync-enqueue-rgpd",
    timeZone: SYNC_TIMEZONE,
  })
  async scheduleRgpd() {
    if (!this.workerEnabled) return;
    await this.enqueueRun("RGPD", "SCHEDULED");
  }

  @Cron(REGIONS_FULL_CRON, {
    name: "sync-enqueue-regions-full",
    timeZone: SYNC_TIMEZONE,
  })
  async scheduleMonthlyRegionsFull() {
    if (!this.workerEnabled) return;
    await this.enqueueRun("REGIONS", "SCHEDULED", {
      scope: "full",
    });
  }

  @Cron("0 * * * * *", {
    name: "sync-dispatcher",
    timeZone: SYNC_TIMEZONE,
  })
  async dispatchDueRuns() {
    if (!this.workerEnabled || this.dispatching) return;
    await this.processDueRuns();
  }

  @Cron(REPORT_CRON, {
    name: "sync-report",
    timeZone: SYNC_TIMEZONE,
  })
  async sendNightlyReportCron() {
    if (!this.workerEnabled) return;
    await this.sendNightlySummaryEmail();
  }

  isWorkerEnabled() {
    return this.workerEnabled;
  }

  async getStatusOverview() {
    const heartbeat = await this.getWorkerHeartbeat();
    const [recentRuns, activeRuns] = await Promise.all([
      this.prisma.syncRun.findMany({
        take: 20,
        orderBy: [{ createdAt: "desc" }],
      }),
      this.prisma.syncRun.findMany({
        where: { status: { in: ACTIVE_RUN_STATUSES } },
      }),
    ]);

    const sources: SyncSource[] = ["OPENAIP", "OSM", "REGIONS", "RGPD"];
    const sourceStatuses = await Promise.all(
      sources.map(async (source) => {
        const lastRun = await this.prisma.syncRun.findFirst({
          where: {
            source,
            status: { notIn: ACTIVE_RUN_STATUSES },
          },
          orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
        });

        return {
          source,
          schedule: this.getScheduleForSource(source),
          description: getSourceScheduleDescription(source),
          nextPlannedAt: this.getNextPlannedAt(source)?.toISOString() ?? null,
          running: activeRuns.some((run) => run.source === source && run.status === "IN_PROGRESS"),
          queued: activeRuns.some((run) => run.source === source && run.status !== "IN_PROGRESS"),
          lastRun,
        };
      }),
    );

    return {
      workerEnabled: heartbeat?.alive ?? this.workerEnabled,
      workerId: heartbeat?.workerId ?? this.workerId,
      running: activeRuns.some((run) => run.status === "IN_PROGRESS"),
      sources: sourceStatuses,
      recentRuns,
    };
  }

  async triggerManual(source: SyncSource, triggeredByUserId: string) {
    const run = await this.enqueueRun(source, "MANUAL", {
      triggeredByUserId,
      scope: source === "REGIONS" ? "full" : undefined,
    });

    await this.audit.log({
      userId: triggeredByUserId,
      action: "ADMIN_ACTION",
      metadata: {
        type: "SYNC_MANUAL_TRIGGER",
        source,
        runId: run.id,
      },
    });

    return run;
  }

  async enqueueRun(
    source: SyncSource,
    runType: "SCHEDULED" | "MANUAL" | "RETRY" | "RECOVERY",
    options?: {
      scheduledFor?: Date;
      nextRetryAt?: Date | null;
      attempt?: number;
      scope?: string;
      summary?: Record<string, unknown>;
      triggeredByUserId?: string;
    },
  ) {
    const existing = await this.prisma.syncRun.findFirst({
      where: {
        source,
        status: { in: ACTIVE_RUN_STATUSES },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    if (existing) {
      if (source === "REGIONS" && options?.summary) {
        const existingSummary = getJsonObject(existing.summary);
        const currentIds = Array.isArray(existingSummary["aerodromeIds"])
          ? existingSummary["aerodromeIds"].filter((value): value is string => typeof value === "string")
          : [];
        const incomingIds = Array.isArray(options.summary["aerodromeIds"])
          ? options.summary["aerodromeIds"].filter((value): value is string => typeof value === "string")
          : [];

        if (incomingIds.length > 0) {
          const mergedIds = [...new Set([...currentIds, ...incomingIds])];
          await this.prisma.syncRun.update({
            where: { id: existing.id },
            data: {
              summary: toInputJsonValue({
                ...existingSummary,
                ...options.summary,
                aerodromeIds: mergedIds,
              }),
            },
          });
        }
      }

      return existing;
    }

    const recipients = await this.resolveSummaryRecipients();

    return this.prisma.syncRun.create({
      data: {
        source,
        runType,
        scope: options?.scope,
        status: runType === "RETRY" || runType === "RECOVERY" ? "RETRY_SCHEDULED" : "QUEUED",
        attempt: options?.attempt ?? 1,
        scheduledFor: options?.scheduledFor ?? new Date(),
        nextRetryAt: options?.nextRetryAt ?? null,
        summary: options?.summary ? toInputJsonValue(options.summary) : undefined,
        recipients,
        triggeredByUserId: options?.triggeredByUserId ?? null,
      },
    });
  }

  async runRgpdCleanup(): Promise<{ auditLogsDeleted: number; tokensDeleted: number }> {
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    const { count: auditLogsDeleted } = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: threeYearsAgo } },
    });

    const { count: tokensDeleted } = await this.prisma.emailToken.deleteMany({
      where: { expiresAt: { lt: new Date() }, usedAt: null },
    });

    return { auditLogsDeleted, tokensDeleted };
  }

  private async processDueRuns() {
    this.dispatching = true;
    try {
      while (true) {
        const now = new Date();
        const run = await this.prisma.syncRun.findFirst({
          where: {
            OR: [
              {
                status: "QUEUED",
                scheduledFor: { lte: now },
              },
              {
                status: "RETRY_SCHEDULED",
                nextRetryAt: { lte: now },
              },
            ],
          },
          orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
        });

        if (!run) break;
        await this.executeRun(run.id);
      }
    } finally {
      this.dispatching = false;
    }
  }

  private async recoverInterruptedRuns() {
    const interrupted = await this.prisma.syncRun.findMany({
      where: { status: "IN_PROGRESS" },
    });

    for (const run of interrupted) {
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: "RETRY_SCHEDULED",
          nextRetryAt: new Date(),
          errorMessage: "Run repris après redémarrage du worker.",
        },
      });

      await this.prisma.syncRunStep.updateMany({
        where: { runId: run.id, status: "RUNNING" },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          logSummary: "Étape interrompue, run replanifié.",
        },
      });
    }
  }

  private async executeRun(runId: string) {
    const run = await this.prisma.syncRun.findUnique({ where: { id: runId } });
    if (!run) return;
    const startedAt = run.startedAt ?? new Date();

    const lock = await this.syncLock.acquire(run.source);
    if (!lock) {
      this.logger.warn(`Impossible d'acquérir le lock pour ${run.source}`);
      return;
    }

    try {
      await this.prisma.syncRun.update({
        where: { id: runId },
        data: {
          status: "IN_PROGRESS",
          startedAt,
          finishedAt: null,
          durationMs: null,
          nextRetryAt: null,
          workerId: this.workerId,
        },
      });

      const summary = await this.executeRunBySource(runId);
      const finishedAt = new Date();

      await this.prisma.syncRun.update({
        where: { id: runId },
        data: {
          status: summary.status,
          summary: summary.summary,
          errorMessage: summary.errorMessage ?? null,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
        },
      });
    } catch (error) {
      await this.handleRunFailure(run, error);
    } finally {
      await lock.release();
    }
  }

  private async executeRunBySource(runId: string): Promise<RunExecutionResult> {
    const run = await this.prisma.syncRun.findUnique({ where: { id: runId } });
    if (!run) {
      throw new Error("Sync run introuvable");
    }

    switch (run.source) {
      case "OPENAIP":
        return this.executeOpenAip(run);
      case "OSM":
        return this.executeOsm(run);
      case "REGIONS":
        return this.executeRegions(run);
      case "RGPD":
        return this.executeRgpd(run);
      default:
        throw new Error(`Source non supportée: ${run.source}`);
    }
  }

  private async executeOpenAip(run: SyncRun): Promise<RunExecutionResult> {
    await this.startStep(run.id, "openaip_import", 1);

    try {
      const apiKey = this.config.getOrThrow<string>("OPENAIP_API_KEY");
      const result = await runOpenAipSyncTask(this.prisma as never, apiKey);
      await this.completeStep(run.id, "openaip_import", {
        metrics: {
          total: result.total,
          checked: result.checked,
          created: result.created,
          updated: result.updated,
          unchanged: result.unchanged,
          errors: result.errors.length,
        },
        checkpoint: {
          changedAerodromeIds: result.changedAerodromeIds,
        },
        logSummary: `Créés: ${result.created}, mis à jour: ${result.updated}, erreurs: ${result.errors.length}`,
      });

      if (result.changedAerodromeIds.length > 0) {
        await this.enqueueRun("REGIONS", "SCHEDULED", {
          scope: "delta",
          summary: { aerodromeIds: result.changedAerodromeIds },
        });
      }

      return {
        source: "OPENAIP" as const,
        status: result.errors.length > 0 ? ("PARTIAL" as const) : ("SUCCESS" as const),
        summary: toInputJsonValue({
          total: result.total,
          checked: result.checked,
          created: result.created,
          updated: result.updated,
          unchanged: result.unchanged,
          errors: result.errors,
          changedAerodromeCount: result.changedAerodromeIds.length,
        }),
        errorMessage:
          result.errors.length > 0 ? `${result.errors.length} erreur(s) lors du sync OpenAIP.` : null,
      };
    } catch (error) {
      await this.failStep(run.id, "openaip_import", error);
      throw error;
    }
  }

  private async executeRegions(run: SyncRun): Promise<RunExecutionResult> {
    await this.startStep(run.id, "regions_sync", 1);

    try {
      const summary = getJsonObject(run.summary);
      const aerodromeIds = Array.isArray(summary["aerodromeIds"])
        ? summary["aerodromeIds"].filter((value): value is string => typeof value === "string")
        : undefined;

      const result = await runRegionsSyncTask(this.prisma as never, {
        aerodromeIds,
        forceAll: run.scope === "full",
      });

      await this.completeStep(run.id, "regions_sync", {
        metrics: {
          total: result.total,
          updated: result.updated,
          errors: result.errors,
        },
        checkpoint: {
          scope: result.scope,
          total: result.total,
        },
        logSummary: `Mis à jour: ${result.updated}, erreurs: ${result.errors}`,
      });

      return {
        source: "REGIONS" as const,
        status: result.errors > 0 ? ("PARTIAL" as const) : ("SUCCESS" as const),
        summary: toInputJsonValue(result),
        errorMessage: result.errors > 0 ? `${result.errors} erreur(s) sur le géocodage régions.` : null,
      };
    } catch (error) {
      await this.failStep(run.id, "regions_sync", error);
      throw error;
    }
  }

  private async executeOsm(run: SyncRun): Promise<RunExecutionResult> {
    const dataDir = this.config.get<string>("SYNC_DATA_DIR", "/data/sync");
    const artifacts = await ensureOsmArtifacts(dataDir);

    try {
      if (!(await this.wasStepSuccessful(run.id, "download"))) {
        await this.startStep(run.id, "download", 1);
        const result = await downloadFrancePbfIfMissing(artifacts);
        await this.completeStep(run.id, "download", {
          artifactPath: result.path,
          metrics: { downloaded: result.downloaded },
          logSummary: result.downloaded ? "Téléchargement Geofabrik terminé." : "Artefact PBF déjà disponible pour ce run.",
        });
      }

      if (!(await this.wasStepSuccessful(run.id, "filter"))) {
        await this.startStep(run.id, "filter", 2);
        const result = await filterOsmPbf(artifacts);
        await this.completeStep(run.id, "filter", {
          artifactPath: result.path,
          logSummary: "Filtrage osmium terminé.",
        });
      }

      if (!(await this.wasStepSuccessful(run.id, "export"))) {
        await this.startStep(run.id, "export", 3);
        const result = await exportOsmGeoJsonSeq(artifacts);
        await this.completeStep(run.id, "export", {
          artifactPath: result.path,
          logSummary: "Export GeoJSON sequence terminé.",
        });
      }

      await this.startStep(run.id, "import", 4);
      const importStats = await importOsmGeoJsonSeq(this.prisma as never, artifacts.geojsonSeq);
      await this.completeStep(run.id, "import", {
        artifactPath: artifacts.geojsonSeq,
        metrics: importStats as unknown as Record<string, unknown>,
        logSummary: `${importStats.upserted} POI importés, ${importStats.errors} erreurs.`,
      });

      await this.startStep(run.id, "sync_flags", 5);
      const flagsStats = await runSyncAerodromeFlagsTask(this.prisma as never);
      await this.completeStep(run.id, "sync_flags", {
        metrics: flagsStats as unknown as Record<string, unknown>,
        logSummary: `${flagsStats.updated} aérodromes recalculés.`,
      });

      return {
        source: "OSM" as const,
        status: importStats.errors > 0 ? ("PARTIAL" as const) : ("SUCCESS" as const),
        summary: toInputJsonValue({
          importStats,
          flagsStats,
          artifacts: {
            rawPbf: artifacts.rawPbf,
            filteredPbf: artifacts.filteredPbf,
            geojsonSeq: artifacts.geojsonSeq,
          },
        }),
        errorMessage: importStats.errors > 0 ? `${importStats.errors} erreur(s) pendant l'import OSM.` : null,
      };
    } catch (error) {
      const lastRunningStep = await this.prisma.syncRunStep.findFirst({
        where: { runId: run.id, status: "RUNNING" },
        orderBy: { stepOrder: "desc" },
      });
      if (lastRunningStep) {
        await this.failStep(run.id, lastRunningStep.stepKey, error);
      }
      throw error;
    }
  }

  private async executeRgpd(run: SyncRun): Promise<RunExecutionResult> {
    await this.startStep(run.id, "rgpd_cleanup", 1);

    try {
      const result = await this.runRgpdCleanup();
      await this.completeStep(run.id, "rgpd_cleanup", {
        metrics: result as unknown as Record<string, unknown>,
        logSummary: `Audit logs supprimés: ${result.auditLogsDeleted}, tokens: ${result.tokensDeleted}`,
      });

      return {
        source: "RGPD" as const,
        status: "SUCCESS" as const,
        summary: toInputJsonValue(result),
      };
    } catch (error) {
      await this.failStep(run.id, "rgpd_cleanup", error);
      throw error;
    }
  }

  private async startStep(runId: string, stepKey: string, stepOrder: number) {
    await this.prisma.syncRunStep.upsert({
      where: { runId_stepKey: { runId, stepKey } },
      create: {
        runId,
        stepKey,
        stepOrder,
        status: "RUNNING",
        startedAt: new Date(),
      },
      update: {
        stepOrder,
        status: "RUNNING",
        startedAt: new Date(),
        finishedAt: null,
        durationMs: null,
        metrics: Prisma.JsonNull,
        checkpoint: Prisma.JsonNull,
        artifactPath: null,
        logSummary: null,
      },
    });
  }

  private async completeStep(
    runId: string,
    stepKey: string,
    data?: {
      metrics?: Record<string, unknown>;
      checkpoint?: Record<string, unknown>;
      artifactPath?: string | null;
      logSummary?: string | null;
    },
  ) {
    const existing = await this.prisma.syncRunStep.findUnique({
      where: { runId_stepKey: { runId, stepKey } },
    });
    const finishedAt = new Date();
    await this.prisma.syncRunStep.update({
      where: { runId_stepKey: { runId, stepKey } },
      data: {
        status: "SUCCESS",
        finishedAt,
        durationMs: existing?.startedAt ? finishedAt.getTime() - existing.startedAt.getTime() : null,
        metrics: data?.metrics ? toInputJsonValue(data.metrics) : undefined,
        checkpoint: data?.checkpoint ? toInputJsonValue(data.checkpoint) : undefined,
        artifactPath: data?.artifactPath ?? null,
        logSummary: data?.logSummary ?? null,
      },
    });
  }

  private async failStep(runId: string, stepKey: string, error: unknown) {
    const existing = await this.prisma.syncRunStep.findUnique({
      where: { runId_stepKey: { runId, stepKey } },
    });
    const finishedAt = new Date();
    await this.prisma.syncRunStep.update({
      where: { runId_stepKey: { runId, stepKey } },
      data: {
        status: "FAILED",
        finishedAt,
        durationMs: existing?.startedAt ? finishedAt.getTime() - existing.startedAt.getTime() : null,
        logSummary: asErrorMessage(error),
      },
    });
  }

  private async wasStepSuccessful(runId: string, stepKey: string) {
    const step = await this.prisma.syncRunStep.findUnique({
      where: { runId_stepKey: { runId, stepKey } },
      select: { status: true },
    });
    return step?.status === "SUCCESS";
  }

  private async handleRunFailure(run: SyncRun, error: unknown) {
    const maxAttempts = this.getRetryAttempts();
    const errorMessage = asErrorMessage(error);

    if (run.attempt < maxAttempts) {
      const nextAttempt = run.attempt + 1;
      const delayMinutes = this.getRetryDelayMinutes(run.attempt);
      const nextRetryAt = new Date(Date.now() + delayMinutes * 60_000);

      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: "RETRY_SCHEDULED",
          attempt: nextAttempt,
          nextRetryAt,
          errorMessage,
          summary: toInputJsonValue({
            ...(getJsonObject(run.summary)),
            lastError: errorMessage,
            lastRetryAt: nextRetryAt.toISOString(),
          }),
        },
      });

      this.logger.warn(
        `Sync ${run.source} échoué, replanifié dans ${delayMinutes} min (tentative ${nextAttempt}/${maxAttempts}).`,
      );
      return;
    }

    const finishedAt = new Date();
    await this.prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt,
        durationMs: run.startedAt ? finishedAt.getTime() - run.startedAt.getTime() : null,
        errorMessage,
        summary: toInputJsonValue({
          ...(getJsonObject(run.summary)),
          lastError: errorMessage,
        }),
      },
    });

    this.logger.error(`Sync ${run.source} définitivement en échec`, error);
  }

  private getRetryAttempts() {
    return Number(this.config.get<string>("SYNC_RETRY_ATTEMPTS", "3"));
  }

  private getRetryDelayMinutes(currentAttempt: number) {
    const backoff = this.config
      .get<string>("SYNC_RETRY_BACKOFF_MINUTES", "15,30,60")
      .split(",")
      .map((token) => Number(token.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);

    return backoff[Math.max(0, currentAttempt - 1)] ?? backoff.at(-1) ?? 15;
  }

  private async resolveSummaryRecipients() {
    const override = this.config.get<string>("SYNC_REPORT_EMAIL_OVERRIDE");
    if (override?.trim()) {
      return override
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean);
    }

    const admins = await this.prisma.user.findMany({
      where: {
        role: "ADMIN",
        status: "ACTIVE",
        emailVerified: { not: null },
      },
      select: { email: true },
    });

    return admins.map((admin) => admin.email);
  }

  private async sendNightlySummaryEmail() {
    const recipients = await this.resolveSummaryRecipients();
    if (recipients.length === 0) {
      this.logger.warn("Aucun destinataire pour le récapitulatif de sync.");
      return;
    }

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const runs = await this.prisma.syncRun.findMany({
      where: {
        runType: { in: ["SCHEDULED", "RETRY", "RECOVERY"] },
        scheduledFor: {
          gte: start,
          lte: end,
        },
      },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    });

    if (runs.length === 0) {
      return;
    }

    await this.mail.sendSyncSummary(recipients, {
      dateLabel: start.toLocaleDateString("fr-FR"),
      runs: runs.map((run) => ({
        source: run.source,
        status: run.status,
        durationMs: run.durationMs,
        scheduledFor: run.scheduledFor.toISOString(),
        startedAt: run.startedAt?.toISOString() ?? null,
        finishedAt: run.finishedAt?.toISOString() ?? null,
        nextRetryAt: run.nextRetryAt?.toISOString() ?? null,
        summary: getJsonObject(run.summary),
        errorMessage: run.errorMessage,
      })),
    });
  }

  private getScheduleForSource(source: SyncSource) {
    switch (source) {
      case "OPENAIP":
        return OPENAIP_CRON;
      case "OSM":
        return OSM_CRON;
      case "REGIONS":
        return `${OPENAIP_CRON} + ${REGIONS_FULL_CRON}`;
      case "RGPD":
        return RGPD_CRON;
      default:
        return "";
    }
  }

  private getNextPlannedAt(source: SyncSource) {
    const now = new Date();

    if (source === "REGIONS") {
      const nextDelta = computeNextCronOccurrence(OPENAIP_CRON, now);
      const nextFull = computeNextCronOccurrence(REGIONS_FULL_CRON, now);
      if (!nextDelta) return nextFull;
      if (!nextFull) return nextDelta;
      return nextDelta < nextFull ? nextDelta : nextFull;
    }

    return computeNextCronOccurrence(this.getScheduleForSource(source), now);
  }

  private async updateWorkerHeartbeat() {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.set(
        WORKER_HEARTBEAT_KEY,
        JSON.stringify({
          workerId: this.workerId,
          heartbeatAt: new Date().toISOString(),
        }),
        "EX",
        WORKER_HEARTBEAT_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(`Impossible de publier le heartbeat du worker: ${asErrorMessage(error)}`);
    }
  }

  private async getWorkerHeartbeat(): Promise<{ alive: boolean; workerId: string | null } | null> {
    if (!this.redis) {
      return null;
    }

    try {
      const raw = await this.redis.get(WORKER_HEARTBEAT_KEY);
      if (!raw) {
        return { alive: false, workerId: null };
      }

      const parsed = JSON.parse(raw) as { workerId?: string; heartbeatAt?: string };
      const heartbeatAt = parsed.heartbeatAt ? new Date(parsed.heartbeatAt) : null;
      const alive =
        heartbeatAt instanceof Date &&
        !Number.isNaN(heartbeatAt.getTime()) &&
        Date.now() - heartbeatAt.getTime() <= WORKER_HEARTBEAT_TTL_SECONDS * 1000;

      return {
        alive,
        workerId: parsed.workerId ?? null,
      };
    } catch (error) {
      this.logger.warn(`Impossible de lire le heartbeat du worker: ${asErrorMessage(error)}`);
      return null;
    }
  }
}
