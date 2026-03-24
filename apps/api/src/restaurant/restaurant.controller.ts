import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { RestaurantService } from "./restaurant.service";
import { Public } from "../common/decorators";
import { ok } from "../common/api-response";

const MAX_RADIUS = 10_000;
const DEFAULT_RADIUS = 5_000;

@Controller("restaurants")
export class RestaurantController {
  constructor(private readonly restaurants: RestaurantService) {}

  @Public()
  @Get("search")
  async search(
    @Query("lat") lat: string,
    @Query("lon") lon: string,
    @Query("radiusMeters") radiusMeters?: string,
    @Query("q") q?: string,
  ) {
    const latN = parseFloat(lat);
    const lonN = parseFloat(lon);
    if (isNaN(latN) || isNaN(lonN)) {
      throw new BadRequestException("Les paramètres lat et lon sont requis");
    }
    const radius = Math.min(
      Math.max(parseInt(radiusMeters ?? String(DEFAULT_RADIUS), 10) || DEFAULT_RADIUS, 500),
      MAX_RADIUS,
    );
    const results = await this.restaurants.searchNearby(latN, lonN, radius, q);
    return ok(results);
  }
}
