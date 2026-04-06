import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Query,
  Req,
  Res,
  UsePipes,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { FastifyRequest, FastifyReply } from "fastify";
import { AuthService } from "./auth.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ok } from "../common/api-response";
import { Public, CurrentUser } from "../common/decorators";
import { AltchaGuard } from "../altcha/altcha.guard";
import {
  RegisterSchema,
  LoginSchema,
  TotpVerifySchema,
  UpdateProfileSchema,
  ChangePasswordSchema,
  DeleteAccountSchema,
  ForgotPasswordSchema,
  ResendVerificationSchema,
  CheckEmailSchema,
  ResetPasswordSchema,
  type RegisterInput,
  type LoginInput,
  type TotpVerifyInput,
  type UpdateProfileInput,
  type ChangePasswordInput,
  type DeleteAccountInput,
  type ForgotPasswordInput,
  type ResendVerificationInput,
  type CheckEmailInput,
  type ResetPasswordInput,
} from "@aerodirectory/shared";

const COOKIE_BASE_OPTS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "strict" as const,
  path: "/",
};

const COOKIE_OPTS = (persistent: boolean, maxAgeSeconds: number) =>
  persistent ? { ...COOKIE_BASE_OPTS, maxAge: maxAgeSeconds } : COOKIE_BASE_OPTS;

const ACCESS_TTL = 15 * 60;        // 15 minutes
const REFRESH_TTL = 7 * 24 * 3600; // 7 jours
const REMEMBER_COOKIE = "remember_session";

function setAuthCookies(
  res: FastifyReply,
  tokens: { accessToken: string; refreshToken: string },
  rememberMe: boolean,
) {
  void res.setCookie("access_token", tokens.accessToken, COOKIE_OPTS(rememberMe, ACCESS_TTL));
  void res.setCookie("refresh_token", tokens.refreshToken, COOKIE_OPTS(rememberMe, REFRESH_TTL));

  if (rememberMe) {
    void res.setCookie(REMEMBER_COOKIE, "1", COOKIE_OPTS(true, REFRESH_TTL));
  } else {
    void res.setCookie(REMEMBER_COOKIE, "", { ...COOKIE_BASE_OPTS, maxAge: 0 });
  }
}

function clearAuthCookies(res: FastifyReply) {
  void res.setCookie("access_token", "", { ...COOKIE_BASE_OPTS, maxAge: 0 });
  void res.setCookie("refresh_token", "", { ...COOKIE_BASE_OPTS, maxAge: 0 });
  void res.setCookie(REMEMBER_COOKIE, "", { ...COOKIE_BASE_OPTS, maxAge: 0 });
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(AltchaGuard)
  @Throttle({ short: { limit: 3, ttl: 60000 }, medium: { limit: 10, ttl: 3600000 } })
  @Post("register")
  @UsePipes(new ZodValidationPipe(RegisterSchema))
  async register(@Body() body: RegisterInput, @Req() req: FastifyRequest) {
    await this.auth.register(
      body,
      req.ip,
      req.headers["user-agent"],
    );
    return ok({
      message: "Compte créé. Vérifiez votre adresse e-mail pour activer votre compte.",
    });
  }

  @Public()
  @Post("check-email")
  @HttpCode(HttpStatus.OK)
  async checkEmail(
    @Body(new ZodValidationPipe(CheckEmailSchema)) body: CheckEmailInput,
  ) {
    const result = await this.auth.checkEmailAvailability(body);
    return ok(result);
  }

  @Public()
  @UseGuards(AltchaGuard)
  @Throttle({ short: { limit: 5, ttl: 60000 }, medium: { limit: 20, ttl: 3600000 } })
  @Post("login")
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(
    @Body() body: LoginInput,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const result = await this.auth.login(body, req.ip, req.headers["user-agent"]);
    if (!result.requireTotp) {
      setAuthCookies(res, result, body.rememberMe ?? false);
    }
    return ok({ requireTotp: result.requireTotp });
  }

  @Post("login/totp")
  async loginTotp(
    @Body(new ZodValidationPipe(TotpVerifySchema)) body: TotpVerifyInput,
    @CurrentUser() user: { sub: string; totpPending: boolean },
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    if (!user.totpPending) {
      throw new UnauthorizedException("2FA step not initiated");
    }
    const tokens = await this.auth.verifyTotpLogin(
      user.sub,
      body.code,
      req.ip,
      req.headers["user-agent"],
    );
    setAuthCookies(res, tokens, body.rememberMe ?? false);
    return ok({ success: true });
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const refreshToken = req.cookies?.["refresh_token"] ?? (req.body as { refreshToken?: string })?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException("No refresh token");
    const tokens = await this.auth.refreshTokens(refreshToken);
    setAuthCookies(res, tokens, req.cookies?.[REMEMBER_COOKIE] === "1");
    return ok({ refreshed: true });
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: FastifyReply) {
    clearAuthCookies(res);
    return ok({ loggedOut: true });
  }

  @Public()
  @Get("verify-email")
  async verifyEmail(@Query("token") token: string) {
    await this.auth.verifyEmail(token);
    return ok({ verified: true });
  }

  @Post("totp/setup")
  async setupTotp(@CurrentUser() user: { sub: string }) {
    const setup = await this.auth.setupTotp(user.sub);
    return ok(setup);
  }

  @Post("totp/verify")
  async verifyTotp(
    @Body(new ZodValidationPipe(TotpVerifySchema)) body: TotpVerifyInput,
    @CurrentUser() user: { sub: string },
    @Req() req: FastifyRequest,
  ) {
    await this.auth.verifyAndEnableTotp(
      user.sub,
      body.code,
      req.ip,
      req.headers["user-agent"],
    );
    return ok({ enabled: true });
  }

  @Get("profile")
  async profile(@CurrentUser() user: { sub: string }) {
    const profile = await this.auth.getProfile(user.sub);
    return ok(profile);
  }

  @Put("profile")
  async updateProfile(
    @Body(new ZodValidationPipe(UpdateProfileSchema)) body: UpdateProfileInput,
    @CurrentUser() user: { sub: string },
  ) {
    const profile = await this.auth.updateProfile(user.sub, body);
    return ok(profile);
  }

  @Public()
  @Throttle({ short: { limit: 3, ttl: 300000 } })
  @Post("resend-verification")
  @HttpCode(HttpStatus.OK)
  async resendVerification(
    @Body(new ZodValidationPipe(ResendVerificationSchema))
    body: ResendVerificationInput,
    @Req() req: FastifyRequest,
  ) {
    await this.auth.resendVerificationEmail(
      body,
      req.ip,
      req.headers["user-agent"],
    );
    return ok({
      message:
        "Si cet e-mail correspond à un compte non vérifié, un nouveau lien de vérification a été envoyé.",
    });
  }

  @Public()
  @UseGuards(AltchaGuard)
  @Throttle({ short: { limit: 3, ttl: 300000 }, medium: { limit: 5, ttl: 3600000 } })
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() req: FastifyRequest,
  ) {
    await this.auth.requestPasswordReset(body, req.ip, req.headers["user-agent"]);
    // Réponse générique — ne pas révéler si l'email existe
    return ok({ message: "Si cet e-mail est associé à un compte, un lien de réinitialisation a été envoyé." });
  }

  @Public()
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPasswordInput,
    @Req() req: FastifyRequest,
  ) {
    await this.auth.resetPassword(body, req.ip, req.headers["user-agent"]);
    return ok({ message: "Mot de passe réinitialisé avec succès." });
  }

  @Post("change-password")
  async changePassword(
    @Body(new ZodValidationPipe(ChangePasswordSchema)) body: ChangePasswordInput,
    @CurrentUser() user: { sub: string },
    @Req() req: FastifyRequest,
  ) {
    await this.auth.changePassword(user.sub, body, req.ip, req.headers["user-agent"]);
    return ok({ changed: true });
  }

  @Get("data-export")
  async dataExport(@CurrentUser() user: { sub: string }) {
    const data = await this.auth.exportData(user.sub);
    return ok(data);
  }

  @Post("delete-account")
  async deleteAccount(
    @Body(new ZodValidationPipe(DeleteAccountSchema)) body: DeleteAccountInput,
    @CurrentUser() user: { sub: string },
    @Req() req: FastifyRequest,
  ) {
    await this.auth.deleteAccount(user.sub, body.currentPassword, req.ip, req.headers["user-agent"]);
    return ok({ deleted: true });
  }
}
