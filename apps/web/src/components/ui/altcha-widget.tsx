"use client";

import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from "react";
import { LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useAltchaAuto } from "@/lib/use-altcha-auto";

export interface AltchaHandle {
  getPayload(): string | null;
  reset(): void;
}

interface AltchaWidgetProps {
  onStateChange?: (state: string, payload?: string) => void;
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
    const solveAltcha = useAltchaAuto();
    const widgetRef = useRef<AltchaElement>(null);
    const [payload, setPayload] = useState<string | null>(null);
    const [mode, setMode] = useState<"checking" | "verified" | "fallback">("checking");
    const [attempt, setAttempt] = useState(0);
    const onStateChangeRef = useRef(onStateChange);
    useEffect(() => { onStateChangeRef.current = onStateChange; });
    const stableOnStateChange = useCallback((state: string, p?: string) => {
      onStateChangeRef.current?.(state, p);
    }, []);

    useImperativeHandle(ref, () => ({
      getPayload() {
        if (payload) return payload;
        const v = widgetRef.current?.value;
        return v && v.length > 0 ? v : null;
      },
      reset() {
        setPayload(null);
        widgetRef.current?.reset?.();
        setMode("checking");
        setAttempt((value) => value + 1);
      },
    }), [payload]);

    useEffect(() => {
      let cancelled = false;

      setPayload(null);
      setMode("checking");
      stableOnStateChange("verifying");

      void solveAltcha().then((nextPayload) => {
        if (cancelled) return;

        if (nextPayload) {
          setPayload(nextPayload);
          setMode("verified");
          stableOnStateChange("verified", nextPayload);
          return;
        }

        setMode("fallback");
        stableOnStateChange("fallback");
      });

      return () => {
        cancelled = true;
      };
    }, [attempt, stableOnStateChange, solveAltcha]);

    useEffect(() => {
      if (mode !== "fallback" || typeof window === "undefined") return;
      if (customElements.get("altcha-widget")) return;

      const script = document.createElement("script");
      script.src = "/altcha.js";
      script.async = true;
      script.type = "module";
      document.head.appendChild(script);

      return () => {
        script.remove();
      };
    }, [mode]);

    useEffect(() => {
      if (mode !== "fallback") return;

      const el = widgetRef.current;
      if (!el) return;

      const handler = (e: Event) => {
        const detail = (e as CustomEvent<{ state: string; payload?: string }>).detail;
        const state = detail?.state ?? "";
        const nextPayload = detail?.payload ?? null;

        setPayload(nextPayload);
        if (state === "verified" && nextPayload) {
          setMode("verified");
        }
        stableOnStateChange(state, detail?.payload);
      };

      el.addEventListener("statechange", handler);
      return () => el.removeEventListener("statechange", handler);
    }, [mode, stableOnStateChange]);

    return (
      <div className={`mt-4 space-y-2${className ? ` ${className}` : ""}`}>
        {mode === "checking" && (
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
              <span>Vérification anti-robot en cours…</span>
            </div>
          </div>
        )}

        {mode === "verified" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                  <ShieldCheck className="h-4 w-4" />
                  Vérification anti-robot validée
                </div>
                <p className="mt-1 text-xs text-emerald-700/90">
                  Protection appliquée automatiquement. Vous pouvez continuer.
                </p>
              </div>
            </div>
          </div>
        )}

        {mode === "fallback" && (
          <>
            <div className="overflow-hidden rounded-xl border border-input bg-background">
              <div className="border-b border-border/60 bg-muted/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Une vérification manuelle est nécessaire pour continuer.
                </p>
              </div>
              {React.createElement("altcha-widget", {
                ref: widgetRef,
                challengeurl: CHALLENGE_URL,
                hidelogo: "",
                hidefooter: "",
                strings: FR_STRINGS,
                style: { width: "100%", display: "block" },
              })}
            </div>

            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Réessayer la vérification automatique
            </button>
          </>
        )}
      </div>
    );
  },
);

AltchaWidget.displayName = "AltchaWidget";

export { AltchaWidget };
