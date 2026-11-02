import { describe, it, expect } from "vitest";
import {
  cleanText,
  normalizeOpenAipAirport,
  normalizeOpeningHours,
  normalizePhones,
} from "./openaip.normalizer";
import type { OpenAipAirport } from "../../openaip/openaip.client";

/**
 * Contacts and opening hours come from openAIP's free-form fields and are
 * shown as-is on the sheet (phone numbers become tel: links).
 */

const AIRPORT: OpenAipAirport = {
  _id: "abc",
  name: "Toussus-le-Noble",
  icaoCode: "LFPN",
  type: 2,
  country: "FR",
  geometry: { type: "Point", coordinates: [2.1061, 48.7519] },
};

describe("normalizePhones", () => {
  it("keeps valid numbers with their label, once each", () => {
    expect(
      normalizePhones([
        { name: " Aéroclub ", phoneNumber: "+33 1 39 56 00 00", remarks: "Week-ends" },
        { name: "AFIS", phoneNumber: "01.39.56.11.11" },
        { name: "Doublon", phoneNumber: "+33139560000" },
        { name: "Pas un numéro", phoneNumber: "voir site web" },
        { name: "Trop court", phoneNumber: "112" },
      ]),
    ).toEqual([
      { label: "Aéroclub", number: "+33 1 39 56 00 00", remarks: "Week-ends" },
      { label: "AFIS", number: "01.39.56.11.11", remarks: null },
    ]);
  });
});

describe("normalizeOpeningHours", () => {
  it("maps days, times and sunrise/sunset, in week order", () => {
    expect(
      normalizeOpeningHours([
        { dayOfWeek: 6, startTime: "09:00:00", endTime: "12:00", sunrise: false, sunset: false, byNotam: false, publicHolidaysExcluded: false },
        { dayOfWeek: 0, sunrise: true, sunset: true, byNotam: false, publicHolidaysExcluded: true, remarks: " PPR " },
        { dayOfWeek: 2, sunrise: false, sunset: false, byNotam: true, publicHolidaysExcluded: false },
        { dayOfWeek: 9, startTime: "08:00", endTime: "10:00" },
      ]),
    ).toEqual([
      { day: 0, from: "SR", to: "SS", byNotam: false, holidaysExcluded: true, remarks: "PPR" },
      { day: 2, from: null, to: null, byNotam: true, holidaysExcluded: false, remarks: null },
      { day: 6, from: "09:00", to: "12:00", byNotam: false, holidaysExcluded: false, remarks: null },
    ]);
  });
});

describe("cleanText", () => {
  it("collapses spaces, keeps paragraphs and caps the length", () => {
    expect(cleanText("  Radio   obligatoire\r\n\r\n\r\n  PPR  ", 100)).toBe("Radio obligatoire\n\nPPR");
    expect(cleanText("   ", 100)).toBeNull();
    expect(cleanText("abcdef", 4)).toBe("abc…");
  });
});

describe("normalizeOpenAipAirport", () => {
  it("carries the contact fields", () => {
    const normalized = normalizeOpenAipAirport({
      ...AIRPORT,
      contact: "Aéroclub de Toussus",
      remarks: "Circuit main gauche",
      telephoneServices: [{ name: "Club", phoneNumber: "+33 1 00 00 00 00" }],
    });
    expect(normalized).toMatchObject({
      contactInfo: "Aéroclub de Toussus",
      sourceRemarks: "Circuit main gauche",
      phones: [{ label: "Club", number: "+33 1 00 00 00 00", remarks: null }],
      openingHours: [],
    });
  });

  it("changes the hash when the normalizer version does, so existing sheets get the new fields", () => {
    const hash = normalizeOpenAipAirport(AIRPORT).sourceRawHash;
    // Same raw data, same hash…
    expect(normalizeOpenAipAirport({ ...AIRPORT }).sourceRawHash).toBe(hash);
    // …and it is not the plain hash of the raw JSON stored before version 2.
    let legacy = 0;
    const raw = JSON.stringify(AIRPORT);
    for (let i = 0; i < raw.length; i++) legacy = ((legacy << 5) - legacy + raw.charCodeAt(i)) | 0;
    expect(hash).not.toBe(legacy.toString(36));
  });
});
