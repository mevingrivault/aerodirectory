import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { IS_PUBLIC_KEY } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException("Missing authentication token");
    }

    try {
      const payload = await this.jwt.verifyAsync(token);
      const dbUser = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, status: true },
      });

      if (!dbUser) {
        throw new UnauthorizedException("Account not found");
      }

      if (dbUser.status === "BANNED") {
        throw new UnauthorizedException("Votre compte a été suspendu.");
      }

      if (payload.totpPending && !request.url.startsWith("/api/v1/auth/login/totp")) {
        throw new UnauthorizedException("Two-factor authentication required");
      }
      request.user = {
        ...payload,
        role: dbUser.role,
        status: dbUser.status,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("Invalid or expired token");
    }

    return true;
  }

  private extractToken(request: { headers: Record<string, string | undefined> }): string | undefined {
    const auth = request.headers["authorization"];
    if (!auth) return undefined;
    const [type, token] = auth.split(" ");
    return type === "Bearer" ? token : undefined;
  }
}
