import { describe, expect, it, vi } from "vitest";
import {
  MIN_EXPECTED_WEBCAMS,
  humanizeCamName,
  normalizeCamAeroList,
  syncCamAeroWebcams,
} from "./cam-aero.importer";

/** Shape of https://cam-aero.eu/raspicamaero/mosaic/list (November 2026). */
const cam = (lfxx_acb: string, old = false) => ({ id: "x", lfxx_acb, time: 1793653200, old, replay: true });

describe("humanizeCamName", () => {
  it("splits camel case, underscores and trailing numbers", () => {
    expect(humanizeCamName("AeroclubDuBearn")).toBe("Aeroclub Du Bearn");
    expect(humanizeCamName("Aeroclub_Albi")).toBe("Aeroclub Albi");
    expect(humanizeCamName("AeroclubMarcelDassault2")).toBe("Aeroclub Marcel Dassault 2");
  });
});

describe("normalizeCamAeroList", () => {
  it("keeps active cameras on French ICAO fields and builds the viewer URL", () => {
    const webcams = normalizeCamAeroList({
      cams: [
        cam("LFBP_AeroclubDuBearn"),
        cam("LFAD_ACCM60", true), // no image for months
        cam("LF4724_MontpezatDAgenais"), // ULM field code, not ICAO
        cam("EBAV_AeroClubHesbaye"), // Belgium
        cam("LFBP_<script>"), // not a camera name
      ],
    });

    expect(webcams).toEqual([
      {
        sourceId: "LFBP_AeroclubDuBearn",
        icaoCode: "LFBP",
        label: "Aeroclub Du Bearn",
        pageUrl: "https://cam-aero.eu/raspicamaero/LFBP_AeroclubDuBearn/img",
        lastImageAt: new Date(1793653200 * 1000),
      },
    ]);
  });

  it("rejects an answer that is not the camera list", () => {
    expect(() => normalizeCamAeroList({ error: "maintenance" })).toThrow();
  });
});

describe("syncCamAeroWebcams", () => {
  const prismaWith = (icaoCodes: string[]) => {
    const tx = { webcam: { deleteMany: vi.fn(), createMany: vi.fn() } };
    return {
      tx,
      prisma: {
        aerodrome: {
          findMany: vi.fn().mockResolvedValue(icaoCodes.map((icaoCode) => ({ id: `ad-${icaoCode}`, icaoCode }))),
        },
        $transaction: vi.fn((fn: (t: typeof tx) => Promise<void>) => fn(tx)),
      },
    };
  };
  const list = (n: number) => ({
    cams: Array.from({ length: n }, (_, i) => cam(`LF${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}_Club`)),
  });

  it("keeps the previous list when the answer looks truncated", async () => {
    const { prisma } = prismaWith([]);
    await expect(syncCamAeroWebcams(prisma as never, async () => list(MIN_EXPECTED_WEBCAMS - 1))).rejects.toThrow(
      /conservée/,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("links cameras to known aerodromes and reports the others", async () => {
    const { prisma, tx } = prismaWith(["LFAA", "LFAB"]);
    const result = await syncCamAeroWebcams(prisma as never, async () => list(MIN_EXPECTED_WEBCAMS));

    expect(result.imported).toBe(2);
    expect(result.unknownIcao).toHaveLength(MIN_EXPECTED_WEBCAMS - 2);
    expect(tx.webcam.deleteMany).toHaveBeenCalled();
    expect(tx.webcam.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ aerodromeId: "ad-LFAA", sourceId: "LFAA_Club" }),
        expect.objectContaining({ aerodromeId: "ad-LFAB", sourceId: "LFAB_Club" }),
      ],
    });
  });
});
