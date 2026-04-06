import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
} from "@nestjs/common";
import { VisitService } from "./visit.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ok } from "../common/api-response";
import { CurrentUser } from "../common/decorators";
import { VisitUpsertSchema, type VisitUpsertInput } from "@aerodirectory/shared";

@Controller("visits")
export class VisitController {
  constructor(private readonly visits: VisitService) {}

  @Get()
  async myVisits(@CurrentUser() user: { sub: string }) {
    const data = await this.visits.getUserVisits(user.sub);
    return ok(data);
  }

  @Get("stats")
  async aerodexStats(@CurrentUser() user: { sub: string }) {
    const stats = await this.visits.getAerodexStats(user.sub);
    return ok(stats);
  }

  @Put(":aerodromeId")
  async upsert(
    @CurrentUser() user: { sub: string },
    @Param("aerodromeId") aerodromeId: string,
    @Body(new ZodValidationPipe(VisitUpsertSchema)) body: VisitUpsertInput,
  ) {
    const visit = await this.visits.upsert(user.sub, aerodromeId, body);
    return ok(visit);
  }

  @Delete(":aerodromeId")
  async remove(
    @CurrentUser() user: { sub: string },
    @Param("aerodromeId") aerodromeId: string,
  ) {
    await this.visits.remove(user.sub, aerodromeId);
    return ok({ deleted: true });
  }
}
