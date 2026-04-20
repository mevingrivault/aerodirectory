"use client";

import Link from "next/link";
import { useState } from "react";

interface CapCardProps {
  num: string;
  href: string;
  label: string;
  desc: string;
  link: string;
  icoStyle: React.CSSProperties;
  icon: React.ReactNode;
}

export function CapCard({ num, href, label, desc, link, icoStyle, icon }: CapCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={href}
      style={{
        background: hovered ? "var(--paper-50)" : "white",
        padding: "32px 28px 36px",
        display: "flex", flexDirection: "column", gap: 20,
        textDecoration: "none", minHeight: 280,
        transition: "background .2s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 500, color: "var(--ink-400)", letterSpacing: "0.1em" }}>{num}</div>
      <div style={{ width: 40, height: 40, borderRadius: 8, display: "grid", placeItems: "center", ...icoStyle }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 18, color: "var(--ink-950)" }}>{label}</div>
        <p style={{ fontSize: 14, color: "var(--ink-700)", lineHeight: 1.55, margin: "8px 0 0" }}>{desc}</p>
      </div>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 13, fontWeight: 500, color: "var(--horizon-700)",
        marginTop: "auto",
      }}>
        {link}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </span>
    </Link>
  );
}
