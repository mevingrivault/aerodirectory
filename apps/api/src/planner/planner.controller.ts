import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
} from "@nestjs/common";
import { PlannerService } from "./planner.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ok } from "../common/api-response";
import { CurrentUser } from "../common/decorators";
import {
  AircraftProfileSchema,
  PlannerQuerySchema,
  type AircraftProfileInput,
  type PlannerQueryInput,
} from "@aerodirectory/shared";

@Controller("planner")
export class PlannerController {
  constructor(private readonly planner: PlannerService) {}

  // ─── Aircraft profiles ──────────────────────────────

  @Get("profiles")
  async getProfiles(@CurrentUser() user: { sub: string }) {
    const profiles = await this.planner.getProfiles(user.sub);
    return ok(profiles);
  }

  @Post("profiles")
  async createProfile(
    @CurrentUser() user: { sub: string },
    @Body(new ZodValidationPipe(AircraftProfileSchema))
    body: AircraftProfileInput,
  ) {
    const profile = await this.planner.createProfile(user.sub, body);
    return ok(profile);
  }

  @Put("profiles/:id")
  async updateProfile(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AircraftProfileSchema.partial()))
    body: Partial<AircraftProfileInput>,
  ) {
    const profile = await this.planner.updateProfile(user.sub, id, body);
    return ok(profile);
  }

  @Delete("profiles/:id")
  async deleteProfile(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
  ) {
    await this.planner.deleteProfile(user.sub, id);
    return ok({ deleted: true });
  }

  // ─── Flight plan calculation ─────────────────────────

  @Post("calculate")
  async calculate(
    @CurrentUser() user: { sub: string },
    @Body(new ZodValidationPipe(PlannerQuerySchema)) body: PlannerQueryInput,
  ) {
    const results = await this.planner.plan(user.sub, body);
    return ok(results);
  }
}
