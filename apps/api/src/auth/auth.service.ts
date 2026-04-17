import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { authenticator } from "otplib";
import { Authenticator } from "@otplib/core";
import {
  createDigest,
  createRandomBytes,
} from "@otplib/plugin-crypto";
import {
  keyDecoder,
  keyEncoder,
} from "@otplib/plugin-thirty-two";
import * as QRCode from "qrcode";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MailService } from "../mail/mail.service";
import { StorageService } from "../photo/storage.service";
import { CryptoService } from "../common/crypto.service";
import type {
  RegisterInput,
  LoginInput,
  AuthTokens,
  TotpSetupResponse,
  UserProfile,
  UpdateProfileInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  ResendVerificationInput,
  CheckEmailInput,
  ResetPasswordInput,
} from "@aerodirectory/shared";

const windowedAuthenticator = new Authenticator({
  createDigest,
  createRandomBytes,
  keyDecoder,
  keyEncoder,
});

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
    private readonly crypto: CryptoService,
  ) {}

  private verifyTotpCode(secret: string, code: string): boolean {
    const configuredWindow = Number(this.config.get("TOTP_WINDOW"));
    const window =
      Number.isInteger(configuredWindow) && configuredWindow >= 0
        ? configuredWindow
        : 2;

    return windowedAuthenticator.clone({ window }).check(code, secret);
  }

  // ─── Registration ───────────────────────────────────────

  async register(
    input: RegisterInput,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new ConflictException("Email already registered");
    }

    const displayNameTaken = await this.prisma.user.findFirst({
      where: {
        displayName: {
          equals: input.displayName,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (displayNameTaken) {
      throw new ConflictException("Display name already taken");
    }

    // Argon2id with OWASP-recommended parameters
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
      },
    });

    // Create email verification token
    const token = randomBytes(32).toString("hex");
    await this.prisma.emailToken.create({
      data: {
        token,
        userId: user.id,
        type: "verify",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      },
    });

    await this.mail.sendEmailVerification(user.email, token);

    await this.audit.log({
      userId: user.id,
      action: "ACCOUNT_CREATE",
      ip,
      userAgent,
    });
  }

  // ─── Login ──────────────────────────────────────────────

  async checkEmailAvailability(
    input: CheckEmailInput,
  ): Promise<{ available: boolean }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    return { available: !existing };
  }

  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  async login(
    input: LoginInput,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens & { requireTotp: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      // Constant-time comparison — hash a dummy password to prevent timing attacks
      await argon2.hash("dummy-password-for-timing", {
        type: argon2.argon2id,
      });
      throw new UnauthorizedException("Invalid credentials");
    }

    // Check lockout before password verification
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfterSeconds = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      throw new UnauthorizedException(
        `Compte temporairement verrouillé. Réessayez dans ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
      );
    }

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      const newAttempts = user.failedLoginAttempts + 1;
      const shouldLock = newAttempts >= AuthService.MAX_FAILED_ATTEMPTS;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + AuthService.LOCKOUT_DURATION_MS)
        : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          ...(lockedUntil !== null ? { lockedUntil } : {}),
        },
      });

      await this.audit.log({
        userId: user.id,
        action: "LOGIN_FAILED",
        ip,
        userAgent,
        metadata: { attempt: newAttempts },
      });

      if (shouldLock) {
        await this.audit.log({
          userId: user.id,
          action: "ACCOUNT_LOCKED",
          ip,
          userAgent,
          metadata: { lockedUntil: lockedUntil!.toISOString() },
        });
        throw new UnauthorizedException(
          "Compte verrouillé après trop de tentatives échouées. Réessayez dans 15 minutes.",
        );
      }

      throw new UnauthorizedException("Invalid credentials");
    }

    // Reset lockout counters on successful password verification
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    if (user.status === "BANNED") {
      throw new UnauthorizedException("Votre compte a été suspendu.");
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException("Veuillez vérifier votre adresse e-mail avant de vous connecter.");
    }

    // If TOTP is enabled, return partial auth (frontend must complete TOTP step)
    if (user.totpEnabled) {
      const partialToken = this.jwt.sign(
        { sub: user.id, role: user.role, totpPending: true },
        { expiresIn: "5m" },
      );
      return {
        accessToken: partialToken,
        refreshToken: "",
        requireTotp: true,
      };
    }

    await this.audit.log({
      userId: user.id,
      action: "LOGIN",
      ip,
      userAgent,
    });

    return {
      ...(await this.generateTokens(user.id, user.role)),
      requireTotp: false,
    };
  }

  // ─── TOTP ──────────────────────────────────────────────

  async setupTotp(userId: string): Promise<TotpSetupResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (user.totpEnabled) {
      throw new BadRequestException("TOTP is already enabled");
    }

    const secret = authenticator.generateSecret();

    // Chiffrement AES-256-GCM avant stockage
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: this.crypto.encrypt(secret) },
    });

    const otpauthUrl = authenticator.keyuri(
      user.email,
      "Navventura",
      secret,
    );
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    return { secret, qrCodeUrl };
  }

  async verifyAndEnableTotp(
    userId: string,
    code: string,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!user.totpSecret) {
      throw new BadRequestException("TOTP setup not initiated");
    }

    const secret = this.crypto.decrypt(user.totpSecret);
    const valid = this.verifyTotpCode(secret, code);

    if (!valid) {
      throw new UnauthorizedException("Invalid TOTP code");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });

    await this.audit.log({
      userId,
      action: "TOTP_ENABLE",
      ip,
      userAgent,
    });
  }

  async verifyTotpLogin(
    userId: string,
    code: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!user.totpSecret || !user.totpEnabled) {
      throw new BadRequestException("TOTP not enabled");
    }

    const secret = this.crypto.decrypt(user.totpSecret);
    const valid = this.verifyTotpCode(secret, code);

    if (!valid) {
      throw new UnauthorizedException("Invalid TOTP code");
    }

    await this.audit.log({
      userId,
      action: "LOGIN",
      ip,
      userAgent,
      metadata: { method: "totp" },
    });

    return this.generateTokens(user.id, user.role);
  }

  // ─── Email verification ─────────────────────────────────

  async verifyEmail(token: string): Promise<void> {
    const emailToken = await this.prisma.emailToken.findUnique({
      where: { token },
    });

    if (
      !emailToken ||
      emailToken.type !== "verify" ||
      emailToken.usedAt ||
      emailToken.expiresAt < new Date()
    ) {
      throw new BadRequestException("Invalid or expired token");
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: emailToken.userId },
        data: { emailVerified: new Date() },
      }),
      this.prisma.emailToken.update({
        where: { id: emailToken.id },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  // ─── Password reset ────────────────────────────────────

  async resendVerificationEmail(
    input: ResendVerificationInput,
    _ip?: string,
    _userAgent?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user || user.emailVerified) {
      return;
    }

    await this.prisma.emailToken.updateMany({
      where: {
        userId: user.id,
        type: "verify",
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString("hex");
    await this.prisma.emailToken.create({
      data: {
        token,
        userId: user.id,
        type: "verify",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await this.mail.sendEmailVerification(user.email, token);
  }

  async requestPasswordReset(
    input: ForgotPasswordInput,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    // Message générique — ne pas révéler si l'email existe
    if (!user) return;

    // Invalider les anciens tokens de reset non utilisés
    await this.prisma.emailToken.updateMany({
      where: {
        userId: user.id,
        type: "reset",
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString("hex");
    await this.prisma.emailToken.create({
      data: {
        token,
        userId: user.id,
        type: "reset",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 heure
      },
    });

    await this.mail.sendPasswordReset(user.email, token);

    await this.audit.log({
      userId: user.id,
      action: "PASSWORD_RESET_REQUEST",
      ip,
      userAgent,
    });
  }

  async resetPassword(
    input: ResetPasswordInput,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const emailToken = await this.prisma.emailToken.findUnique({
      where: { token: input.token },
      include: { user: true },
    });

    if (
      !emailToken ||
      emailToken.type !== "reset" ||
      emailToken.usedAt ||
      emailToken.expiresAt < new Date()
    ) {
      throw new BadRequestException("Lien de réinitialisation invalide ou expiré");
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: emailToken.userId },
        data: { passwordHash },
      }),
      this.prisma.emailToken.update({
        where: { id: emailToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await this.audit.log({
      userId: emailToken.userId,
      action: "PASSWORD_RESET",
      ip,
      userAgent,
    });
  }

  // ─── Token generation ──────────────────────────────────

  private async generateTokens(
    userId: string,
    role: string,
  ): Promise<AuthTokens> {
    const payload = { sub: userId, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload),
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET"),
        expiresIn: this.config.get<string>("JWT_REFRESH_EXPIRES_IN", "7d"),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET"),
      });
      return this.generateTokens(payload.sub, payload.role);
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  // ─── Profile ────────────────────────────────────────────

  async updateProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<UserProfile> {
    if (input.displayName) {
      const displayNameTaken = await this.prisma.user.findFirst({
        where: {
          id: { not: userId },
          displayName: {
            equals: input.displayName,
            mode: "insensitive",
          },
        },
        select: { id: true },
      });

      if (displayNameTaken) {
        throw new ConflictException("Display name already taken");
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.homeAerodromeId !== undefined ? { homeAerodromeId: input.homeAerodromeId } : {}),
      },
      include: { homeAerodrome: { select: { id: true, name: true, icaoCode: true } } },
    });
    return this.toProfile(user);
  }

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const valid = await argon2.verify(user.passwordHash, input.currentPassword);
    if (!valid) {
      throw new UnauthorizedException("Mot de passe actuel incorrect");
    }

    const newHash = await argon2.hash(input.newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    await this.audit.log({
      userId,
      action: "PASSWORD_CHANGE",
      ip,
      userAgent,
    });
  }

  async deleteAccount(
    userId: string,
    currentPassword: string,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        photos: { select: { id: true, storedKey: true } },
      },
    });

    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) {
      throw new UnauthorizedException("Mot de passe actuel incorrect");
    }

    // ── Étape 1 : anonymiser les logs existants AVANT toute suppression ──
    // (le userId est encore valide ; on supprime l'email des metadata)
    try {
      await this.prisma.auditLog.updateMany({
        where: {
          userId,
          metadata: { path: ["email"], equals: user.email },
        },
        data: { metadata: { anonymized: true } },
      });
    } catch (err) {
      // Bloquer la suppression si on ne peut pas garantir l'anonymisation
      this.logger.error(`Anonymisation des audit logs échouée pour userId=${userId}`, err);
      throw new InternalServerErrorException(
        "Impossible d'anonymiser les logs d'audit. La suppression du compte a été annulée.",
      );
    }

    // ── Étape 2 : supprimer les fichiers S3 (RGPD Art. 17 — droit à l'effacement) ──
    const failedKeys: string[] = [];
    await Promise.all(
      user.photos.map(async (p: { id: string; storedKey: string }) => {
        try {
          await this.storage.delete(p.storedKey);
        } catch (err) {
          this.logger.error(`Échec suppression S3 key=${p.storedKey} pour userId=${userId}`, err);
          failedKeys.push(p.storedKey);
        }
      }),
    );

    if (failedKeys.length > 0) {
      throw new InternalServerErrorException(
        "Certaines photos n'ont pas pu être supprimées. La suppression du compte a été annulée.",
      );
    }

    // ── Étape 3 : log COMPTE_DELETE (sans email en metadata) ──
    await this.audit.log({
      userId,
      action: "ACCOUNT_DELETE",
      ip,
      userAgent,
    });

    // ── Étape 4 : suppression du compte (cascade DB) ──
    await this.prisma.user.delete({ where: { id: userId } });
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { homeAerodrome: { select: { id: true, name: true, icaoCode: true } } },
    });
    return this.toProfile(user);
  }

  private toProfile(user: {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
    emailVerified: Date | null;
    totpEnabled: boolean;
    createdAt: Date;
    homeAerodrome?: { id: string; name: string; icaoCode: string | null } | null;
  }): UserProfile {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      emailVerified: user.emailVerified?.toISOString() ?? null,
      totpEnabled: user.totpEnabled,
      createdAt: user.createdAt.toISOString(),
      homeAerodrome: user.homeAerodrome ?? null,
    };
  }

  // ─── RGPD : export des données (Article 20) ────────────────
  async exportData(userId: string): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        emailVerified: true,
        totpEnabled: true,
        createdAt: true,
        homeAerodromeId: true,
        visits: {
          select: { aerodromeId: true, visitedAt: true, notes: true, status: true },
          orderBy: { visitedAt: "desc" },
        },
        comments: {
          where: { deletedAt: null },
          select: { id: true, aerodromeId: true, content: true, createdAt: true, parentId: true },
          orderBy: { createdAt: "desc" },
        },
        aircraftProfiles: {
          select: {
            id: true, name: true, tas: true, fuelConsumption: true,
            hourlyCost: true, minRunwayLength: true, createdAt: true,
          },
        },
        corrections: {
          select: { id: true, aerodromeId: true, field: true, currentValue: true, proposedValue: true, reason: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
        photos: {
          where: { status: "READY" },
          select: { id: true, aerodromeId: true, mimeType: true, width: true, height: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
        auditLogs: {
          select: { action: true, ip: true, createdAt: true, metadata: true },
          orderBy: { createdAt: "desc" },
          take: 500,
        },
      },
    });

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        emailVerified: user.emailVerified?.toISOString() ?? null,
        totpEnabled: user.totpEnabled,
        createdAt: user.createdAt.toISOString(),
        homeAerodromeId: user.homeAerodromeId,
      },
      visits: user.visits.map((v: { aerodromeId: string; visitedAt: Date; notes: string | null; status: string }) => ({
        aerodromeId: v.aerodromeId,
        visitedAt: v.visitedAt.toISOString(),
        notes: v.notes,
        status: v.status,
      })),
      comments: user.comments.map((c: { id: string; aerodromeId: string; content: string; createdAt: Date; parentId: string | null }) => ({
        id: c.id,
        aerodromeId: c.aerodromeId,
        parentId: c.parentId,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
      })),
      aircraftProfiles: user.aircraftProfiles.map((a: { id: string; name: string; tas: number; fuelConsumption: number; hourlyCost: number; minRunwayLength: number; createdAt: Date }) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
      corrections: user.corrections.map((c: { id: string; aerodromeId: string; field: string; currentValue: string | null; proposedValue: string; reason: string | null; createdAt: Date }) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
      photos: user.photos.map((p: { id: string; aerodromeId: string; mimeType: string; width: number | null; height: number | null; createdAt: Date }) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
      })),
      activityLog: user.auditLogs.map((l: { action: string; ip: string | null; createdAt: Date; metadata: unknown }) => ({
        action: l.action,
        ip: l.ip,
        createdAt: l.createdAt.toISOString(),
        metadata: l.metadata,
      })),
    };
  }
}
