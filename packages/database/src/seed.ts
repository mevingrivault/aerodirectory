import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seeds the database with sample French aerodromes.
 * Real data should come from official SIA/DGAC sources.
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
      status: "OPEN" as const,
      hasRestaurant: true,
      hasMaintenance: true,
      hasHangars: true,
      nightOperations: true,
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
      status: "OPEN" as const,
      hasRestaurant: true,
      hasMaintenance: true,
      hasHangars: true,
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
      status: "OPEN" as const,
      hasRestaurant: true,
      hasMaintenance: true,
      hasHangars: true,
      nightOperations: true,
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
      status: "OPEN" as const,
      hasRestaurant: true,
      hasBikes: true,
      hasAccommodation: true,
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
      status: "OPEN" as const,
      hasRestaurant: false,
      hasTransport: true,
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
    {
      name: "Aérodrome de Saint-Cyr-l'École",
      icaoCode: "LFPZ",
      latitude: 48.8114,
      longitude: 2.0717,
      elevation: 371,
      city: "Saint-Cyr-l'École",
      region: "Île-de-France",
      department: "Yvelines",
      status: "OPEN" as const,
      hasRestaurant: true,
      hasMaintenance: true,
      runways: [
        { identifier: "11/29", length: 800, width: 50, surface: "GRASS" as const, lighting: false },
      ],
      frequencies: [
        { type: "AFIS" as const, mhz: 130.050, callsign: "Saint-Cyr Information" },
      ],
      fuels: [],
    },
    {
      name: "Aérodrome de Lognes-Émerainville",
      icaoCode: "LFPL",
      latitude: 48.8231,
      longitude: 2.6253,
      elevation: 354,
      city: "Lognes",
      region: "Île-de-France",
      department: "Seine-et-Marne",
      status: "OPEN" as const,
      hasRestaurant: true,
      hasMaintenance: true,
      hasHangars: true,
      runways: [
        { identifier: "08/26", length: 880, width: 23, surface: "ASPHALT" as const, lighting: true },
      ],
      frequencies: [
        { type: "TWR" as const, mhz: 120.550, callsign: "Lognes Tour" },
      ],
      fuels: [
        { type: "AVGAS_100LL" as const, available: true, selfService: true, paymentType: "CARD" as const },
      ],
    },
    {
      name: "Aérodrome de La Baule-Escoublac",
      icaoCode: "LFRE",
      latitude: 47.2894,
      longitude: -2.3464,
      elevation: 105,
      city: "La Baule-Escoublac",
      region: "Pays de la Loire",
      department: "Loire-Atlantique",
      status: "OPEN" as const,
      hasRestaurant: true,
      hasBikes: true,
      hasAccommodation: true,
      hasTransport: true,
      runways: [
        { identifier: "08/26", length: 1250, width: 30, surface: "ASPHALT" as const, lighting: false },
      ],
      frequencies: [
        { type: "AFIS" as const, mhz: 123.500, callsign: "La Baule Information" },
      ],
      fuels: [
        { type: "AVGAS_100LL" as const, available: true, selfService: true, paymentType: "CARD" as const },
      ],
    },
    {
      name: "Aérodrome de Propriano-Tavaria",
      icaoCode: "LFKO",
      latitude: 41.6606,
      longitude: 8.8897,
      elevation: 13,
      city: "Propriano",
      region: "Corse",
      department: "Corse-du-Sud",
      status: "OPEN" as const,
      hasRestaurant: false,
      hasAccommodation: true,
      runways: [
        { identifier: "18/36", length: 1600, width: 30, surface: "ASPHALT" as const, lighting: true },
      ],
      frequencies: [
        { type: "AFIS" as const, mhz: 118.225, callsign: "Propriano Information" },
      ],
      fuels: [
        { type: "AVGAS_100LL" as const, available: true, selfService: true, paymentType: "CARD" as const },
      ],
    },
    {
      name: "Aérodrome d'Étampes-Mondésir",
      icaoCode: "LFOX",
      latitude: 48.3817,
      longitude: 2.0756,
      elevation: 489,
      city: "Guillerval",
      region: "Île-de-France",
      department: "Essonne",
      status: "OPEN" as const,
      hasRestaurant: true,
      hasMaintenance: true,
      runways: [
        { identifier: "06/24", length: 1000, width: 80, surface: "GRASS" as const, lighting: false },
        { identifier: "11/29", length: 860, width: 25, surface: "ASPHALT" as const, lighting: false },
      ],
      frequencies: [
        { type: "AFIS" as const, mhz: 123.525, callsign: "Étampes Information" },
      ],
      fuels: [
        { type: "AVGAS_100LL" as const, available: true, selfService: true, paymentType: "CARD" as const },
      ],
    },
  ];

  for (const ad of aerodromes) {
    const { runways, frequencies, fuels, ...data } = ad;

    await prisma.aerodrome.upsert({
      where: { icaoCode: data.icaoCode },
      update: {},
      create: {
        ...data,
        runways: { create: runways },
        frequencies: { create: frequencies },
        fuels: { create: fuels },
      },
    });

    console.log(`  ✓ ${data.icaoCode} — ${data.name}`);
  }

  console.log(`\nSeeded ${aerodromes.length} aerodromes.`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
