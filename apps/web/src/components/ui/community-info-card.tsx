"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, ExternalLink, Plus, Send } from "lucide-react";
import {
  FEE_CATEGORIES,
  FUEL_TYPES,
  HANGAR_AVAILABILITY,
  type AerodromeCommunityInfo,
  type CommunityInfoItem,
} from "@aerodirectory/shared";
import { apiClient } from "@/lib/api-client";
import { useAltchaAuto } from "@/lib/use-altcha-auto";
import {
  COMMUNITY_KIND_LABELS,
  FEE_CATEGORY_LABELS,
  HANGAR_LABELS,
  communityInfoSummary,
  fuelLabel,
  isStale,
  safeHttpUrl,
} from "@/lib/community-info";

const card: CSSProperties = { background: "white", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 22 };
const groupTitle: CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" };
const row: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "8px 0", borderBottom: "1px dashed var(--ink-200)", fontSize: 13 };
const meta: CSSProperties = { fontSize: 11, color: "var(--ink-500)", whiteSpace: "nowrap" };
const label: CSSProperties = { fontSize: 12, color: "var(--ink-700)", display: "block", marginBottom: 4 };
const field: CSSProperties = { width: "100%", borderRadius: 6, border: "1px solid var(--ink-200)", padding: "8px 12px", fontSize: 14, fontFamily: "inherit", background: "var(--paper-50)", color: "var(--ink-950)", boxSizing: "border-box" };
const linkRel = "noopener noreferrer nofollow";

const GROUPS: { kind: CommunityInfoItem["kind"]; title: string }[] = [
  { kind: "FUEL_PRICE", title: "Prix carburant" },
  { kind: "LANDING_FEE", title: "Taxes" },
  { kind: "HANGAR", title: "Hangar" },
];

function observedLine(item: CommunityInfoItem) {
  const date = new Date(item.observedAt).toLocaleDateString("fr-FR", { timeZone: "UTC" });
  return `constaté le ${date}${item.user.displayName ? ` par ${item.user.displayName}` : ""}`;
}

function InfoRow({ item }: { item: CommunityInfoItem }) {
  const stale = isStale(item);
  return (
    <div style={row}>
      <span style={{ color: stale ? "var(--ink-500)" : "var(--ink-800)" }}>{communityInfoSummary(item)}</span>
      <span style={meta}>
        {stale && <span style={{ color: "oklch(0.55 0.13 60)", fontWeight: 600, marginRight: 6 }}>À vérifier</span>}
        {observedLine(item)}
      </span>
    </div>
  );
}

/** Webcam links: Cam-Aéro first, then those added by members. Images are never embedded (CSP). */
export function WebcamLinks({ info }: { info: AerodromeCommunityInfo }) {
  const member = info.items
    .filter((item) => item.kind === "WEBCAM")
    .map((item) => ({ id: item.id, label: String(item.data["label"] ?? "Webcam"), url: safeHttpUrl(item.data["url"]), source: "membre" }))
    .filter((w): w is { id: string; label: string; url: string; source: string } => !!w.url);
  const webcams = [
    ...info.webcams.map((w) => ({ id: w.id, label: w.label, url: w.pageUrl, source: "Cam-Aéro" })),
    ...member,
  ];
  if (webcams.length === 0) return null;

  return (
    <div>
      <p style={groupTitle}>Webcams</p>
      {webcams.map((w) => (
        <a key={w.id} href={w.url} target="_blank" rel={linkRel} style={{ ...row, color: "var(--ink-800)", textDecoration: "none" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Camera className="h-3.5 w-3.5" /> {w.label} <ExternalLink className="h-3 w-3" />
          </span>
          <span style={meta}>{w.source === "Cam-Aéro" ? "via cam-aero.eu" : "lien proposé par un membre"}</span>
        </a>
      ))}
    </div>
  );
}

export function CommunityInfoSection({
  aerodromeId,
  info,
  loggedIn,
}: {
  aerodromeId: string;
  info: AerodromeCommunityInfo | null;
  loggedIn: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const items = info?.items ?? [];
  const groups = GROUPS.map((g) => ({ ...g, items: items.filter((item) => item.kind === g.kind) })).filter((g) => g.items.length > 0);
  const hasWebcams = !!info && (info.webcams.length > 0 || items.some((item) => item.kind === "WEBCAM"));

  return (
    <div style={card}>
      {groups.length === 0 && !hasWebcams && (
        <p style={{ fontSize: 13, color: "var(--ink-500)", margin: "0 0 12px" }}>
          Aucun prix, taxe ou hangar renseigné pour l&apos;instant. Vous êtes passé ici récemment ? Partagez ce que vous avez vu.
        </p>
      )}
      {groups.map((g) => (
        <div key={g.kind} style={{ marginBottom: 16 }}>
          <p style={groupTitle}>{g.title}</p>
          {g.items.map((item) => <InfoRow key={item.id} item={item} />)}
        </div>
      ))}
      {info && <div style={{ marginBottom: 16 }}><WebcamLinks info={info} /></div>}

      <p style={{ fontSize: 11, color: "var(--ink-500)", margin: "0 0 12px" }}>
        Informations partagées par les membres et vérifiées par un administrateur avant publication. Les prix changent : confirmez auprès du terrain.
      </p>

      {!loggedIn ? (
        <p style={{ fontSize: 13, margin: 0 }}>
          <Link href="/login" style={{ color: "var(--horizon-700)" }}>Connectez-vous</Link> pour ajouter un prix, une taxe, un hangar ou une webcam.
        </p>
      ) : formOpen ? (
        <CommunityInfoForm aerodromeId={aerodromeId} onDone={() => setFormOpen(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 14px", background: "white", color: "var(--ink-950)", border: "1px solid var(--ink-200)", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" }}
        >
          <Plus className="h-4 w-4" /> Ajouter une information
        </button>
      )}
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const toNumber = (value: string) => (value.trim() === "" ? undefined : Number(value.replace(",", ".")));

function CommunityInfoForm({ aerodromeId, onDone }: { aerodromeId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const solveAltcha = useAltchaAuto();
  const [kind, setKind] = useState<CommunityInfoItem["kind"]>("FUEL_PRICE");
  const [observedAt, setObservedAt] = useState(today);
  const [fuelType, setFuelType] = useState<(typeof FUEL_TYPES)[number]>("AVGAS_100LL");
  const [category, setCategory] = useState<(typeof FEE_CATEGORIES)[number]>("LIGHT");
  const [availability, setAvailability] = useState<(typeof HANGAR_AVAILABILITY)[number]>("ON_REQUEST");
  const [amount, setAmount] = useState("");
  const [secondAmount, setSecondAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [url, setUrl] = useState("");
  const [webcamLabel, setWebcamLabel] = useState("");
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [sending, setSending] = useState(false);

  const body = () => {
    const common = { kind, observedAt, ...(remarks.trim() ? { remarks: remarks.trim() } : {}) };
    switch (kind) {
      case "FUEL_PRICE":
        return { ...common, fuelType, pricePerLiter: toNumber(amount) };
      case "LANDING_FEE":
        return { ...common, category, landingFee: toNumber(amount) ?? 0, parkingPerNight: toNumber(secondAmount) };
      case "HANGAR":
        return { ...common, availability, pricePerNight: toNumber(secondAmount) };
      case "WEBCAM":
        return { kind, observedAt, url: url.trim(), label: webcamLabel.trim() };
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setAlert(null);
    setSending(true);
    try {
      const altcha = await solveAltcha();
      await apiClient.post(`/aerodromes/${aerodromeId}/community-info`, body(), altcha ? { "x-altcha": altcha } : undefined);
      setAlert({ type: "success", message: "Merci ! Votre information sera visible après validation par un administrateur." });
      setAmount("");
      setSecondAmount("");
      setRemarks("");
      setUrl("");
      setWebcamLabel("");
      await queryClient.invalidateQueries({ queryKey: ["aerodrome-community-info", aerodromeId] });
    } catch (error) {
      setAlert({ type: "error", message: error instanceof Error ? error.message : "Envoi impossible pour le moment." });
    } finally {
      setSending(false);
    }
  };

  const canSend =
    !sending &&
    (kind === "FUEL_PRICE" ? amount.trim() !== "" : kind === "WEBCAM" ? url.trim() !== "" && webcamLabel.trim() !== "" : true);

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--ink-200)", paddingTop: 16 }}>
      {alert && (
        <div style={{ padding: "10px 14px", borderRadius: 6, fontSize: 13, background: alert.type === "success" ? "oklch(0.96 0.05 130)" : "oklch(0.96 0.05 25)", color: alert.type === "success" ? "var(--terrain-800)" : "oklch(0.40 0.15 25)" }}>
          {alert.message}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label style={label} htmlFor="ci-kind">Information</label>
          <select id="ci-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} style={field}>
            {(Object.keys(COMMUNITY_KIND_LABELS) as CommunityInfoItem["kind"][]).map((k) => (
              <option key={k} value={k}>{COMMUNITY_KIND_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={label} htmlFor="ci-date">{kind === "WEBCAM" ? "Vérifié le" : "Constaté le"}</label>
          <input id="ci-date" type="date" value={observedAt} max={today()} onChange={(e) => setObservedAt(e.target.value)} style={field} required />
        </div>

        {kind === "FUEL_PRICE" && (
          <>
            <div>
              <label style={label} htmlFor="ci-fuel">Carburant</label>
              <select id="ci-fuel" value={fuelType} onChange={(e) => setFuelType(e.target.value as typeof fuelType)} style={field}>
                {FUEL_TYPES.map((t) => <option key={t} value={t}>{fuelLabel(t)}</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="ci-price">Prix (€/L)</label>
              <input id="ci-price" inputMode="decimal" placeholder="2,95" value={amount} onChange={(e) => setAmount(e.target.value)} style={field} required />
            </div>
          </>
        )}

        {kind === "LANDING_FEE" && (
          <>
            <div>
              <label style={label} htmlFor="ci-category">Catégorie</label>
              <select id="ci-category" value={category} onChange={(e) => setCategory(e.target.value as typeof category)} style={field}>
                {FEE_CATEGORIES.map((c) => <option key={c} value={c}>{FEE_CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="ci-landing">Atterrissage (€, 0 si gratuit)</label>
              <input id="ci-landing" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} style={field} />
            </div>
            <div>
              <label style={label} htmlFor="ci-parking">Parking par nuit (€, optionnel)</label>
              <input id="ci-parking" inputMode="decimal" value={secondAmount} onChange={(e) => setSecondAmount(e.target.value)} style={field} />
            </div>
          </>
        )}

        {kind === "HANGAR" && (
          <>
            <div>
              <label style={label} htmlFor="ci-hangar">Hangar de passage</label>
              <select id="ci-hangar" value={availability} onChange={(e) => setAvailability(e.target.value as typeof availability)} style={field}>
                {HANGAR_AVAILABILITY.map((a) => <option key={a} value={a}>{HANGAR_LABELS[a]}</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="ci-hangar-price">Prix par nuit (€, optionnel)</label>
              <input id="ci-hangar-price" inputMode="decimal" value={secondAmount} onChange={(e) => setSecondAmount(e.target.value)} style={field} />
            </div>
          </>
        )}

        {kind === "WEBCAM" && (
          <>
            <div>
              <label style={label} htmlFor="ci-url">Lien de la webcam</label>
              <input id="ci-url" type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} style={field} required />
            </div>
            <div>
              <label style={label} htmlFor="ci-label">Libellé</label>
              <input id="ci-label" placeholder="Vue sur la piste 27" value={webcamLabel} onChange={(e) => setWebcamLabel(e.target.value)} maxLength={80} style={field} required />
            </div>
          </>
        )}
      </div>

      {kind !== "WEBCAM" && (
        <div>
          <label style={label} htmlFor="ci-remarks">Précisions (optionnel)</label>
          <input id="ci-remarks" placeholder={kind === "FUEL_PRICE" ? "Carte Total, self 24 h/24…" : "Gratuit pour les membres FFA, PPR…"} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={300} style={field} />
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onDone} style={{ height: 40, padding: "0 16px", background: "white", border: "1px solid var(--ink-200)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
          Fermer
        </button>
        <button type="submit" disabled={!canSend} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", background: "var(--ink-950)", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: canSend ? 1 : 0.5 }}>
          <Send className="h-4 w-4" /> Envoyer
        </button>
      </div>
    </form>
  );
}
