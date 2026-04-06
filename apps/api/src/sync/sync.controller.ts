import {
  Controller,
  Post,
  Get,
  ConflictException,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { SyncService } from "./sync.service";
import { CurrentUser, Roles } from "../common/decorators";
import { ok } from "../common/api-response";

@Controller("admin/sync")
@Roles("ADMIN")
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get("status")
  status() {
    return ok({ running: this.sync.isRunning() });
  }

  @Post("openaip")
  @HttpCode(HttpStatus.OK)
  async triggerOpenAip(
    @CurrentUser() user: { sub: string },
  ) {
    if (this.sync.isRunning()) {
      throw new ConflictException("Un sync est déjà en cours.");
    }

    // Fire and forget — return immediately, sync runs in background
    void this.sync.syncOpenAip(user.sub).catch(() => undefined);

    return ok({ started: true, message: "Sync openAIP lancé en arrière-plan." });
  }

  @Post("rgpd-cleanup")
  @HttpCode(HttpStatus.OK)
  async triggerRgpdCleanup() {
    const result = await this.sync.runRgpdCleanup();
    return ok(result);
  }
}
