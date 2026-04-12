import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import {
  AdminPhotosQuerySchema,
  AdminReportsQuerySchema,
  AdminMailEventsQuerySchema,
  AdminCommentsQuerySchema,
  AdminUsersQuerySchema,
  AdminImportOpenAirSchema,
  ApproveAdminPhotoSchema,
  BanUserSchema,
  DeleteAdminUserSchema,
  DeleteAdminCommentSchema,
  RejectAdminPhotoSchema,
  ReviewAdminReportSchema,
  RestoreAdminCommentSchema,
  type AdminPhotosQueryInput,
  type AdminReportsQueryInput,
  type AdminMailEventsQueryInput,
  type AdminCommentsQueryInput,
  type AdminUsersQueryInput,
  type AdminImportOpenAirInput,
  type ApproveAdminPhotoInput,
  type BanUserInput,
  type DeleteAdminUserInput,
  type DeleteAdminCommentInput,
  type RejectAdminPhotoInput,
  type ReviewAdminReportInput,
  type RestoreAdminCommentInput,
} from "@aerodirectory/shared";
import { Roles, CurrentUser } from "../common/decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ok, paginated } from "../common/api-response";
import { AdminService } from "./admin.service";
import { StorageService } from "../photo/storage.service";

@Controller("admin")
@Roles("ADMIN")
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly storage: StorageService,
  ) {}

  @Get("stats")
  async stats() {
    return ok(await this.admin.getDashboardStats());
  }

  @Get("users")
  async users(
    @Query(new ZodValidationPipe(AdminUsersQuerySchema))
    query: AdminUsersQueryInput,
  ) {
    const { data, total } = await this.admin.listUsers(query);
    return paginated(data, total, query.page ?? 1, query.limit ?? 20);
  }

  @Get("users/:userId")
  async userDetail(@Param("userId") userId: string) {
    return ok(await this.admin.getUserDetail(userId));
  }

  @Post("users/:userId/ban")
  @HttpCode(HttpStatus.OK)
  async banUser(
    @CurrentUser() user: { sub: string },
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(BanUserSchema)) body: BanUserInput,
    @Req() req: FastifyRequest,
  ) {
    await this.admin.banUser(user.sub, userId, body, req.ip, req.headers["user-agent"]);
    return ok({ banned: true });
  }

  @Post("users/:userId/unban")
  @HttpCode(HttpStatus.OK)
  async unbanUser(
    @CurrentUser() user: { sub: string },
    @Param("userId") userId: string,
    @Req() req: FastifyRequest,
  ) {
    await this.admin.unbanUser(user.sub, userId, req.ip, req.headers["user-agent"]);
    return ok({ unbanned: true });
  }

  @Post("users/:userId/delete")
  @HttpCode(HttpStatus.OK)
  async deleteUser(
    @CurrentUser() user: { sub: string },
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(DeleteAdminUserSchema)) body: DeleteAdminUserInput,
    @Req() req: FastifyRequest,
  ) {
    await this.admin.deleteUser(
      user.sub,
      userId,
      body,
      req.ip,
      req.headers["user-agent"],
    );
    return ok({ deleted: true });
  }

  @Get("comments")
  async comments(
    @Query(new ZodValidationPipe(AdminCommentsQuerySchema))
    query: AdminCommentsQueryInput,
  ) {
    const { data, total } = await this.admin.listComments(query);
    return paginated(data, total, query.page ?? 1, query.limit ?? 20);
  }

  @Get("photos")
  async photos(
    @Query(new ZodValidationPipe(AdminPhotosQuerySchema))
    query: AdminPhotosQueryInput,
  ) {
    const { data, total } = await this.admin.listPhotos(query);
    return paginated(data, total, query.page ?? 1, query.limit ?? 20);
  }

  @Get("reports")
  async reports(
    @Query(new ZodValidationPipe(AdminReportsQuerySchema))
    query: AdminReportsQueryInput,
  ) {
    const { data, total } = await this.admin.listReports(query);
    return paginated(data, total, query.page ?? 1, query.limit ?? 20);
  }

  @Post("reports/:reportId/approve")
  @HttpCode(HttpStatus.OK)
  async approveReport(
    @CurrentUser() user: { sub: string },
    @Param("reportId") reportId: string,
    @Body(new ZodValidationPipe(ReviewAdminReportSchema))
    body: ReviewAdminReportInput,
    @Req() req: FastifyRequest,
  ) {
    await this.admin.approveReport(
      user.sub,
      reportId,
      body,
      req.ip,
      req.headers["user-agent"],
    );
    return ok({ approved: true });
  }

  @Post("reports/:reportId/reject")
  @HttpCode(HttpStatus.OK)
  async rejectReport(
    @CurrentUser() user: { sub: string },
    @Param("reportId") reportId: string,
    @Body(new ZodValidationPipe(ReviewAdminReportSchema))
    body: ReviewAdminReportInput,
    @Req() req: FastifyRequest,
  ) {
    await this.admin.rejectReport(
      user.sub,
      reportId,
      body,
      req.ip,
      req.headers["user-agent"],
    );
    return ok({ rejected: true });
  }

  @Get("mail-events")
  async mailEvents(
    @Query(new ZodValidationPipe(AdminMailEventsQuerySchema))
    query: AdminMailEventsQueryInput,
  ) {
    const { data, total } = await this.admin.listMailEvents(query);
    return paginated(data, total, query.page ?? 1, query.limit ?? 20);
  }

  @Post("airspaces/import-openair")
  @HttpCode(HttpStatus.OK)
  async importOpenAir(
    @CurrentUser() user: { sub: string },
    @Body(new ZodValidationPipe(AdminImportOpenAirSchema))
    body: AdminImportOpenAirInput,
    @Req() req: FastifyRequest,
  ) {
    return ok(
      await this.admin.importOpenAir(
        user.sub,
        body,
        req.ip,
        req.headers["user-agent"],
      ),
    );
  }

  @Get("photos/:photoId/file")
  async photoFile(
    @Param("photoId") photoId: string,
    @Res() res: FastifyReply,
  ) {
    const photo = await this.admin.getPhotoFile(photoId);
    const { stream, contentType, contentLength } = await this.storage.getObject(photo.storedKey);

    res.header("Content-Type", contentType || photo.mimeType);
    if (contentLength) {
      res.header("Content-Length", contentLength);
    }
    res.send(stream);
  }

  @Post("photos/:photoId/approve")
  @HttpCode(HttpStatus.OK)
  async approvePhoto(
    @CurrentUser() user: { sub: string },
    @Param("photoId") photoId: string,
    @Body(new ZodValidationPipe(ApproveAdminPhotoSchema))
    body: ApproveAdminPhotoInput,
    @Req() req: FastifyRequest,
  ) {
    await this.admin.approvePhoto(
      user.sub,
      photoId,
      body,
      req.ip,
      req.headers["user-agent"],
    );
    return ok({ approved: true });
  }

  @Post("photos/:photoId/reject")
  @HttpCode(HttpStatus.OK)
  async rejectPhoto(
    @CurrentUser() user: { sub: string },
    @Param("photoId") photoId: string,
    @Body(new ZodValidationPipe(RejectAdminPhotoSchema))
    body: RejectAdminPhotoInput,
    @Req() req: FastifyRequest,
  ) {
    await this.admin.rejectPhoto(
      user.sub,
      photoId,
      body,
      req.ip,
      req.headers["user-agent"],
    );
    return ok({ rejected: true });
  }

  @Post("comments/:commentId/delete")
  @HttpCode(HttpStatus.OK)
  async deleteComment(
    @CurrentUser() user: { sub: string },
    @Param("commentId") commentId: string,
    @Body(new ZodValidationPipe(DeleteAdminCommentSchema))
    body: DeleteAdminCommentInput,
    @Req() req: FastifyRequest,
  ) {
    await this.admin.deleteComment(
      user.sub,
      commentId,
      body,
      req.ip,
      req.headers["user-agent"],
    );
    return ok({ deleted: true });
  }

  @Post("comments/:commentId/restore")
  @HttpCode(HttpStatus.OK)
  async restoreComment(
    @CurrentUser() user: { sub: string },
    @Param("commentId") commentId: string,
    @Body(new ZodValidationPipe(RestoreAdminCommentSchema))
    body: RestoreAdminCommentInput,
    @Req() req: FastifyRequest,
  ) {
    await this.admin.restoreComment(
      user.sub,
      commentId,
      body,
      req.ip,
      req.headers["user-agent"],
    );
    return ok({ restored: true });
  }
}
