"use client";

import { useCallback } from "react";

/**
 * Resolves an ALTCHA challenge automatically in a Web Worker — invisible to the user.
 * Use this for actions where showing the widget would break the UX (e.g. comment form).
 *
 * Usage:
 *   const solveAltcha = useAltchaAuto();
 *   // In submit handler:
 *   const payload = await solveAltcha();
 *   if (!payload) throw new Error("Captcha failed");
 *   await apiClient.post("/...", body, { "x-altcha": payload });
 */

const CHALLENGE_URL =
  (process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000/api/v1") +
  "/altcha/challenge";
const CHALLENGE_TIMEOUT_MS = 8_000;
const SOLVE_TIMEOUT_MS = 8_000;

interface AltchaChallenge {
  algorithm: string;
  challenge: string;
  salt: string;
  signature: string;
  maxnumber?: number;
}

interface WorkerResult {
  number: number;
  took: number;
}

const WORKER_SOURCE = `
const encoder = new TextEncoder();

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

self.onmessage = async (event) => {
  const data = event.data || {};
  if (data.type !== "work") return;

  const payload = data.payload || {};
  const challenge = String(payload.challenge || "");
  const salt = String(payload.salt || "");
  const algorithm = String(payload.algorithm || "SHA-256").toUpperCase();
  const start = Number(data.start || 0);
  const max = Number(data.max || 100000);

  try {
    for (let i = start; i <= max; i += 1) {
      const digest = await crypto.subtle.digest(
        algorithm,
        encoder.encode(\`\${salt}\${i}\`),
      );
      if (toHex(digest) === challenge) {
        self.postMessage({ number: i });
        return;
      }
    }

    self.postMessage(null);
  } catch {
    self.postMessage(null);
  }
};
`;

function buildPayload(challenge: AltchaChallenge, number: number): string {
  const payload = {
    algorithm: challenge.algorithm,
    challenge: challenge.challenge,
    number,
    salt: challenge.salt,
    signature: challenge.signature,
  };
  return btoa(JSON.stringify(payload));
}

function createInlineWorker(): Worker | null {
  if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") {
    return null;
  }

  try {
    const blob = new Blob([WORKER_SOURCE], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    return worker;
  } catch {
    return null;
  }
}

export function useAltchaAuto() {
  return useCallback(async function solveAltcha(): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CHALLENGE_TIMEOUT_MS);
      const res = await fetch(CHALLENGE_URL, { signal: controller.signal }).finally(() => {
        clearTimeout(timeout);
      });
      if (!res.ok) return null;
      const challenge: AltchaChallenge = await res.json();

      return await new Promise<string | null>((resolve) => {
        const worker = createInlineWorker();
        if (!worker) {
          resolve(null);
          return;
        }

        const solveTimeout = setTimeout(() => {
          worker.terminate();
          resolve(null);
        }, SOLVE_TIMEOUT_MS);

        worker.onmessage = (e: MessageEvent<WorkerResult | null>) => {
          clearTimeout(solveTimeout);
          worker.terminate();
          if (e.data && e.data.number !== undefined) {
            resolve(buildPayload(challenge, e.data.number));
          } else {
            resolve(null);
          }
        };

        worker.onerror = () => {
          clearTimeout(solveTimeout);
          worker.terminate();
          resolve(null);
        };

        worker.postMessage({
          type: "work",
          payload: {
            algorithm: challenge.algorithm,
            challenge: challenge.challenge,
            salt: challenge.salt,
          },
          start: 0,
          max: challenge.maxnumber ?? 100_000,
        });
      });
    } catch {
      return null;
    }
  }, []);
}
