import { SVGProps, ReactElement } from "react";

// ── Aérodrome / avion léger (DR400 vue de dessus) ──────────
function SmallAircraftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      {/* Fuselage */}
      <ellipse cx="12" cy="12" rx="1.2" ry="7" />
      {/* Ailes principales */}
      <ellipse cx="12" cy="11" rx="9" ry="1.8" transform="rotate(-5 12 11)" />
      {/* Empennage horizontal */}
      <ellipse cx="12" cy="18.5" rx="4.5" ry="1" />
      {/* Hélice */}
      <ellipse cx="12" cy="5" rx="2.5" ry="0.7" />
    </svg>
  );
}

// ── Aéroport international (avion de ligne vue de dessus) ──
function AirportIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      {/* Fuselage */}
      <ellipse cx="12" cy="12" rx="1.5" ry="8" />
      {/* Ailes */}
      <ellipse cx="12" cy="11" rx="11" ry="2.2" />
      {/* Réacteurs gauche */}
      <ellipse cx="6" cy="11.5" rx="1.8" ry="0.8" />
      {/* Réacteurs droit */}
      <ellipse cx="18" cy="11.5" rx="1.8" ry="0.8" />
      {/* Empennage horizontal */}
      <ellipse cx="12" cy="19" rx="5" ry="1.1" />
      {/* Nez arrondi */}
      <ellipse cx="12" cy="4.5" rx="1.5" ry="1" />
    </svg>
  );
}

// ── ULM — aile delta vue de dessus ─────────────────────────
function UlmIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      {/* Aile triangulaire */}
      <path d="M12 3 L2 19 L12 16 L22 19 Z" />
      {/* Mât / carène centrale */}
      <rect x="11.2" y="3" width="1.6" height="13" rx="0.8" />
    </svg>
  );
}

// ── Hydravion vue de dessus ─────────────────────────────────
function SeaplaneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      {/* Fuselage */}
      <ellipse cx="12" cy="11" rx="1.3" ry="7" />
      {/* Ailes */}
      <ellipse cx="12" cy="10" rx="9" ry="1.8" />
      {/* Empennage */}
      <ellipse cx="12" cy="17.5" rx="4" ry="1" />
      {/* Flotteur gauche */}
      <ellipse cx="5" cy="13" rx="1" ry="3.5" />
      {/* Flotteur droit */}
      <ellipse cx="19" cy="13" rx="1" ry="3.5" />
      {/* Jambes de flotteurs */}
      <line x1="8" y1="10.5" x2="5.5" y2="12" stroke="currentColor" strokeWidth="0.8" />
      <line x1="16" y1="10.5" x2="18.5" y2="12" stroke="currentColor" strokeWidth="0.8" />
    </svg>
  );
}

// ── Hélicoptère vue de dessus ───────────────────────────────
function HelicopterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      {/* Rotor principal (grand cercle) */}
      <ellipse cx="11" cy="11" rx="9" ry="1.2" />
      <ellipse cx="11" cy="11" rx="1.2" ry="9" />
      {/* Moyeu du rotor */}
      <circle cx="11" cy="11" r="1.5" />
      {/* Cabine (vue de dessus, ovale) */}
      <ellipse cx="11" cy="14" rx="3.5" ry="4.5" />
      {/* Queue */}
      <rect x="10.3" y="18" width="1.4" height="4" rx="0.7" />
      {/* Rotor de queue */}
      <ellipse cx="11" cy="22" rx="2.5" ry="0.7" />
    </svg>
  );
}

// ── Planeur vue de dessus ───────────────────────────────────
function GliderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      {/* Fuselage très fin */}
      <ellipse cx="12" cy="12" rx="0.9" ry="8" />
      {/* Très grandes ailes effilées */}
      <path d="M12 10 Q6 10.5 2 13 Q6 11.5 12 11.5 Q18 11.5 22 13 Q18 10.5 12 10Z" />
      {/* Empennage */}
      <ellipse cx="12" cy="19.5" rx="3.5" ry="0.8" />
    </svg>
  );
}

// ── Militaire ───────────────────────────────────────────────
function MilitaryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      {/* Fuselage */}
      <ellipse cx="12" cy="12" rx="1.2" ry="7.5" />
      {/* Ailes en delta */}
      <path d="M12 8 L2 16 L12 13.5 L22 16 Z" />
      {/* Empennage */}
      <path d="M12 18 L8 21 L12 20 L16 21 Z" />
    </svg>
  );
}

// ── Générique ───────────────────────────────────────────────
function GenericIcon(props: SVGProps<SVGSVGElement>) {
  return <SmallAircraftIcon {...props} />;
}

const iconMap: Record<string, (props: SVGProps<SVGSVGElement>) => ReactElement> = {
  INTERNATIONAL_AIRPORT: AirportIcon,
  SMALL_AIRPORT: SmallAircraftIcon,
  ULTRALIGHT_FIELD: UlmIcon,
  SEAPLANE_BASE: SeaplaneIcon,
  HELIPORT: HelicopterIcon,
  GLIDER_SITE: GliderIcon,
  MILITARY: MilitaryIcon,
  OTHER: GenericIcon,
};

interface AerodromeTypeIconProps extends SVGProps<SVGSVGElement> {
  type: string;
}

export function AerodromeTypeIcon({ type, ...props }: AerodromeTypeIconProps) {
  const Icon = iconMap[type] ?? GenericIcon;
  return <Icon {...props} />;
}
