import Link from "next/link";
import { DISCLAIMER } from "@aerodirectory/shared";

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--ink-200)", background: "var(--paper-50)" }}>
      <div style={{
        maxWidth: 1280, margin: "0 auto",
        padding: "16px 48px",
        background: "oklch(0.97 0.04 85)",
        borderTop: "1px solid oklch(0.90 0.05 85)",
        fontSize: 12, color: "var(--ink-700)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--ink-500)", flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
        <span>{DISCLAIMER}</span>
      </div>
      <div style={{
        maxWidth: 1280, margin: "0 auto",
        padding: "32px 48px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 16,
        fontSize: 13, color: "var(--ink-500)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 5,
            background: "var(--ink-950)", color: "white",
            display: "grid", placeItems: "center",
            fontFamily: "var(--f-mono)", fontWeight: 600, fontSize: 12,
            position: "relative", flexShrink: 0,
          }}>N</div>
          <span>Navventura · Deviens un aéroventurier</span>
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <Link href="/politique-de-confidentialite" style={{ color: "var(--ink-500)" }}>Politique de confidentialité</Link>
          <Link href="/cgu" style={{ color: "var(--ink-500)" }}>CGU</Link>
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--ink-500)", fontFamily: "var(--f-mono)", fontSize: 12 }}
          >CC BY-SA 4.0</a>
        </div>
      </div>
    </footer>
  );
}
