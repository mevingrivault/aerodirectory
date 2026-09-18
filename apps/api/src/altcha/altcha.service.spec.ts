import { describe, it, expect, vi } from "vitest";
import { createChallenge } from "altcha-lib/v1";
import { AltchaService } from "./altcha.service";
import { ReplayStore } from "../common/replay-store";

/**
 * Captcha replay.
 *
 * A solved challenge used to be valid for every request during its ten-minute
 * lifetime, so one proof of work bought unlimited attempts. Each solution now
 * works exactly once.
 */

const HMAC_KEY = "test-hmac-key-for-altcha";

function buildService(enabled = true) {
  const values: Record<string, string> = {
    ALTCHA_HMAC_KEY: HMAC_KEY,
    ALTCHA_ENABLED: enabled ? "true" : "false",
    ALTCHA_MAX_NUMBER: "50",
  };
  const config = { get: vi.fn((key: string, fallback?: unknown) => values[key] ?? fallback) };
  return new AltchaService(config as never, new ReplayStore(null));
}

/** Solve a challenge the way the widget does: brute force the number, then base64 the payload. */
async function solve(challenge: Awaited<ReturnType<typeof createChallenge>>): Promise<string> {
  const { createHash } = await import("crypto");
  for (let n = 0; n <= (challenge.maxnumber ?? 50); n += 1) {
    const hash = createHash("sha256").update(`${challenge.salt}${n}`).digest("hex");
    if (hash === challenge.challenge) {
      return Buffer.from(
        JSON.stringify({
          algorithm: challenge.algorithm,
          challenge: challenge.challenge,
          number: n,
          salt: challenge.salt,
          signature: challenge.signature,
        }),
      ).toString("base64");
    }
  }
  throw new Error("unsolvable");
}

describe("AltchaService.verify", () => {
  it("accepts a freshly solved challenge once, then refuses the replay", async () => {
    const service = buildService();
    const payload = await solve(await service.createChallenge());

    expect(await service.verify(payload)).toBe(true);
    expect(await service.verify(payload)).toBe(false);
  });

  it("accepts two different solutions independently", async () => {
    const service = buildService();
    const first = await solve(await service.createChallenge());
    const second = await solve(await service.createChallenge());

    expect(await service.verify(first)).toBe(true);
    expect(await service.verify(second)).toBe(true);
  });

  it("refuses a payload signed with another key", async () => {
    const service = buildService();
    const foreign = await createChallenge({ hmacKey: "other-key", maxNumber: 50 });
    const payload = await solve(foreign);

    expect(await service.verify(payload)).toBe(false);
  });

  it("refuses garbage", async () => {
    const service = buildService();

    expect(await service.verify("not-base64-json")).toBe(false);
    expect(await service.verify(Buffer.from("{}").toString("base64"))).toBe(false);
  });

  it("does not consume anything when disabled", async () => {
    const service = buildService(false);

    expect(await service.verify("anything")).toBe(true);
    expect(await service.verify("anything")).toBe(true);
  });
});
