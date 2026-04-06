import type { SyncSource } from "@aerodirectory/database";

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
    case "OSM":
      return "POI OSM + flags, chaque dimanche à 03:00";
    case "REGIONS":
      return "Delta quotidien après openAIP + sweep complet mensuel";
    case "RGPD":
      return "Nettoyage RGPD quotidien à 04:30";
    default:
      return "Planification inconnue";
  }
}
