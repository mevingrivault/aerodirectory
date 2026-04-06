import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import type { SyncSource } from "@aerodirectory/database";
import { CurrentUser, Roles } from "../common/decorators";
import { ok } from "../common/api-response";
import { SyncService } from "./sync.service";

const ALLOWED_SOURCES: SyncSource[] = ["OPENAIP", "OSM", "REGIONS", "RGPD"];

@Controller("admin/sync")
@Roles("ADMIN")
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get("status")
  async status() {
    return ok(await this.sync.getStatusOverview());
  }

  @Post(":source")
  @HttpCode(HttpStatus.OK)
  async trigger(
    @Param("source") source: string,
    @CurrentUser() user: { sub: string },
  ) {
    const normalized = source.toUpperCase() as SyncSource;
    if (!ALLOWED_SOURCES.includes(normalized)) {
      throw new BadRequestException("Source de synchronisation invalide.");
    }

    const run = await this.sync.triggerManual(normalized, user.sub);
    return ok({
      started: true,
      runId: run.id,
      source: run.source,
      status: run.status,
      message: "Synchronisation ajoutée à la file d'attente.",
    });
  }

  @Post("openaip")
  @HttpCode(HttpStatus.OK)
  async triggerOpenAip(@CurrentUser() user: { sub: string }) {
    const run = await this.sync.triggerManual("OPENAIP", user.sub);
    return ok({
      started: true,
      runId: run.id,
      source: run.source,
      status: run.status,
      message: "Synchronisation openAIP ajoutée à la file d'attente.",
    });
  }

  @Post("rgpd-cleanup")
  @HttpCode(HttpStatus.OK)
  async triggerRgpd(@CurrentUser() user: { sub: string }) {
    const run = await this.sync.triggerManual("RGPD", user.sub);
    return ok({
      started: true,
      runId: run.id,
      source: run.source,
      status: run.status,
      message: "Nettoyage RGPD ajouté à la file d'attente.",
    });
  }
}
