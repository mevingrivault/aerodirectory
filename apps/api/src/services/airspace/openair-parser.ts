/**
 * OpenAir file format parser — placeholder for future airspace import.
 *
 * OpenAir is a widely used text format for describing airspace geometry
 * (polygons, arcs, circles) used in aviation navigation software.
 *
 * Format reference:
 *   https://github.com/naviter/seeyou_file_formats/blob/main/OpenAir_File_Format_Support.md
 *
 * Supported directives (to be implemented):
 *   AC  — Airspace class (A, B, C, D, E, CTR, TMA, etc.)
 *   AN  — Airspace name
 *   AH  — Upper altitude limit
 *   AL  — Lower altitude limit
 *   DP  — Polygon point (lat/lon)
 *   DC  — Circle (radius in NM from center V)
 *   DA  — Arc (radius, start angle, end angle)
 *   DB  — Arc (between two lat/lon points)
 *   V   — Variable assignment (X= center point, D= direction)
 *
 * This module is NOT yet implemented. It serves as an architectural placeholder
 * so that OpenAir file parsing can be added in a future iteration.
 */

export interface ParsedAirspace {
  name: string;
  class: string;
  lowerLimit: string;
  upperLimit: string;
  /** GeoJSON Polygon coordinates */
  geometry: {
    type: "Polygon";
    coordinates: [number, number][][];
  };
}

export interface OpenAirParseResult {
  airspaces: ParsedAirspace[];
  errors: string[];
}

/**
 * Parse an OpenAir format string into structured airspace data.
 *
 * @param content - Raw OpenAir file content
 * @returns Parsed airspaces and any parsing errors
 *
 * @example
 * ```ts
 * import { parseOpenAirFile } from './openair-parser';
 * const result = parseOpenAirFile(fileContent);
 * console.log(`Parsed ${result.airspaces.length} airspaces`);
 * ```
 */
export function parseOpenAirFile(_content: string): OpenAirParseResult {
  // TODO: Implement OpenAir parsing in a future iteration
  // See format reference above for directive handling
  throw new Error(
    "OpenAir parser not yet implemented. " +
      "This is a placeholder for future airspace import support.",
  );
}

/**
 * Parse a latitude string from OpenAir format.
 * Format: DD:MM:SS N/S  (e.g. "48:51:30 N")
 */
export function parseOpenAirLatitude(_lat: string): number {
  throw new Error("Not yet implemented");
}

/**
 * Parse a longitude string from OpenAir format.
 * Format: DDD:MM:SS E/W  (e.g. "002:21:07 E")
 */
export function parseOpenAirLongitude(_lon: string): number {
  throw new Error("Not yet implemented");
}
