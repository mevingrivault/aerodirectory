import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seeds the database with sample French aerodromes.
 * These are overridden when the openAIP import runs.
 * Useful for development without an API key.
 */
async function main() {
  console.log("Seeding database...");

  const aerodromes = [
    {
      name: "Paris-Le Bourget",
      icaoCode: "LFPB",
      latitude: 48.9694,
      longitude: 2.4414,
      elevation: 218,
      city: "Le Bourget",
      region: "Île-de-France",
      department: "Seine-Saint-Denis",
      countryCode: "FR",
      aerodromeType: "INTERNATIONAL_AIRPORT" as const,
      status: "OPEN" as const,
      hasRestaurant: true,
      hasMaintenance: true,
      hasHangars: true,
      nightOperations: true,
      source: "seed",
      sourceId: "seed-lfpb",
      runways: [
        { identifier: "07/25", length: 2665, width: 45, surface: "ASPHALT" as const, lighting: true },
        { identifier: "03/21", length: 3000, width: 45, surface: "ASPHALT" as const, lighting: true },
      ],
      frequencies: [
        { type: "TWR" as const, mhz: 120.900, callsign: "Le Bourget Tour" },
        { type: "APP" as const, mhz: 121.150, callsign: "Le Bourget Approche" },
        { type: "ATIS" as const, mhz: 126.500, callsign: "Le Bourget Information" },
      ],
      fuels: [
        { type: "AVGAS_100LL" as const, available: true, selfService: false, paymentType: "CARD" as const },
        { type: "JET_A1" as const, available: true, selfService: false, paymentType: "CARD" as const },
      ],
    },
    {
      name: "Toussus-le-Noble",
      icaoCode: "LFPN",
      latitude: 48.7519,
      longitude: 2.1061,
      elevation: 538,
      city: "Toussus-le-Noble",
      region: "Île-de-France",
      department: "Yvelines",
      countryCode: "FR",
      aerodromeType: "SMALL_AIRPORT" as const,
      status: "OPEN" as const,
      hasRestaurant: true,
      hasMaintenance: true,
      hasHangars: true,
      source: "seed",
      sourceId: "seed-lfpn",
      runways: [
        { identifier: "07L/25R", length: 1094, width: 30, surface: "ASPHALT" as const, lighting: true },
        { identifier: "07R/25L", length: 1200, width: 30, surface: "ASPHALT" as const, lighting: true },
      ],
      frequencies: [
        { type: "TWR" as const, mhz: 118.600, callsign: "Toussus Tour" },
        { type: "ATIS" as const, mhz: 126.725, callsign: "Toussus Information" },
      ],
      fuels: [
        { type: "AVGAS_100LL" as const, available: true, selfService: true, paymentType: "CARD" as const },
      ],
    },
    {
      name: "Lyon-Bron",
      icaoCode: "LFLY",
      latitude: 45.7272,
      longitude: 4.9444,
      elevation: 659,
      city: "Bron",
      region: "Auvergne-Rhône-Alpes",
      department: "Rhône",
      countryCode: "FR",
      aerodromeType: "SMALL_AIRPORT" as const,
      status: "OPEN" as const,
      hasRestaurant: true,
      hasMaintenance: true,
      hasHangars: true,
      nightOperations: true,
      source: "seed",
      sourceId: "seed-lfly",
      runways: [
        { identifier: "16/34", length: 1850, width: 45, surface: "ASPHALT" as const, lighting: true },
      ],
      frequencies: [
        { type: "TWR" as const, mhz: 118.250, callsign: "Bron Tour" },
        { type: "ATIS" as const, mhz: 124.525, callsign: "Bron Information" },
      ],
      fuels: [
        { type: "AVGAS_100LL" as const, available: true, selfService: false, paymentType: "CARD" as const },
        { type: "JET_A1" as const, available: true, selfService: false, paymentType: "CARD" as const },
      ],
    },
    {
      name: "Arcachon-La Teste-de-Buch",
      icaoCode: "LFCH",
      latitude: 44.5964,
      longitude: -1.1103,
      elevation: 49,
      city: "La Teste-de-Buch",
      region: "Nouvelle-Aquitaine",
      department: "Gironde",
      countryCode: "FR",
      aerodromeType: "SMALL_AIRPORT" as const,
      status: "OPEN" as const,
      hasRestaurant: true,
      hasBikes: true,
      hasAccommodation: true,
      source: "seed",
      sourceId: "seed-lfch",
      runways: [
        { identifier: "11/29", length: 1250, width: 30, surface: "ASPHALT" as const, lighting: false },
      ],
      frequencies: [
        { type: "AFIS" as const, mhz: 119.400, callsign: "Arcachon Information" },
      ],
      fuels: [
        { type: "AVGAS_100LL" as const, available: true, selfService: true, paymentType: "CARD" as const },
      ],
    },
    {
      name: "Colmar-Houssen",
      icaoCode: "LFGA",
      latitude: 48.1100,
      longitude: 7.3597,
      elevation: 628,
      city: "Colmar",
      region: "Grand Est",
      department: "Haut-Rhin",
      countryCode: "FR",
      aerodromeType: "SMALL_AIRPORT" as const,
      status: "OPEN" as const,
      hasRestaurant: false,
      hasTransport: true,
      source: "seed",
      sourceId: "seed-lfga",
      runways: [
        { identifier: "01/19", length: 1520, width: 30, surface: "ASPHALT" as const, lighting: true },
      ],
      frequencies: [
        { type: "AFIS" as const, mhz: 119.650, callsign: "Colmar Information" },
      ],
      fuels: [
        { type: "AVGAS_100LL" as const, available: true, selfService: true, paymentType: "CARD" as const },
      ],
    },
  ];

  for (const ad of aerodromes) {
    const { runways, frequencies, fuels, ...data } = ad;

    await prisma.aerodrome.upsert({
      where: {
        source_sourceId: {
          source: data.source,
          sourceId: data.sourceId,
        },
      },
      update: {
        ...data,
        runways: {
          deleteMany: {},
          create: runways,
        },
        frequencies: {
          deleteMany: {},
          create: frequencies,
        },
        fuels: {
          deleteMany: {},
          create: fuels,
        },
      },
      create: {
        ...data,
        runways: { create: runways },
        frequencies: { create: frequencies },
        fuels: { create: fuels },
      },
    });

    console.log(`  ${data.icaoCode} — ${data.name}`);
  }

  console.log(`\nSeeded ${aerodromes.length} aerodromes.`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
