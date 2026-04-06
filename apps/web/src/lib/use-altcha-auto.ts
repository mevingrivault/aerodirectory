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

export function useAltchaAuto() {
  return useCallback(async function solveAltcha(): Promise<string | null> {
    try {
      const res = await fetch(CHALLENGE_URL);
      if (!res.ok) return null;
      const challenge: AltchaChallenge = await res.json();

      return await new Promise<string | null>((resolve) => {
        const worker = new Worker("/altcha-worker.js");

        const timeout = setTimeout(() => {
          worker.terminate();
          resolve(null);
        }, 30_000);

        worker.onmessage = (e: MessageEvent<WorkerResult | null>) => {
          clearTimeout(timeout);
          worker.terminate();
          if (e.data && e.data.number !== undefined) {
            resolve(buildPayload(challenge, e.data.number));
          } else {
            resolve(null);
          }
        };

        worker.onerror = () => {
          clearTimeout(timeout);
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
