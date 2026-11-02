import { describe, it, expect, vi } from "vitest";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import {
  addObservation,
  directionBin,
  headerIndex,
  representative,
  speedClass,
  type StationAccumulator,
} from "./wind-climate";
import { aggregateFile, listPeriodFiles, syncWindClimate } from "./wind-climate.importer";

/**
 * The prevailing-wind rose of each aerodrome comes from these counts: the
 * direction bins, speed classes, calm and quality filtering must be right.
 */

const HEADER = "NUM_POSTE;NOM_USUEL;LAT;LON;ALTI;AAAAMMJJHH;RR1;QRR1;FF;QFF;DD;QDD;T";
const line = (ff: string, dd: string, q = "1", time = "2021061512", station = "31069001") =>
  `${station};TOULOUSE-BLAGNAC;43.621000;1.378833;151;${time};0.0;1;${ff};${q};${dd};${q};18.2`;

describe("bins and classes", () => {
  it.each([[0, 0], [4, 0], [5, 1], [355, 0], [354, 35], [360, 0], [235, 24], [240, 24]])("%s° → bin %s", (deg, bin) => {
    expect(directionBin(deg)).toBe(bin);
  });

  it("classes speeds in knots", () => {
    expect([speedClass(3), speedClass(10), speedClass(10.5), speedClass(20), speedClass(25)]).toEqual([0, 0, 1, 1, 2]);
  });
});

describe("addObservation", () => {
  const index = headerIndex(HEADER);

  function run(lines: string[]) {
    const stations = new Map<string, StationAccumulator>();
    for (const l of lines) addObservation(stations, index, l);
    return stations.get("31069001")!;
  }

  it("counts direction and speed class in knots, calm apart", () => {
    const s = run([
      line("4.0", "240"), // 7.8 kt from 240°
      line("8.0", "240"), // 15.6 kt
      line("12.0", "300"), // 23.3 kt
      line("0.3", "120"), // < 1 kt: calm
      line("2.0", "0"), // DD 0: calm
    ]);
    expect(s.observations).toBe(5);
    expect(s.calm).toBe(2);
    expect(s.counts[24]).toEqual([1, 1, 0]);
    expect(s.counts[30]).toEqual([0, 0, 1]);
    expect(s).toMatchObject({ name: "TOULOUSE-BLAGNAC", latitude: 43.621, longitude: 1.378833, altitudeM: 151 });
  });

  it("skips doubtful, missing and out-of-range values", () => {
    const stations = new Map<string, StationAccumulator>();
    for (const l of [line("4.0", "240", "2"), line("", "240"), line("4.0", ""), line("4.0", "400")]) {
      addObservation(stations, index, l);
    }
    expect(stations.size).toBe(0);
  });

  it("tracks the years covered", () => {
    const s = run([line("4", "90", "1", "2020010100"), line("4", "90", "1", "2024123123")]);
    expect([s.firstYear, s.lastYear]).toEqual([2020, 2024]);
  });

  it("needs 70% of the hours to be representative", () => {
    const s = run([line("4", "90")]);
    expect(representative({ ...s, observations: 30_660 }, 5)).toBe(true);
    expect(representative({ ...s, observations: 30_000 }, 5)).toBe(false);
  });

  it("fails loudly when a column is missing", () => {
    expect(() => headerIndex("NUM_POSTE;NOM_USUEL")).toThrow(/LAT/);
  });
});

const gz = (lines: string[]) => Readable.from(gzipSync(Buffer.from(`${[HEADER, ...lines].join("\n")}\n`)));

describe("aggregateFile", () => {
  it("reads a gzipped department file", async () => {
    const stations = new Map<string, StationAccumulator>();
    const count = await aggregateFile(gz([line("4", "240"), line("5", "250", "1", "2021061513", "31157001")]), stations);
    expect(count).toBe(2);
    expect([...stations.keys()]).toEqual(["31069001", "31157001"]);
  });
});

describe("listPeriodFiles", () => {
  it("keeps the closed 2020-2024 department files from Météo-France's host", async () => {
    const base = "https://meteofrance.s3.sbg.io.cloud.ovh.net/data/synchro_ftp/BASE/HOR";
    const files = await listPeriodFiles(async () => ({
      resources: [
        { url: `${base}/H_31_previous-2020-2024.csv.gz` },
        { url: `${base}/H_971_previous-2020-2024.csv.gz` },
        { url: `${base}/H_31_latest-2025-2026.csv.gz` },
        { url: `${base}/H_31_2010-2019.csv.gz` },
        { url: "https://evil.example/H_31_previous-2020-2024.csv.gz" },
      ],
    }));
    expect(files).toEqual([`${base}/H_31_previous-2020-2024.csv.gz`, `${base}/H_971_previous-2020-2024.csv.gz`]);
  });
});

describe("syncWindClimate", () => {
  function build() {
    const tx = { windClimate: { deleteMany: vi.fn(), createMany: vi.fn() } };
    const prisma = { $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)) };
    return { prisma, tx };
  }

  // One station observed every hour for 5 years would be ~44k lines; 70% of that is enough.
  const year = (station: string) =>
    Array.from({ length: 30_700 }, (_, h) => line("5", String((h % 36) * 10), "1", `202${h % 5}010100`, station));

  it("stores representative stations and drops the others", async () => {
    const { prisma, tx } = build();
    const result = await syncWindClimate(prisma as never, {
      files: ["a", "b"],
      fetch: async (url) => (url === "a" ? gz(year("31069001")) : gz([line("4", "90", "1", "2021010100", "09999001")])),
      minStations: 1,
    });

    expect(result).toMatchObject({ files: 2, stations: 2, imported: 1, failedFiles: [] });
    expect(tx.windClimate.deleteMany).toHaveBeenCalled();
    const row = tx.windClimate.createMany.mock.calls[0]![0].data[0];
    expect(row).toMatchObject({ stationId: "31069001", periodStart: 2020, periodEnd: 2024, observations: 30_700 });
    expect(row.counts).toHaveLength(36);
  });

  it("keeps the current data when a department file fails", async () => {
    const { prisma, tx } = build();
    await expect(
      syncWindClimate(prisma as never, {
        files: ["a", "b"],
        fetch: async (url) => {
          if (url === "b") throw new Error("HTTP 503");
          return gz(year("31069001"));
        },
        minStations: 1,
      }),
    ).rejects.toThrow(/1 fichier/);
    expect(tx.windClimate.deleteMany).not.toHaveBeenCalled();
  });

  it("keeps the current data when too few stations come through", async () => {
    const { prisma, tx } = build();
    await expect(syncWindClimate(prisma as never, { files: ["a"], fetch: async () => gz(year("31069001")) })).rejects.toThrow(
      /stations exploitables/,
    );
    expect(tx.windClimate.deleteMany).not.toHaveBeenCalled();
  });
});
