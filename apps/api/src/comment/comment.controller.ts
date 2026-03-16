import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { CommentService } from "./comment.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ok, paginated } from "../common/api-response";
import { Public, CurrentUser } from "../common/decorators";
import {
  CommentCreateSchema,
  CorrectionCreateSchema,
  ReportCreateSchema,
  PaginationSchema,
  type CommentCreateInput,
  type CorrectionCreateInput,
  type ReportCreateInput,
  type PaginationInput,
} from "@aerodirectory/shared";

@Controller("aerodromes/:aerodromeId")
export class CommentController {
  constructor(private readonly comments: CommentService) {}

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
