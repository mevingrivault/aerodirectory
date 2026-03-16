import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  UsePipes,
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
  type RegisterInput,
  type LoginInput,
  type TotpVerifyInput,
} from "@aerodirectory/shared";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  @UsePipes(new ZodValidationPipe(RegisterSchema))
  async register(@Body() body: RegisterInput, @Req() req: FastifyRequest) {
    const tokens = await this.auth.register(
      body,
      req.ip,
      req.headers["user-agent"],
    );
    return ok(tokens);
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

  @Public()
  @Post("login/totp")
  async loginTotp(
    @Body(new ZodValidationPipe(TotpVerifySchema)) body: TotpVerifyInput,
    @CurrentUser() user: { sub: string; totpPending: boolean },
    @Req() req: FastifyRequest,
  ) {
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
}
