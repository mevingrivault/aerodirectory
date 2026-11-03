import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { FastifyRequest } from "fastify";
import {
  AdminCommunityInfosQuerySchema,
  CommunityInfoCreateSchema,
  ReviewAdminCommunityInfoSchema,
  type AdminCommunityInfosQueryInput,
  type CommunityInfoCreateInput,
  type ReviewAdminCommunityInfoInput,
} from "@aerodirectory/shared";
import { AltchaGuard } from "../altcha/altcha.guard";
import { ok, paginated } from "../common/api-response";
import { CurrentUser, Public, Roles } from "../common/decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CommunityInfoService } from "./community-info.service";

@Controller("aerodromes/:aerodromeId/community-info")
export class CommunityInfoController {
  constructor(private readonly communityInfo: CommunityInfoService) {}

  @Public()
  @Get()
  async get(@Param("aerodromeId") aerodromeId: string) {
    return ok(await this.communityInfo.getForAerodrome(aerodromeId));
  }

  @UseGuards(AltchaGuard)
  @Throttle({ short: { limit: 3, ttl: 60000 }, medium: { limit: 20, ttl: 3600000 } })
  @Post()
  async propose(
    @CurrentUser() user: { sub: string },
    @Param("aerodromeId") aerodromeId: string,
    @Body(new ZodValidationPipe(CommunityInfoCreateSchema)) body: CommunityInfoCreateInput,
    @Req() req: FastifyRequest,
  ) {
    return ok(await this.communityInfo.propose(user.sub, aerodromeId, body, req.ip));
  }

  @UseGuards(AltchaGuard)
  @Throttle({ short: { limit: 3, ttl: 60000 }, medium: { limit: 20, ttl: 3600000 } })
  @Post(":id/confirm")
  async confirm(
    @CurrentUser() user: { sub: string },
    @Param("aerodromeId") aerodromeId: string,
    @Param("id") id: string,
    @Req() req: FastifyRequest,
  ) {
    return ok(await this.communityInfo.confirm(user.sub, aerodromeId, id, req.ip));
  }
}

@Controller("admin/community-infos")
@Roles("ADMIN")
export class AdminCommunityInfoController {
  constructor(private readonly communityInfo: CommunityInfoService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(AdminCommunityInfosQuerySchema)) query: AdminCommunityInfosQueryInput,
  ) {
    const { data, total } = await this.communityInfo.listForAdmin(query);
    return paginated(data, total, query.page ?? 1, query.limit ?? 20);
  }

  @Post(":id/approve")
  @HttpCode(HttpStatus.OK)
  async approve(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ReviewAdminCommunityInfoSchema)) body: ReviewAdminCommunityInfoInput,
    @Req() req: FastifyRequest,
  ) {
    await this.communityInfo.review(user.sub, id, "APPROVED", body, req.ip, req.headers["user-agent"]);
    return ok({ approved: true });
  }

  @Post(":id/reject")
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ReviewAdminCommunityInfoSchema)) body: ReviewAdminCommunityInfoInput,
    @Req() req: FastifyRequest,
  ) {
    await this.communityInfo.review(user.sub, id, "REJECTED", body, req.ip, req.headers["user-agent"]);
    return ok({ rejected: true });
  }
}
