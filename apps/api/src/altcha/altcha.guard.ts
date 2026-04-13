import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { FastifyRequest } from "fastify";
import { AltchaService } from "./altcha.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

/** Routes decorated with @SkipAltcha() bypass the guard */
export const SKIP_ALTCHA_KEY = "skipAltcha";

import { SetMetadata } from "@nestjs/common";
export const SkipAltcha = () => SetMetadata(SKIP_ALTCHA_KEY, true);

@Injectable()
export class AltchaGuard implements CanActivate {
  private readonly logger = new Logger(AltchaGuard.name);

  constructor(
    private readonly altcha: AltchaService,
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!this.altcha.isEnabled()) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ALTCHA_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (skip) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const payload = this.extractPayload(req);

    if (!payload) {
      this.logger.warn(`ALTCHA missing — ${req.method} ${req.url} from ${req.ip}`);
      await this.logAltchaFailure(req, "missing");
      throw new ForbiddenException("Captcha requis.");
    }

    const valid = await this.altcha.verify(payload);
    if (!valid) {
      this.logger.warn(`ALTCHA invalid — ${req.method} ${req.url} from ${req.ip}`);
      await this.logAltchaFailure(req, "invalid");
      throw new ForbiddenException("Captcha invalide ou expiré.");
    }

    return true;
  }

  private extractPayload(req: FastifyRequest): string | null {
    // Header (for multipart/JSON alike)
    const header = req.headers["x-altcha"] as string | undefined;
    if (header) return header;

    // JSON body field
    const body = req.body as Record<string, unknown> | undefined;
    if (body && typeof body["altcha"] === "string") return body["altcha"];

    return null;
  }

  private async logAltchaFailure(
    req: FastifyRequest,
    reason: "missing" | "invalid",
  ): Promise<void> {
    await this.audit.log({
      action: "ADMIN_ACTION",
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        type: "ALTCHA_FAILED",
        reason,
        method: req.method,
        path: req.url,
      },
    });

    const recentFailures = await this.prisma.auditLog.count({
      where: {
        action: "ADMIN_ACTION",
        createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
        metadata: {
          path: ["type"],
          equals: "ALTCHA_FAILED",
        },
      },
    });

    if ([25, 50, 100].includes(recentFailures)) {
      this.logger.error(
        `[ALERT] Pic d'échecs CAPTCHA: ${recentFailures} événements sur 10 minutes`,
      );
    }
  }
}
