import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { FastifyRequest } from "fastify";
import { CommentService } from "./comment.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ok, paginated } from "../common/api-response";
import { Public, CurrentUser } from "../common/decorators";
import { AltchaGuard } from "../altcha/altcha.guard";
import {
  CommentCreateSchema,
  CorrectionCreateSchema,
  ReportCreateSchema,
  EventCreateSchema,
  PaginationSchema,
  type CommentCreateInput,
  type CorrectionCreateInput,
  type ReportCreateInput,
  type EventCreateInput,
  type PaginationInput,
} from "@aerodirectory/shared";

@Controller("aerodromes/:aerodromeId")
export class CommentController {
  constructor(private readonly comments: CommentService) {}

  @Public()
  @Get("corrections")
  async getCorrections(@Param("aerodromeId") aerodromeId: string) {
    const data = await this.comments.getApprovedCorrections(aerodromeId);
    return ok(data);
  }

  @Public()
  @Get("comments")
  async getComments(
    @Param("aerodromeId") aerodromeId: string,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationInput,
  ) {
    const { data, total } = await this.comments.getComments(
      aerodromeId,
      query.page,
      query.limit,
    );
    return paginated(data, total, query.page, query.limit);
  }

  @UseGuards(AltchaGuard)
  @Throttle({ short: { limit: 5, ttl: 60000 }, medium: { limit: 20, ttl: 3600000 } })
  @Post("comments")
  async createComment(
    @CurrentUser() user: { sub: string },
    @Param("aerodromeId") aerodromeId: string,
    @Body(new ZodValidationPipe(CommentCreateSchema)) body: CommentCreateInput,
    @Req() req: FastifyRequest,
  ) {
    const comment = await this.comments.createComment(
      user.sub,
      aerodromeId,
      body,
      req.ip,
    );
    return ok(comment);
  }

  @Delete("comments/:commentId")
  async deleteComment(
    @CurrentUser() user: { sub: string; role: string },
    @Param("commentId") commentId: string,
  ) {
    await this.comments.deleteComment(user.sub, commentId, user.role);
    return ok({ deleted: true });
  }

  @UseGuards(AltchaGuard)
  @Throttle({ short: { limit: 3, ttl: 60000 }, medium: { limit: 10, ttl: 3600000 } })
  @Post("corrections")
  async proposeCorrection(
    @CurrentUser() user: { sub: string },
    @Param("aerodromeId") aerodromeId: string,
    @Body(new ZodValidationPipe(CorrectionCreateSchema))
    body: CorrectionCreateInput,
    @Req() req: FastifyRequest,
  ) {
    const correction = await this.comments.proposeCorrection(
      user.sub,
      aerodromeId,
      body,
      req.ip,
    );
    return ok(correction);
  }

  @Public()
  @Get("events")
  async getEvents(@Param("aerodromeId") aerodromeId: string) {
    const data = await this.comments.getUpcomingEvents(aerodromeId);
    return ok(data);
  }

  @UseGuards(AltchaGuard)
  @Throttle({ short: { limit: 3, ttl: 60000 }, medium: { limit: 10, ttl: 3600000 } })
  @Post("events")
  async createEvent(
    @CurrentUser() user: { sub: string },
    @Param("aerodromeId") aerodromeId: string,
    @Body(new ZodValidationPipe(EventCreateSchema)) body: EventCreateInput,
    @Req() req: FastifyRequest,
  ) {
    const event = await this.comments.createEvent(user.sub, aerodromeId, body, req.ip);
    return ok(event);
  }

  @Delete("events/:eventId")
  @HttpCode(HttpStatus.OK)
  async deleteEvent(
    @CurrentUser() user: { sub: string; role: string },
    @Param("eventId") eventId: string,
  ) {
    await this.comments.deleteEvent(user.sub, eventId, user.role);
    return ok({ deleted: true });
  }

  @Throttle({ short: { limit: 5, ttl: 60000 }, medium: { limit: 15, ttl: 3600000 } })
  @Post("reports")
  async report(
    @CurrentUser() user: { sub: string },
    @Param("aerodromeId") aerodromeId: string,
    @Body(new ZodValidationPipe(ReportCreateSchema)) body: ReportCreateInput,
    @Req() req: FastifyRequest,
  ) {
    const report = await this.comments.createReport(
      user.sub,
      aerodromeId,
      body,
      req.ip,
    );
    return ok(report);
  }
}
