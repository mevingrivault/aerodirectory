import Link from "next/link";
import { CapCard } from "@/components/ui/cap-card";

const API_BASE =
  process.env["NEXT_PUBLIC_API_URL"] || "http://localhost:4000/api/v1";

interface FeaturedAerodrome {
  id: string;
  name: string;
  icaoCode: string | null;
  elevation: number | null;
  department: string | null;
  hasRestaurant: boolean;
  hasAccommodation: boolean;
  hasTransport: boolean;
  hasBikes: boolean;
  runways: { length: number | null }[];
  fuels: { type: string }[];
}

async function fetchStats(): Promise<{ total: number; ulmAndSeaplane: number }> {
  try {
    const res = await fetch(`${API_BASE}/aerodromes/stats`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error();
    const json = await res.json();
    return json.data;
  } catch {
    return { total: 750, ulmAndSeaplane: 580 };
  }
}

async function fetchFeatured(): Promise<FeaturedAerodrome[]> {
  try {
    const res = await fetch(`${API_BASE}/aerodromes/featured`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error();
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

function fuelLabel(type: string) {
  const map: Record<string, string> = {
    AVGAS_100LL: "100LL",
    UL91: "UL91",
    JET_A1: "Jet A1",
    SP98: "SP98",
  };
  return map[type] ?? type;
}

export default async function HomePage() {
  const [stats, featured] = await Promise.all([fetchStats(), fetchFeatured()]);

  return (
    <div style={{ fontFamily: "var(--f-sans)", color: "var(--ink-950)", background: "var(--paper-50)" }}>
      <style>{`
        @keyframes nv-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        .nv-main { max-width: 1280px; margin: 0 auto; padding: 0 48px; }
        .nv-hero { display: grid; grid-template-columns: 1.05fr 1fr; gap: 80px; padding: 96px 0 88px; position: relative; align-items: center; }
        .nv-hero-title { font-family: var(--f-serif); font-weight: 500; font-size: 76px; line-height: 0.98; letter-spacing: -0.025em; margin: 24px 0 0; color: var(--ink-950); }
        .nv-hero-lead { font-size: 18px; line-height: 1.55; color: var(--ink-700); max-width: 520px; margin: 28px 0 36px; }
        .nv-hero-ctas { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 48px; }
        .nv-hero-meta { display: grid; grid-template-columns: repeat(3, auto); gap: 40px; padding-top: 28px; border-top: 1px solid var(--ink-200); max-width: 520px; }
        .nv-hero-visual { position: relative; aspect-ratio: 5/6; border-radius: 20px; background: var(--paper-100); border: 1px solid var(--ink-200); overflow: hidden; box-shadow: var(--shadow-pop); }
        .nv-caps-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; background: var(--ink-200); border: 1px solid var(--ink-200); border-radius: 12px; overflow: hidden; }
        .nv-escapade { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 80px; align-items: center; }
        .nv-dex-inner { display: grid; grid-template-columns: 1fr 1.15fr; gap: 64px; align-items: end; }
        .nv-community { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        .nv-section-kicker { display: flex; align-items: center; gap: 14px; font-family: var(--f-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-500); margin-bottom: 16px; }
        .nv-btn-primary { display: inline-flex; align-items: center; gap: 8px; height: 48px; padding: 0 22px; border-radius: 8px; font-size: 15px; font-weight: 500; background: var(--horizon-700); color: white; border: 1px solid transparent; text-decoration: none; white-space: nowrap; }
        .nv-btn-secondary { display: inline-flex; align-items: center; gap: 8px; height: 48px; padding: 0 22px; border-radius: 8px; font-size: 15px; font-weight: 500; background: white; color: var(--ink-950); border: 1px solid var(--ink-300); text-decoration: none; white-space: nowrap; }
        .nv-btn-dark { display: inline-flex; align-items: center; gap: 8px; height: 48px; padding: 0 22px; border-radius: 8px; font-size: 15px; font-weight: 500; background: var(--ink-950); color: white; border: 1px solid transparent; text-decoration: none; white-space: nowrap; }

        @media (max-width: 1080px) {
          .nv-main { padding: 0 32px; }
          .nv-hero { gap: 48px; padding: 64px 0 72px; }
          .nv-hero-title { font-size: 64px; }
          .nv-escapade { gap: 48px; }
          .nv-dex-inner { gap: 40px; }
        }
        @media (max-width: 860px) {
          .nv-main { padding: 0 24px; }
          .nv-hero { grid-template-columns: 1fr; gap: 40px; padding: 40px 0 56px; }
          .nv-hero-title { font-size: 56px; }
          .nv-hero-lead { font-size: 16px; max-width: none; margin: 24px 0 28px; }
          .nv-hero-meta { max-width: none; gap: 24px; padding-top: 24px; }
          .nv-hero-visual { aspect-ratio: 4/5; max-width: 520px; margin: 0 auto; width: 100%; }
          .nv-caps-grid { grid-template-columns: repeat(2, 1fr); }
          .nv-escapade { grid-template-columns: 1fr; gap: 48px; }
          .nv-dex-inner { grid-template-columns: 1fr; gap: 32px; }
          .nv-community { grid-template-columns: 1fr; gap: 20px; }
        }
        @media (max-width: 640px) {
          .nv-main { padding: 0 20px; }
          .nv-hero { padding: 32px 0 40px; gap: 32px; }
          .nv-hero-title { font-size: 44px; letter-spacing: -0.02em; }
          .nv-hero-ctas { flex-direction: column; align-items: stretch; }
          .nv-hero-ctas a { justify-content: center; }
          .nv-hero-meta { grid-template-columns: 1fr 1fr; gap: 20px 16px; }
          .nv-caps-grid { grid-template-columns: 1fr; }
          .nv-escapade-visual { padding: 18px !important; }
        }
      `}</style>

      <main className="nv-main">

        {/* =============== HERO =============== */}
        <section className="nv-hero">
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse 70% 50% at 85% 30%, var(--horizon-50), transparent 70%), radial-gradient(ellipse 60% 40% at 10% 80%, var(--terrain-100), transparent 70%)",
            zIndex: 0, pointerEvents: "none",
          }} />

          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "6px 12px 6px 10px",
              background: "white", border: "1px solid var(--ink-200)", borderRadius: 999,
              fontSize: 12, fontWeight: 500, color: "var(--ink-700)",
              boxShadow: "var(--shadow-lift)",
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "var(--vfr-500)", boxShadow: "0 0 0 3px var(--vfr-100)",
                display: "inline-block", animation: "nv-pulse 2.4s ease-in-out infinite",
              }} />
              <span>Conditions VFR sur <span style={{ fontFamily: "var(--f-mono)", fontWeight: 600, fontSize: 11, color: "var(--ink-950)" }}>LFFV</span> · Vent <span style={{ fontFamily: "var(--f-mono)", fontWeight: 600, fontSize: 11, color: "var(--ink-950)" }}>30° 13kt</span> · QNH <span style={{ fontFamily: "var(--f-mono)", fontWeight: 600, fontSize: 11, color: "var(--ink-950)" }}>1022</span></span>
            </div>

            <h1 className="nv-hero-title">
              Deviens<br />un <em style={{ fontStyle: "italic", fontWeight: 400, color: "var(--horizon-700)" }}>aéroventurier.</em>
            </h1>

            <p className="nv-hero-lead">
              Le compagnon des pilotes VFR français pour trouver les commodités près des terrains, partager leurs retours d&apos;expérience et préparer leur prochaine escapade du dimanche.
            </p>

            <div className="nv-hero-ctas">
              <Link href="/search" className="nv-btn-primary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                Explorer les aérodromes
              </Link>
              <Link href="/map" className="nv-btn-secondary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6 9 4l6 2 5-2v14l-5 2-6-2-5 2V6Z"/><path d="M9 4v16"/><path d="M15 6v16"/></svg>
                Ouvrir la carte
              </Link>
            </div>

            <div className="nv-hero-meta">
              {[
                { val: stats.total.toLocaleString("fr-FR"), unit: "+", label: "aérodromes référencés" },
                { val: stats.ulmAndSeaplane.toLocaleString("fr-FR"), unit: "+", label: "bases ULM & hydrosurfaces" },
                { val: "100", unit: "%", label: "couverture France métro" },
              ].map((s) => (
                <div key={s.label}>
                  <div style={{ fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: 32, lineHeight: 1, letterSpacing: "-0.02em" }}>
                    {s.val}<span style={{ fontFamily: "var(--f-sans)", fontSize: 14, fontWeight: 500, color: "var(--ink-500)", marginLeft: 4 }}>{s.unit}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 6 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero visual */}
          <div className="nv-hero-visual" aria-hidden="true" style={{ zIndex: 1 }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, oklch(0.97 0.01 95) 0%, oklch(0.94 0.015 95) 100%)" }} />
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 500 600" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="oklch(0.88 0.01 85)" strokeWidth="0.5"/>
                </pattern>
                <pattern id="grid-strong" width="200" height="200" patternUnits="userSpaceOnUse">
                  <path d="M 200 0 L 0 0 0 200" fill="none" stroke="oklch(0.82 0.012 85)" strokeWidth="0.75"/>
                </pattern>
              </defs>
              <rect width="500" height="600" fill="url(#grid)"/>
              <rect width="500" height="600" fill="url(#grid-strong)"/>
              <circle cx="260" cy="290" r="140" fill="none" stroke="oklch(0.45 0.15 280)" strokeWidth="1.2" strokeDasharray="4 4" opacity="0.55"/>
              <text x="150" y="165" fontFamily="JetBrains Mono" fontSize="9" fill="oklch(0.45 0.15 280)" opacity="0.75" letterSpacing="1">CTR LFFV · SFC-2500</text>
              <path d="M 60 460 Q 180 380 260 290 T 440 120" fill="none" stroke="oklch(0.42 0.12 250)" strokeWidth="1.8" strokeDasharray="6 4"/>
              <circle cx="60" cy="460" r="4" fill="oklch(0.42 0.12 250)"/>
              <circle cx="440" cy="120" r="4" fill="oklch(0.42 0.12 250)"/>
              <g transform="translate(260 290) rotate(-30)">
                <rect x="-70" y="-8" width="140" height="16" fill="oklch(0.35 0.01 250)" rx="2"/>
                <rect x="-70" y="-2" width="140" height="4" fill="white" opacity="0.55"/>
                <rect x="-70" y="-8" width="10" height="16" fill="white" opacity="0.7"/>
                <rect x="60" y="-8" width="10" height="16" fill="white" opacity="0.7"/>
              </g>
              <path d="M 340 380 Q 400 360 430 400 Q 460 440 430 470 Q 400 500 360 480 Q 320 470 340 380 Z" fill="oklch(0.80 0.05 130)" opacity="0.5"/>
              <path d="M 0 540 Q 120 500 240 540 T 500 520" fill="none" stroke="oklch(0.75 0.06 220)" strokeWidth="5" opacity="0.55"/>
              <g fill="oklch(0.55 0.08 40)" opacity="0.7">
                <rect x="110" y="200" width="5" height="5"/>
                <rect x="118" y="198" width="5" height="6"/>
                <rect x="126" y="202" width="4" height="5"/>
              </g>
              <text x="108" y="225" fontFamily="Inter" fontSize="9" fontWeight="600" fill="oklch(0.35 0.05 40)">VIERZON</text>
              <g fill="oklch(0.55 0.08 40)" opacity="0.7">
                <rect x="380" y="440" width="5" height="5"/>
                <rect x="388" y="438" width="4" height="6"/>
              </g>
              <text x="374" y="465" fontFamily="Inter" fontSize="9" fontWeight="600" fill="oklch(0.35 0.05 40)">MÉREAU</text>
            </svg>

            <div style={{ position: "absolute", top: 16, left: 16, right: 16, display: "flex", justifyContent: "space-between", fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--ink-500)", letterSpacing: "0.1em", pointerEvents: "none" }}>
              <span>N 47°13′ · E 002°04′</span>
              <span>50 NM</span>
            </div>

            {/* Pins */}
            {[
              { top: "48%", left: "52%", size: 28, border: "2px", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5c.6-.6.8-1.4.6-2.1-.3-.8-1-1.3-1.8-1.5-.8-.1-1.6.1-2.1.6L12.7 8 4 6.4 2.4 8 9 12l-3 3H2l2 3 3 2 3-4v-4l4 6.6 1.8-1.4Z"/></svg> },
              { top: "76%", left: "12%", size: 18, border: "1.5px", icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg> },
              { top: "20%", left: "88%", size: 18, border: "1.5px", icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg> },
            ].map((p, i) => (
              <div key={i} style={{
                position: "absolute", top: p.top, left: p.left,
                width: p.size, height: p.size, borderRadius: "50%",
                background: "white", border: `${p.border} solid var(--horizon-700)`,
                display: "grid", placeItems: "center",
                color: "var(--horizon-700)", boxShadow: "var(--shadow-pop)",
                transform: "translate(-50%,-50%)",
              }}>{p.icon}</div>
            ))}

            <div style={{
              position: "absolute", top: "34%", left: "58%",
              padding: "6px 10px", background: "white",
              border: "1px solid var(--ink-200)", borderRadius: 6,
              fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 500,
              color: "var(--ink-950)", letterSpacing: "0.04em",
              boxShadow: "var(--shadow-lift)",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--vfr-500)", display: "inline-block" }} />
              LFFV · VIERZON MÉREAU
            </div>

            <div style={{
              position: "absolute", left: 20, right: 20, bottom: 20,
              padding: "18px 20px", background: "rgba(255,255,255,.94)", backdropFilter: "blur(10px)",
              border: "1px solid var(--ink-200)", borderRadius: 12,
              display: "flex", flexDirection: "column", gap: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: "var(--ink-950)" }}>Vierzon Méreau</span>
                  <span style={{ fontFamily: "var(--f-mono)", fontWeight: 500, fontSize: 11, background: "var(--paper-100)", color: "var(--ink-950)", border: "1px solid var(--ink-300)", borderRadius: 4, padding: "2px 8px", letterSpacing: "0.08em" }}>LFFV</span>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", background: "var(--vfr-100)", color: "var(--vfr-700)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--vfr-500)", display: "inline-block" }} />VFR
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)" }}>
                {[
                  { label: "Distance", val: "48.2", unit: "NM" },
                  { label: "Durée", val: "27", unit: "min" },
                  { label: "Budget", val: "46,50", unit: "€" },
                  { label: "Piste", val: "1150", unit: "m" },
                ].map((s, i) => (
                  <div key={s.label} style={{ padding: "0 14px", borderRight: i < 3 ? "1px solid var(--ink-200)" : "none", ...(i === 0 ? { paddingLeft: 0 } : {}), ...(i === 3 ? { paddingRight: 0 } : {}), display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--ink-500)" }}>{s.label}</span>
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 13, fontWeight: 500, color: "var(--ink-950)" }}>
                      {s.val}<span style={{ fontSize: 10, color: "var(--ink-500)", marginLeft: 2 }}>{s.unit}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* =============== CAPACITÉS =============== */}
        <section style={{ padding: "40px 0 96px" }}>
          <div style={{ marginBottom: 56 }}>
            <div className="nv-section-kicker">
              <span style={{ width: 32, height: 1, background: "var(--ink-400)", display: "inline-block" }} />
              Ce que vous faites ici
            </div>
            <h2 style={{ fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: 48, lineHeight: 1.05, letterSpacing: "-0.02em", margin: "0 0 20px", maxWidth: 720 }}>
              Quatre instruments<br/>pour une escapade réussie.
            </h2>
            <p style={{ fontSize: 17, color: "var(--ink-700)", maxWidth: 620, margin: 0 }}>
              De la recherche rapide au plan de vol chiffré, en passant par la carte interactive et le carnet qu&apos;on remplit visite après visite.
            </p>
          </div>
          <div className="nv-caps-grid">
            <CapCard num="01 · Search" href="/search" label="Rechercher des aérodromes"
              desc="Filtrez par nom, code OACI, type de piste, carburant disponible, restaurant, hébergement — et retrouvez le terrain qui colle à votre après-midi."
              link="Ouvrir la recherche"
              icoStyle={{ background: "var(--horizon-100)", color: "var(--horizon-700)" }}
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>}
            />
            <CapCard num="02 · Map" href="/map" label="Carte interactive"
              desc="Explorez les terrains sur une carte pan-Aéro avec OpenStreetMap en fond et un filtrage temps réel par type, services et distance."
              link="Ouvrir la carte"
              icoStyle={{ background: "var(--terrain-100)", color: "var(--terrain-800)" }}
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6 9 4l6 2 5-2v14l-5 2-6-2-5 2V6Z"/><path d="M9 4v16"/><path d="M15 6v16"/></svg>}
            />
            <CapCard num="03 · Logbook" href="/aerodex" label="Aérodex — carnet de vol"
              desc="Marquez vos visites, collectionnez les badges, consultez vos statistiques. Un carnet de terrain qui se remplit au fil de vos aventures."
              link="Voir mon carnet"
              icoStyle={{ background: "var(--horizon-100)", color: "var(--horizon-700)" }}
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z"/></svg>}
            />
            <CapCard num="04 · Planner" href="/planner" label="Planificateur de vol"
              desc="Renseignez votre profil avion et trouvez les terrains accessibles avec une estimation de temps, de coût carburant et de distance."
              link="Planifier un vol"
              icoStyle={{ background: "var(--terrain-100)", color: "var(--terrain-800)" }}
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>}
            />
          </div>
        </section>

        {/* =============== ESCAPADE =============== */}
        <section style={{ padding: "24px 0 96px" }}>
          <div className="nv-escapade">
            {/* Visual : aérodromes depuis la BDD, ou exemples de fallback */}
            <div className="nv-escapade-visual" style={{
              aspectRatio: "4/5", background: "var(--paper-100)",
              border: "1px solid var(--ink-200)", borderRadius: 20,
              padding: 28, position: "relative",
              display: "flex", flexDirection: "column", gap: 12,
            }}>
              <span style={{ position: "absolute", top: 16, left: 20, fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.12em", color: "var(--ink-500)", textTransform: "uppercase" }}>
                Aérodromes · France
              </span>

              {(featured.length > 0
                ? featured
                : [
                    { id: "f1", name: "Romorantin Pruniers", icaoCode: "LFYR", elevation: 289, department: "Loir-et-Cher", hasRestaurant: true, hasAccommodation: false, hasTransport: false, hasBikes: true, runways: [{ length: 1100 }], fuels: [{ type: "AVGAS_100LL" }] },
                    { id: "f2", name: "Vierzon Méreau", icaoCode: "LFFV", elevation: 407, department: "Cher", hasRestaurant: true, hasAccommodation: true, hasTransport: true, hasBikes: false, runways: [{ length: 800 }], fuels: [] },
                    { id: "f3", name: "Thouars", icaoCode: "LFCT", elevation: 341, department: "Deux-Sèvres", hasRestaurant: true, hasAccommodation: false, hasTransport: false, hasBikes: false, runways: [{ length: 700 }], fuels: [] },
                  ] as FeaturedAerodrome[]
              ).map((ad, idx) => (
                <Link key={ad.id} href={`/aerodrome/${ad.id}`} style={{
                  background: "white", border: "1px solid var(--ink-200)", borderRadius: 12,
                  padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10,
                  marginTop: idx === 0 ? 28 : 0, textDecoration: "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: 15, color: "var(--ink-950)" }}>{ad.name}</span>
                    {ad.icaoCode && (
                      <span style={{ fontFamily: "var(--f-mono)", fontWeight: 500, fontSize: 11, background: "var(--paper-100)", color: "var(--ink-950)", border: "1px solid var(--ink-300)", borderRadius: 4, padding: "2px 8px", letterSpacing: "0.08em" }}>{ad.icaoCode}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                    {ad.elevation != null && <span style={{ fontFamily: "var(--f-mono)" }}>{ad.elevation} ft{ad.runways[0]?.length ? ` · piste ${ad.runways[0].length} m` : ""}</span>}
                    {ad.department && ` · ${ad.department}`}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {ad.hasRestaurant && <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, color: "var(--ink-700)", padding: "3px 8px", border: "1px solid var(--ink-200)", borderRadius: 999, background: "var(--paper-50)" }}>Restaurant</span>}
                    {ad.hasAccommodation && <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, color: "var(--ink-700)", padding: "3px 8px", border: "1px solid var(--ink-200)", borderRadius: 999, background: "var(--paper-50)" }}>Hébergement</span>}
                    {ad.hasTransport && <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, color: "var(--ink-700)", padding: "3px 8px", border: "1px solid var(--ink-200)", borderRadius: 999, background: "var(--paper-50)" }}>Transport</span>}
                    {ad.hasBikes && <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, color: "var(--ink-700)", padding: "3px 8px", border: "1px solid var(--ink-200)", borderRadius: 999, background: "var(--paper-50)" }}>Vélos en prêt</span>}
                    {ad.fuels.map(f => (
                      <span key={f.type} style={{ display: "inline-flex", alignItems: "center", fontSize: 11, color: "var(--ink-700)", padding: "3px 8px", border: "1px solid var(--ink-200)", borderRadius: 999, background: "var(--paper-50)" }}>{fuelLabel(f.type)}</span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>

            <div>
              <div className="nv-section-kicker">
                <span style={{ width: 32, height: 1, background: "var(--ink-400)", display: "inline-block" }} />
                L&apos;angle escapade
              </div>
              <h2 style={{ fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: 44, lineHeight: 1.05, letterSpacing: "-0.02em", margin: "0 0 20px" }}>
                Pas seulement un<br/>terrain d&apos;atterrissage.
              </h2>
              <p style={{ fontSize: 17, color: "var(--ink-700)", margin: "0 0 40px" }}>
                Chaque aérodrome devient un point de départ. On vous dit où manger, où dormir, comment rejoindre le bourg — pour que votre dimanche ne s&apos;arrête pas au parking.
              </p>

              <div>
                {[
                  { title: "Restaurants & club-houses", desc: "Les adresses qui ouvrent le dimanche, le menu du jour, la terrasse qui donne sur la piste.", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11V4a1 1 0 0 1 2 0v7"/><path d="M7 11V4a1 1 0 0 1 2 0v7"/><path d="M11 4v11c0 1 1 2 2 2h1v6"/><path d="M16 14c0-6 3-10 5-10v17"/></svg> },
                  { title: "Hébergements à portée de pied", desc: "Chambres d'hôtes, gîtes et hôtels dans un rayon marchable depuis le parking avions.", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16"/><path d="M4 20V10l8-6 8 6v10"/><path d="M9 20v-6h6v6"/></svg> },
                  { title: "Transport & dernière mile", desc: "Taxi, bus, location de vélo, navette club — pour rejoindre le bourg sans louer une voiture à 80 km.", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2-3h6l2 3h4"/><rect x="3" y="12" width="18" height="7" rx="1"/></svg> },
                  { title: "Carburant & services avion", desc: "100LL, SP98, mogas, PPR, parking nuit : tout ce qu'il faut savoir avant de décoller.", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 6h14v12H5z"/><path d="M9 6V4h6v2"/><path d="M9 12h6"/></svg> },
                ].map((f, i, arr) => (
                  <div key={f.title} style={{ display: "flex", gap: 16, padding: "20px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--ink-200)" : "none" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--paper-100)", border: "1px solid var(--ink-200)", display: "grid", placeItems: "center", color: "var(--ink-700)", flexShrink: 0 }}>{f.icon}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ink-950)", marginBottom: 4 }}>{f.title}</div>
                      <div style={{ fontSize: 14, color: "var(--ink-700)", lineHeight: 1.55 }}>{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* =============== AERODEX =============== */}
        <section style={{ padding: "24px 0 96px" }}>
          <div style={{ background: "var(--ink-950)", color: "white", borderRadius: 20, padding: "56px 56px 0", overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 50% 40% at 85% 20%, oklch(0.40 0.14 250 / 0.35), transparent 70%), radial-gradient(ellipse 40% 30% at 15% 80%, oklch(0.45 0.08 130 / 0.25), transparent 70%)", pointerEvents: "none" }} />
            <div className="nv-dex-inner" style={{ position: "relative" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "var(--f-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", color: "oklch(0.80 0.02 250)", marginBottom: 20 }}>
                  <span style={{ width: 32, height: 1, background: "oklch(0.45 0.02 250)", display: "inline-block" }} />
                  Aérodex · carnet de bord
                </div>
                <h2 style={{ fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: 44, lineHeight: 1.05, letterSpacing: "-0.02em", margin: "0 0 20px", color: "white" }}>
                  Collectionnez<br/>vos <em style={{ fontStyle: "italic", fontWeight: 400, color: "var(--terrain-500)" }}>terrains visités.</em>
                </h2>
                <p style={{ fontSize: 16, color: "oklch(0.78 0.015 250)", maxWidth: 460, marginBottom: 40, lineHeight: 1.6 }}>
                  Chaque aérodrome posé se marque sur votre carnet. Chaque palier se débloque en badge. Un moyen simple de garder la trace de ses aventures — et de se motiver à aller plus loin.
                </p>
                <Link href="/register" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, color: "white", padding: "12px 18px", background: "oklch(0.26 0.02 250)", border: "1px solid oklch(0.35 0.02 250)", borderRadius: 8, marginBottom: 56, textDecoration: "none" }}>
                  Créer un compte gratuit
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </Link>
              </div>

              <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { on: true, name: "Premier vol", desc: "Votre tout premier aérodrome posé", prog: 100, count: "1 / 1", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> },
                  { on: false, name: "Pilote du week-end", desc: "Visiter 5 aérodromes différents", prog: 60, count: "3 / 5", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> },
                  { on: false, name: "Explorateur", desc: "Poser dans 3 régions différentes", prog: 33, count: "1 / 3", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg> },
                  { on: false, name: "Légende", desc: "Visiter 100 aérodromes", prog: 3, count: "3 / 100", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
                ].map((m) => (
                  <div key={m.name} style={{ display: "flex", gap: 16, alignItems: "center", padding: "16px 18px", background: m.on ? "linear-gradient(180deg, oklch(0.32 0.06 130) 0%, oklch(0.24 0.04 130) 100%)" : "oklch(0.24 0.02 250)", border: m.on ? "1px solid var(--terrain-500)" : "1px solid oklch(0.32 0.02 250)", borderRadius: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: m.on ? "var(--terrain-500)" : "oklch(0.30 0.02 250)", border: m.on ? "1px solid var(--terrain-500)" : "1px solid oklch(0.40 0.02 250)", display: "grid", placeItems: "center", color: m.on ? "var(--ink-950)" : "oklch(0.70 0.02 250)", flexShrink: 0 }}>{m.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "white" }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: "oklch(0.74 0.015 250)", marginTop: 2 }}>{m.desc}</div>
                      <div style={{ height: 3, width: "100%", maxWidth: 180, background: "oklch(0.32 0.02 250)", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
                        <span style={{ display: "block", height: "100%", background: "var(--terrain-500)", width: `${m.prog}%` }} />
                      </div>
                    </div>
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 13, fontWeight: 500, color: "oklch(0.85 0.015 250)", flexShrink: 0 }}>{m.count}</span>
                  </div>
                ))}
                <div style={{ height: 56 }} />
              </div>
            </div>
          </div>
        </section>

        {/* =============== COMMUNITY =============== */}
        <section style={{ padding: "24px 0 96px" }}>
          <div style={{ marginBottom: 56 }}>
            <div className="nv-section-kicker">
              <span style={{ width: 32, height: 1, background: "var(--ink-400)", display: "inline-block" }} />
              Bientôt
            </div>
            <h2 style={{ fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: 48, lineHeight: 1.05, letterSpacing: "-0.02em", margin: "0 0 20px", maxWidth: 720 }}>
              Un carnet qui grandit<br/>avec la communauté.
            </h2>
            <p style={{ fontSize: 17, color: "var(--ink-700)", maxWidth: 620, margin: 0 }}>
              Les données de base sont là pour démarrer. L&apos;objectif : chaque pilote y ajoute son retour terrain, ses photos, ses bonnes adresses. On construit la base VFR française qu&apos;on aurait aimé avoir.
            </p>
          </div>

          <div className="nv-community">
            <div style={{ padding: 40, background: "white", border: "1px solid var(--ink-200)", borderRadius: 20, display: "flex", flexDirection: "column", gap: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", border: "1px solid var(--terrain-500)", background: "var(--terrain-100)", color: "var(--terrain-800)", borderRadius: 999, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>À venir</span>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--ink-500)" }}>Avis & photos</span>
              </div>
              <h3 style={{ fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: 28, lineHeight: 1.15, letterSpacing: "-0.01em", margin: 0 }}>
                Le retour terrain compte plus qu&apos;une fiche SIA.
              </h3>
              <p style={{ fontSize: 14, color: "var(--ink-700)", lineHeight: 1.6, margin: 0 }}>
                Un restaurant ouvert le dimanche, un club-house sympa, un parking venté ? Partagez ce que vous avez vécu au sol — les autres pilotes vous remercieront.
              </p>
              <div style={{ paddingTop: 16, borderTop: "1px solid var(--ink-200)", display: "flex", gap: 14, marginTop: "auto" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--ink-950)", color: "white", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>JD</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-950)" }}>Julien D.</span>
                    <span style={{ display: "inline-flex", gap: 1, color: "var(--terrain-500)" }}>
                      {[...Array(4)].map((_, i) => <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>)}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    </span>
                    <span style={{ fontSize: 11, color: "var(--ink-500)", fontFamily: "var(--f-mono)" }}>LFFV · il y a 3 jours</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--ink-700)", lineHeight: 1.55 }}>Super accueil au club, restaurant ouvert midi et soir le week-end, QFU 09 parfait par vent d&apos;ouest.</div>
                </div>
              </div>
            </div>

            <div style={{ padding: 40, background: "var(--paper-100)", border: "1px solid var(--ink-200)", borderRadius: 20, display: "flex", flexDirection: "column", gap: 24, backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 9px, oklch(0.92 0.02 85) 9px, oklch(0.92 0.02 85) 10px)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", border: "1px solid var(--terrain-500)", background: "var(--terrain-100)", color: "var(--terrain-800)", borderRadius: 999, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>À venir</span>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--ink-500)" }}>Contributions</span>
              </div>
              <h3 style={{ fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: 28, lineHeight: 1.15, letterSpacing: "-0.01em", margin: 0 }}>
                Corrigez une info, ajoutez un terrain, proposez une photo.
              </h3>
              <p style={{ fontSize: 14, color: "var(--ink-700)", lineHeight: 1.6, margin: 0 }}>
                Navventura ne sera pas maintenu par une seule personne. Chaque pilote peut éditer une fiche, signaler un changement, proposer un ajout — revu par un pair.
              </p>
              <div style={{ background: "white", border: "1px solid var(--ink-200)", borderRadius: 8, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginTop: "auto" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--terrain-800)", color: "white", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>MG</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-950)" }}>Mévin a ajouté une photo sur <span style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>LFCT Thouars</span></div>
                  <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 2 }}>il y a 2 heures · en attente de validation</div>
                </div>
                <span style={{ display: "inline-flex", padding: "4px 10px", border: "1px solid var(--ink-300)", background: "var(--paper-50)", color: "var(--ink-700)", borderRadius: 999, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>+1</span>
              </div>
            </div>
          </div>
        </section>

        {/* =============== FINAL CTA =============== */}
        <section style={{ padding: "24px 0 96px" }}>
          <div style={{ padding: "80px 56px", borderRadius: 20, background: "linear-gradient(135deg, var(--paper-50) 0%, var(--horizon-50) 100%)", border: "1px solid var(--ink-200)", textAlign: "center", position: "relative", overflow: "hidden" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "white", border: "1px solid var(--ink-200)", display: "grid", placeItems: "center", margin: "0 auto 24px", color: "var(--horizon-700)", boxShadow: "var(--shadow-lift)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5c.6-.6.8-1.4.6-2.1-.3-.8-1-1.3-1.8-1.5-.8-.1-1.6.1-2.1.6L12.7 8 4 6.4 2.4 8 9 12l-3 3H2l2 3 3 2 3-4v-4l4 6.6 1.8-1.4Z"/></svg>
            </div>
            <h2 style={{ fontFamily: "var(--f-serif)", fontWeight: 500, fontSize: 52, lineHeight: 1.05, letterSpacing: "-0.02em", margin: "0 0 20px" }}>
              Prêt pour votre prochaine<br/><em style={{ fontStyle: "italic", color: "var(--horizon-700)", fontWeight: 400 }}>escapade ?</em>
            </h2>
            <p style={{ fontSize: 17, color: "var(--ink-700)", maxWidth: 520, margin: "0 auto 32px" }}>
              Créez votre carnet Navventura, posez-y votre premier terrain et laissez votre marque sur la carte VFR française.
            </p>
            <div style={{ display: "inline-flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              <Link href="/register" className="nv-btn-dark">
                Créer mon carnet
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </Link>
              <Link href="/search" className="nv-btn-secondary">Explorer sans compte</Link>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
