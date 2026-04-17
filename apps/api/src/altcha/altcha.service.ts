import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createChallenge, verifySolution } from "altcha-lib/v1";

@Injectable()
export class AltchaService {
  private readonly logger = new Logger(AltchaService.name);
  private readonly hmacKey: string;
  private readonly enabled: boolean;
  private readonly maxNumber: number;

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

  isEnabled(): boolean {
    return this.enabled;
  }

  async createChallenge() {
    return createChallenge({
      hmacKey: this.hmacKey,
      maxNumber: this.maxNumber,
      expires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });
  }

  async verify(payload: string): Promise<boolean> {
    if (!this.enabled) return true;

    try {
      const ok = await verifySolution(payload, this.hmacKey, true);
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
