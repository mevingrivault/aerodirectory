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
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import {
  AdminCommentsQuerySchema,
  AdminUsersQuerySchema,
  BanUserSchema,
  DeleteAdminCommentSchema,
  RestoreAdminCommentSchema,
  type AdminCommentsQueryInput,
  type AdminUsersQueryInput,
  type BanUserInput,
  type DeleteAdminCommentInput,
  type RestoreAdminCommentInput,
} from "@aerodirectory/shared";
import { Roles, CurrentUser } from "../common/decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ok, paginated } from "../common/api-response";
import { AdminService } from "./admin.service";

@Controller("admin")
@Roles("ADMIN")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

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

  @Get("comments")
  async comments(
    @Query(new ZodValidationPipe(AdminCommentsQuerySchema))
    query: AdminCommentsQueryInput,
  ) {
    const { data, total } = await this.admin.listComments(query);
    return paginated(data, total, query.page ?? 1, query.limit ?? 20);
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
