import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Query,
  Req,
  UsePipes,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthService } from "./auth.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ok } from "../common/api-response";
import { Public, CurrentUser } from "../common/decorators";
import {
  RegisterSchema,
  LoginSchema,
  TotpVerifySchema,
  UpdateProfileSchema,
  ChangePasswordSchema,
  DeleteAccountSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  type RegisterInput,
  type LoginInput,
  type TotpVerifyInput,
  type UpdateProfileInput,
  type ChangePasswordInput,
  type DeleteAccountInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "@aerodirectory/shared";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
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
  @Post("login")
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(@Body() body: LoginInput, @Req() req: FastifyRequest) {
    const result = await this.auth.login(
      body,
      req.ip,
      req.headers["user-agent"],
    );
    return ok(result);
  }

  @Post("login/totp")
  async loginTotp(
    @Body(new ZodValidationPipe(TotpVerifySchema)) body: TotpVerifyInput,
    @CurrentUser() user: { sub: string; totpPending: boolean },
    @Req() req: FastifyRequest,
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
    return ok(tokens);
  }

  @Public()
  @Post("refresh")
  async refresh(@Body() body: { refreshToken: string }) {
    const tokens = await this.auth.refreshTokens(body.refreshToken);
    return ok(tokens);
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
