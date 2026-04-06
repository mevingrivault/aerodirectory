import type { PrismaClient } from "@aerodirectory/database";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const DELAY_MS = 1_100;

const REGION_ALIASES: Record<string, string> = {
  "Alsace-Champagne-Ardenne-Lorraine": "Grand Est",
  "Nord-Pas-de-Calais-Picardie": "Hauts-de-France",
  "Aquitaine-Limousin-Poitou-Charentes": "Nouvelle-Aquitaine",
  "Languedoc-Roussillon-Midi-Pyrénées": "Occitanie",
  "Auvergne-Rhône-Alpes": "Auvergne-Rhône-Alpes",
  "Bourgogne-Franche-Comté": "Bourgogne-Franche-Comté",
  "Centre-Val de Loire": "Centre-Val de Loire",
  "Île-de-France": "Île-de-France",
  Normandie: "Normandie",
  Bretagne: "Bretagne",
  "Pays de la Loire": "Pays de la Loire",
  Occitanie: "Occitanie",
  "Nouvelle-Aquitaine": "Nouvelle-Aquitaine",
  "Hauts-de-France": "Hauts-de-France",
  "Grand Est": "Grand Est",
  "Provence-Alpes-Côte d'Azur": "Provence-Alpes-Côte d'Azur",
  Corse: "Corse",
  Guadeloupe: "Guadeloupe",
  Martinique: "Martinique",
  Guyane: "Guyane",
  "La Réunion": "La Réunion",
  Mayotte: "Mayotte",
};

interface NominatimResponse {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
  };
  error?: string;
}

export interface RunRegionsSyncTaskOptions {
  aerodromeIds?: string[];
  forceAll?: boolean;
  limit?: number;
}

async function reverseGeocode(lat: number, lon: number) {
  const url = `${NOMINATIM_URL}?lat=${lat}&lon=${lon}&format=json&accept-language=fr&zoom=10`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "navventura/1.0 (nightly sync)",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim HTTP ${response.status}`);
  }

  const data = (await response.json()) as NominatimResponse;
  if (data.error || !data.address) {
    return { city: null, region: null };
  }

  const address = data.address;
  const city =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.county ??
    null;

  const rawRegion = address.state ?? null;
  const region = rawRegion ? (REGION_ALIASES[rawRegion] ?? rawRegion) : null;

  return { city, region };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function runRegionsSyncTask(
  prisma: PrismaClient,
  options: RunRegionsSyncTaskOptions = {},
) {
  const where = options.aerodromeIds?.length
    ? { id: { in: options.aerodromeIds } }
    : options.forceAll
      ? {}
      : { OR: [{ city: null }, { region: null }] };

  const aerodromes = await prisma.aerodrome.findMany({
    where,
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      city: true,
      region: true,
    },
    orderBy: { name: "asc" },
    ...(options.limit ? { take: options.limit } : {}),
  });

  let updated = 0;
  let errors = 0;
  const failures: string[] = [];

  for (let index = 0; index < aerodromes.length; index++) {
    const aerodrome = aerodromes[index]!;
    try {
      const { city, region } = await reverseGeocode(
        aerodrome.latitude,
        aerodrome.longitude,
      );

      await prisma.aerodrome.update({
        where: { id: aerodrome.id },
        data: { city, region, lastSyncedAt: new Date() },
      });
      updated++;
    } catch (error) {
      errors++;
      failures.push(`${aerodrome.name}: ${String(error)}`);
    }

    if (index < aerodromes.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  return {
    total: aerodromes.length,
    updated,
    errors,
    failures,
    scope: options.aerodromeIds?.length ? "delta" : options.forceAll ? "full" : "missing_only",
  };
}
