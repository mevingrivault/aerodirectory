import { describe, it, expect } from "vitest";
import { computeSunTimes } from "./sun";

/**
 * Sun times drive the VFR day/night limits shown on each aerodrome sheet,
 * so they are checked against published ephemerides (to the minute).
 */

const PARIS = { lat: 48.8566, lon: 2.3522 };

function expectNear(iso: string | null, expected: string, toleranceMinutes = 2) {
  expect(iso).not.toBeNull();
  const delta = Math.abs(Date.parse(iso!) - Date.parse(expected)) / 60_000;
  expect(delta).toBeLessThanOrEqual(toleranceMinutes);
}

describe("computeSunTimes", () => {
  it("matches the ephemerides in Paris at the summer solstice", () => {
    const sun = computeSunTimes("2026-06-21", PARIS.lat, PARIS.lon);
    expectNear(sun.sunrise, "2026-06-21T03:47:00Z");
    expectNear(sun.sunset, "2026-06-21T19:58:00Z");
  });

  it("matches the ephemerides in Paris at the winter solstice", () => {
    const sun = computeSunTimes("2026-12-21", PARIS.lat, PARIS.lon);
    expectNear(sun.sunrise, "2026-12-21T07:42:00Z");
    expectNear(sun.sunset, "2026-12-21T15:56:00Z");
  });

  it("puts civil twilight outside sunrise and sunset", () => {
    const sun = computeSunTimes("2026-10-31", PARIS.lat, PARIS.lon);
    expect(Date.parse(sun.civilDawn!)).toBeLessThan(Date.parse(sun.sunrise!));
    expect(Date.parse(sun.civilDusk!)).toBeGreaterThan(Date.parse(sun.sunset!));
  });

  it("bounds the aeronautical day 30 minutes outside sunrise and sunset", () => {
    const sun = computeSunTimes("2026-10-31", PARIS.lat, PARIS.lon);
    expect(Date.parse(sun.sunrise!) - Date.parse(sun.aeronauticalDayStart!)).toBe(30 * 60_000);
    expect(Date.parse(sun.aeronauticalDayEnd!) - Date.parse(sun.sunset!)).toBe(30 * 60_000);
  });

  it("returns the local solar day far west of Greenwich", () => {
    // Tahiti is UTC−10: its evening falls on the next UTC day.
    const sun = computeSunTimes("2026-10-31", -17.55, -149.6);
    expectNear(sun.sunrise, "2026-10-31T15:20:00Z", 3);
    expectNear(sun.sunset, "2026-11-01T04:04:00Z", 3);
  });

  it("returns null times when the sun never sets", () => {
    const sun = computeSunTimes("2026-06-21", 78.22, 15.65); // Svalbard
    expect(sun.sunrise).toBeNull();
    expect(sun.sunset).toBeNull();
    expect(sun.aeronauticalDayStart).toBeNull();
  });
});
