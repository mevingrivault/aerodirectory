import { describe, it, expect } from "vitest";
import { PATH_METADATA } from "@nestjs/common/constants";
import { getSourceScheduleDescription, SYNC_SOURCES } from "./sync.schedule";
import { SyncController } from "./sync.controller";

/**
 * In production the imports can only run inside the sync worker (the
 * database and S3 are not reachable from the host), so every source must be
 * schedulable and triggerable from the admin page.
 */

describe("sync sources", () => {
  it("includes the OurAirports and Commons imports", () => {
    expect(SYNC_SOURCES).toEqual(expect.arrayContaining(["OURAIRPORTS", "COMMONS", "OBSTACLES", "PROTECTED_AREAS", "WIND_CLIMATE", "AERIAL_LINES", "CAM_AERO"]));
  });

  it.each(SYNC_SOURCES)("describes the schedule of %s", (source) => {
    expect(getSourceScheduleDescription(source)).not.toBe("Planification inconnue");
  });

  it("is what the admin trigger route accepts", () => {
    expect(Reflect.getMetadata(PATH_METADATA, SyncController.prototype.trigger)).toBe(":source");
  });
});
