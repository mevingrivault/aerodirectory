import type { PrismaClient } from "@aerodirectory/database";

const RADIUS_METERS = 1_000;
const BOX_DEG = 0.025;

interface FlagRow {
  id: string;
  hasRestaurant: boolean;
  hasBikes: boolean;
  hasTransport: boolean;
  hasAccommodation: boolean;
}

export async function runSyncAerodromeFlagsTask(prisma: PrismaClient) {
  const poiCount = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) AS count FROM osm.pois
  `;
  const totalPois = Number(poiCount[0]?.count ?? 0);

  if (totalPois === 0) {
    return {
      updated: 0,
      totalPois,
      byFlag: {
        hasRestaurant: 0,
        hasBikes: 0,
        hasTransport: 0,
        hasAccommodation: 0,
      },
      skipped: true,
    };
  }

  const rows = await prisma.$queryRaw<FlagRow[]>`
    SELECT
      a.id,
      COALESCE(bool_or(p.category = 'RESTAURANT'    AND dist <= ${RADIUS_METERS}), FALSE) AS "hasRestaurant",
      COALESCE(bool_or(p.category = 'BIKE'          AND dist <= ${RADIUS_METERS}), FALSE) AS "hasBikes",
      COALESCE(bool_or(p.category = 'TRANSPORT'     AND dist <= ${RADIUS_METERS}), FALSE) AS "hasTransport",
      COALESCE(bool_or(p.category = 'ACCOMMODATION' AND dist <= ${RADIUS_METERS}), FALSE) AS "hasAccommodation"
    FROM public.aerodromes a
    LEFT JOIN LATERAL (
      SELECT
        p.category,
        2 * 6371000 * asin(sqrt(
          power(sin(radians((p.lat - a.latitude)  / 2)), 2) +
          cos(radians(a.latitude)) * cos(radians(p.lat)) *
          power(sin(radians((p.lon - a.longitude) / 2)), 2)
        )) AS dist
      FROM osm.pois p
      WHERE
        p.lat BETWEEN a.latitude - ${BOX_DEG} AND a.latitude + ${BOX_DEG}
        AND p.lon BETWEEN a.longitude - ${BOX_DEG} AND a.longitude + ${BOX_DEG}
    ) p ON TRUE
    GROUP BY a.id
  `;

  const batchSize = 200;
  let updated = 0;
  for (let index = 0; index < rows.length; index += batchSize) {
    const slice = rows.slice(index, index + batchSize);
    await Promise.all(
      slice.map((row) =>
        prisma.aerodrome.update({
          where: { id: row.id },
          data: {
            hasRestaurant: row.hasRestaurant,
            hasBikes: row.hasBikes,
            hasTransport: row.hasTransport,
            hasAccommodation: row.hasAccommodation,
          },
        }),
      ),
    );
    updated += slice.length;
  }

  return {
    updated,
    totalPois,
    byFlag: {
      hasRestaurant: rows.filter((row) => row.hasRestaurant).length,
      hasBikes: rows.filter((row) => row.hasBikes).length,
      hasTransport: rows.filter((row) => row.hasTransport).length,
      hasAccommodation: rows.filter((row) => row.hasAccommodation).length,
    },
    skipped: false,
  };
}
