import type { SyncSource } from "@aerodirectory/database";

/** Every source the worker runs, in the order the admin page lists them. */
export const SYNC_SOURCES: SyncSource[] = ["OPENAIP", "AIRSPACES", "OSM", "REGIONS", "RGPD", "OURAIRPORTS", "COMMONS", "OBSTACLES", "PROTECTED_AREAS", "WIND_CLIMATE"];

function matchesCronField(value: number, token: string) {
  if (token === "*") return true;
  return Number(token) === value;
}

export function computeNextCronOccurrence(cron: string, from = new Date()): Date | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minuteToken, hourToken, dayOfMonthToken, monthToken, dayOfWeekToken] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  const candidate = new Date(from.getTime());
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    if (
      matchesCronField(candidate.getMinutes(), minuteToken) &&
      matchesCronField(candidate.getHours(), hourToken) &&
      matchesCronField(candidate.getDate(), dayOfMonthToken) &&
      matchesCronField(candidate.getMonth() + 1, monthToken) &&
      matchesCronField(candidate.getDay(), dayOfWeekToken)
    ) {
      return new Date(candidate);
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return null;
}

export function getSourceScheduleDescription(source: SyncSource) {
  switch (source) {
    case "OPENAIP":
      return "Aérodromes openAIP, chaque nuit à 02:00";
    case "AIRSPACES":
      return "Espaces aériens openAIP, chaque nuit à 02:30";
    case "OSM":
      return "POI OSM + flags, chaque dimanche à 03:00";
    case "REGIONS":
      return "Delta quotidien après openAIP + sweep complet mensuel";
    case "RGPD":
      return "Nettoyage RGPD quotidien à 04:30";
    case "OURAIRPORTS":
      return "Sites web et liens Wikipédia OurAirports, chaque dimanche à 04:00";
    case "COMMONS":
      return "Photos Wikimedia Commons, chaque dimanche à 05:30";
    case "OBSTACLES":
      return "Obstacles openAIP, chaque lundi à 03:00";
    case "PROTECTED_AREAS":
      return "Zones protégées IGN, le 2 de chaque mois à 04:00";
    case "WIND_CLIMATE":
      return "Climatologie du vent Météo-France, le 15 février à 04:00";
    default:
      return "Planification inconnue";
  }
}
