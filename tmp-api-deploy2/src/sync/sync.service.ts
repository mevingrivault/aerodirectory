import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { syncOpenAipFranceAirports } from "../services/importers/openaip/openaip.importer";

export interface SyncResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** Cron: every night at 02:00 */
  @Cron("0 2 * * *", { name: "openaip-sync" })
  async scheduledSync() {
    this.logger.log("Scheduled openAIP sync triggered");
    await this.syncOpenAip();
  }

  async syncOpenAip(triggeredByUserId?: string): Promise<SyncResult> {
    if (this.running) {
      throw new Error("Un sync est déjà en cours.");
    }

    this.running = true;
    const startedAt = new Date();
    this.logger.log("openAIP sync started");

    try {
      const apiKey = this.config.getOrThrow<string>("OPENAIP_API_KEY");
      const result = await syncOpenAipFranceAirports(this.prisma as never, apiKey);
      const finishedAt = new Date();

      if (triggeredByUserId) {
        await this.audit.log({
          userId: triggeredByUserId,
          action: "ADMIN_ACTION",
          metadata: {
            type: "OPENAIP_SYNC",
            created: result.created,
            updated: result.updated,
            skipped: result.skipped,
            errors: result.errors.length,
          },
        });
      }

      const syncResult: SyncResult = {
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        ...result,
      };

      this.logger.log(
        `openAIP sync completed — created: ${result.created}, updated: ${result.updated}, skipped: ${result.skipped}, errors: ${result.errors.length}`,
      );

      return syncResult;
    } catch (err) {
      this.logger.error("openAIP sync failed", err);
      throw err;
    } finally {
      this.running = false;
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}
