import { Controller, Get, Query, BadRequestException } from "@nestjs/common";
import { Public } from "../common/decorators";
import { ok } from "../common/api-response";
import { AirspaceService } from "./airspace.service";

@Controller("airspaces")
export class AirspaceController {
  constructor(private readonly airspaces: AirspaceService) {}

  /**
   * GET /api/v1/airspaces
   * Returns all French airspaces (full geometry) — used to populate the map layer.
   * Optional query params:
   *   - icaoClass: A|B|C|D|E|F|G|SPC
   *   - type: integer (0-26)
   *   - minLat, minLng, maxLat, maxLng: bounding box filter
   */
  @Public()
  @Get()
  async list(
    @Query("icaoClass") icaoClass?: string,
    @Query("type") typeStr?: string,
    @Query("minLat") minLatStr?: string,
    @Query("minLng") minLngStr?: string,
    @Query("maxLat") maxLatStr?: string,
    @Query("maxLng") maxLngStr?: string,
  ) {
    const type = typeStr !== undefined ? parseInt(typeStr, 10) : undefined;
    if (typeStr !== undefined && (isNaN(type!) || type! < 0)) {
      throw new BadRequestException("type doit être un entier positif");
    }

    const hasBbox = minLatStr !== undefined && minLngStr !== undefined && maxLatStr !== undefined && maxLngStr !== undefined;
    if (hasBbox) {
      const minLat = parseFloat(minLatStr!);
      const minLng = parseFloat(minLngStr!);
      const maxLat = parseFloat(maxLatStr!);
      const maxLng = parseFloat(maxLngStr!);
      if ([minLat, minLng, maxLat, maxLng].some(isNaN)) {
        throw new BadRequestException("Paramètres bbox invalides");
      }
      const data = await this.airspaces.findByBbox(minLat, minLng, maxLat, maxLng, icaoClass, type);
      return ok(data);
    }

    const data = await this.airspaces.findAll(icaoClass, type);
    return ok(data);
  }
}
