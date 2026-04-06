"use client";

/**
 * ALTCHA proof-of-work captcha widget.
 *
 * Usage:
 *   const altchaRef = useRef<AltchaHandle>(null);
 *   // In submit handler:
 *   const payload = altchaRef.current?.getPayload();
 *   if (!payload) { setError("Captcha requis"); return; }
 *   // Pass as header: { "x-altcha": payload }
 */

import React, { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

export interface AltchaHandle {
  /** Returns the verified payload string, or null if not yet solved */
  getPayload(): string | null;
  /** Resets the widget (call after submit failure) */
  reset(): void;
}

interface AltchaWidgetProps {
  onStateChange?: (state: string) => void;
  className?: string;
}

type AltchaElement = HTMLElement & { value?: string; reset?: () => void };

const CHALLENGE_URL =
  (process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000/api/v1") +
  "/altcha/challenge";

const FR_STRINGS = JSON.stringify({
  label: "Je ne suis pas un robot",
  verified: "Vérifié",
  verifying: "Vérification en cours…",
  waitAlert: "Veuillez patienter…",
  error: "Vérification échouée. Réessayez.",
});

const AltchaWidget = forwardRef<AltchaHandle, AltchaWidgetProps>(
  ({ onStateChange, className }, ref) => {
    const widgetRef = useRef<AltchaElement>(null);

    useImperativeHandle(ref, () => ({
      getPayload() {
        return widgetRef.current?.value ?? null;
      },
      reset() {
        widgetRef.current?.reset?.();
      },
    }));

    useEffect(() => {
      if (typeof window === "undefined") return;
      if (customElements.get("altcha-widget")) return;

      const script = document.createElement("script");
      script.src = "/altcha.js";
      script.async = true;
      script.type = "module";
      document.head.appendChild(script);
    }, []);

    useEffect(() => {
      const el = widgetRef.current;
      if (!el) return;

      const handler = (e: Event) => {
        const detail = (e as CustomEvent<{ state: string }>).detail;
        onStateChange?.(detail?.state ?? "");
      };
      el.addEventListener("statechange", handler);
      return () => el.removeEventListener("statechange", handler);
    }, [onStateChange]);

    // Use createElement to avoid JSX type issues with custom elements
    return React.createElement("altcha-widget", {
      ref: widgetRef,
      challengeurl: CHALLENGE_URL,
      hidelogo: "",
      hidefooter: "",
      strings: FR_STRINGS,
      class: className,
    });
  },
);

AltchaWidget.displayName = "AltchaWidget";

export { AltchaWidget };
