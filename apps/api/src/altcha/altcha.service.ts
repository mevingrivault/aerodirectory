import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createChallenge, verifySolution } from "altcha-lib/v1";
import { ReplayStore } from "../common/replay-store";

/** How long a challenge stays solvable. */
export const ALTCHA_CHALLENGE_TTL_SECONDS = 10 * 60;

@Injectable()
export class AltchaService {
  private readonly logger = new Logger(AltchaService.name);
  private readonly hmacKey: string;
  private readonly enabled: boolean;
  private readonly maxNumber: number;

  constructor(
    private readonly config: ConfigService,
    private readonly replay: ReplayStore,
  ) {
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
      expires: new Date(Date.now() + ALTCHA_CHALLENGE_TTL_SECONDS * 1000),
    });
  }

  /**
   * Verify a solution and consume it. A solution is accepted once: replaying
   * the same solved challenge on another request fails, so every guarded
   * request costs the client a fresh proof of work.
   */
  async verify(payload: string): Promise<boolean> {
    if (!this.enabled) return true;

    try {
      const ok = await verifySolution(payload, this.hmacKey, true);
      if (!ok) {
        this.logger.warn("ALTCHA verification failed — invalid payload");
        return false;
      }

      const signature = extractSignature(payload);
      if (!signature) {
        this.logger.warn("ALTCHA verification failed — no signature in payload");
        return false;
      }

      // Keep the mark a little longer than the challenge itself can live.
      const fresh = await this.replay.claimOnce(
        `altcha:used:${signature}`,
        ALTCHA_CHALLENGE_TTL_SECONDS + 60,
      );
      if (!fresh) {
        this.logger.warn("ALTCHA verification failed — solution replayed");
      }
      return fresh;
    } catch (err) {
      this.logger.warn(`ALTCHA verification error: ${String(err)}`);
      return false;
    }
  }
}

/** The HMAC signature uniquely identifies a challenge (salt carries random bytes + expiry). */
function extractSignature(payload: string): string | null {
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as {
      signature?: unknown;
    };
    return typeof parsed.signature === "string" && parsed.signature.length > 0
      ? parsed.signature
      : null;
  } catch {
    return null;
  }
}
