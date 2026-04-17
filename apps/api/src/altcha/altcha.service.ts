import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type * as AltchaV1 from "altcha-lib/v1";

@Injectable()
export class AltchaService implements OnModuleInit {
  private readonly logger = new Logger(AltchaService.name);
  private readonly hmacKey: string;
  private readonly enabled: boolean;
  private readonly maxNumber: number;
  private altcha!: typeof AltchaV1;

  constructor(private readonly config: ConfigService) {
    this.hmacKey = config.get<string>("ALTCHA_HMAC_KEY", "");
    this.enabled = config.get<string>("ALTCHA_ENABLED", "true") !== "false";
    this.maxNumber = config.get<number>("ALTCHA_MAX_NUMBER", 100_000);

    if (this.enabled && !this.hmacKey) {
      throw new Error("ALTCHA_HMAC_KEY must be set when ALTCHA_ENABLED=true");
    }

    if (!this.enabled) {
      this.logger.warn("ALTCHA is DISABLED — bot protection is off");
    }
  }

  async onModuleInit() {
    // Dynamic import uses the ESM condition in altcha-lib/v1 exports,
    // avoiding the CJS/ESM conflict caused by "type":"module" in altcha-lib v2.
    this.altcha = await import("altcha-lib/v1");
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async createChallenge() {
    return this.altcha.createChallenge({
      hmacKey: this.hmacKey,
      maxNumber: this.maxNumber,
      expires: new Date(Date.now() + 10 * 60 * 1000),
    });
  }

  async verify(payload: string): Promise<boolean> {
    if (!this.enabled) return true;

    try {
      const ok = await this.altcha.verifySolution(payload, this.hmacKey, true);
      if (!ok) {
        this.logger.warn("ALTCHA verification failed — invalid payload");
      }
      return ok;
    } catch (err) {
      this.logger.warn(`ALTCHA verification error: ${String(err)}`);
      return false;
    }
  }
}
