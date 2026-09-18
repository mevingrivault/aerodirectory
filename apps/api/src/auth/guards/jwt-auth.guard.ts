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

interface IncomingTokenPayload {
  sub?: string;
  role?: string;
  ver?: number;
  typ?: string;
  totpPending?: boolean;
}

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

    let payload: IncomingTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<IncomingTokenPayload>(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    // Only plain access tokens open a session: the partial TOTP token and the
    // refresh token are signed for their own endpoints and nothing else.
    if (payload.typ !== undefined || payload.totpPending || !payload.sub) {
      throw new UnauthorizedException("Invalid or expired token");
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true, tokenVersion: true },
    });

    if (!dbUser) {
      throw new UnauthorizedException("Account not found");
    }

    if (dbUser.status === "BANNED") {
      throw new UnauthorizedException("Votre compte a été suspendu.");
    }

    if (payload.ver !== dbUser.tokenVersion) {
      throw new UnauthorizedException("Session révoquée. Reconnectez-vous.");
    }

    request.user = {
      ...payload,
      role: dbUser.role,
      status: dbUser.status,
    };

    return true;
  }

  private extractToken(request: {
    headers: Record<string, string | undefined>;
    cookies?: Record<string, string | undefined>;
  }): string | undefined {
    // 1. Cookie httpOnly (prioritaire)
    const cookie = request.cookies?.["access_token"];
    if (cookie) return cookie;
    // 2. Header Authorization Bearer (rétrocompatibilité / API calls)
    const auth = request.headers["authorization"];
    if (!auth) return undefined;
    const [type, token] = auth.split(" ");
    return type === "Bearer" ? token : undefined;
  }
}
