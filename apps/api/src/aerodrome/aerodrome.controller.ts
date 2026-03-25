import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
} from "@nestjs/common";
import { AerodromeService } from "./aerodrome.service";
import { RestaurantService } from "../restaurant/restaurant.service";
import { TransportService } from "../transport/transport.service";
import { AccommodationService } from "../accommodation/accommodation.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ok, paginated } from "../common/api-response";
import { Public, Roles } from "../common/decorators";
import {
  AerodromeCreateSchema,
  AerodromeUpdateSchema,
  PaginationSchema,
  NearbySchema,
  type AerodromeCreateInput,
  type AerodromeUpdateInput,
  type PaginationInput,
  type NearbyInput,
} from "@aerodirectory/shared";

const MAX_RESTAURANT_RADIUS = 10_000;
const DEFAULT_RESTAURANT_RADIUS = 3_000;
const MAX_TRANSPORT_RADIUS = 10_000;
const DEFAULT_TRANSPORT_RADIUS = 3_000;
const MAX_ACCOMMODATION_RADIUS = 20_000;
const DEFAULT_ACCOMMODATION_RADIUS = 10_000;

@Controller("aerodromes")
export class AerodromeController {
  constructor(
    private readonly aerodromes: AerodromeService,
    private readonly restaurants: RestaurantService,
    private readonly transport: TransportService,
    private readonly accommodation: AccommodationService,
  ) {}

  @Public()
  @Get()
  async list(
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationInput,
  ) {
    const { data, total } = await this.aerodromes.list(
      query.page,
      query.limit,
    );
    return paginated(data, total, query.page, query.limit);
  }

  @Public()
  @Get("map")
  async mapMarkers(@Query("q") q?: string) {
    const data = await this.aerodromes.findAllMarkers(q);
    return ok(data);
  }

  @Public()
  @Get("nearby")
  async nearby(
    @Query(new ZodValidationPipe(NearbySchema)) query: NearbyInput,
  ) {
    const data = await this.aerodromes.findNearby(
      query.lat,
      query.lng,
      query.radiusKm,
      query.limit,
      query.hasFuel,
    );
    return ok(data);
  }

  @Public()
  @Get(":id")
  async findById(@Param("id") id: string) {
    const aerodrome = await this.aerodromes.findById(id);
    return ok(aerodrome);
  }

  @Public()
  @Get("icao/:code")
  async findByIcao(@Param("code") code: string) {
    const aerodrome = await this.aerodromes.findByIcao(code.toUpperCase());
    return ok(aerodrome);
  }

  @Roles("ADMIN", "MODERATOR")
  @Post()
  async create(
    @Body(new ZodValidationPipe(AerodromeCreateSchema))
    body: AerodromeCreateInput,
  ) {
    const aerodrome = await this.aerodromes.create(body);
    return ok(aerodrome);
  }

  @Roles("ADMIN", "MODERATOR")
  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AerodromeUpdateSchema))
    body: AerodromeUpdateInput,
  ) {
    const aerodrome = await this.aerodromes.update(id, body);
    return ok(aerodrome);
  }

  @Roles("ADMIN")
  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.aerodromes.delete(id);
    return ok({ deleted: true });
  }

  @Public()
  @Get(":id/restaurants")
  async getNearbyRestaurants(
    @Param("id") id: string,
    @Query("radiusMeters") radiusMeters?: string,
  ) {
    const radius = radiusMeters
      ? Math.min(Math.max(parseInt(radiusMeters, 10) || DEFAULT_RESTAURANT_RADIUS, 500), MAX_RESTAURANT_RADIUS)
      : DEFAULT_RESTAURANT_RADIUS;

    const result = await this.restaurants.getNearbyRestaurants(id, radius);
    return ok(result);
  }

  @Public()
  @Get(":id/transports")
  async getNearbyTransport(
    @Param("id") id: string,
    @Query("radiusMeters") radiusMeters?: string,
  ) {
    const radius = radiusMeters
      ? Math.min(Math.max(parseInt(radiusMeters, 10) || DEFAULT_TRANSPORT_RADIUS, 500), MAX_TRANSPORT_RADIUS)
      : DEFAULT_TRANSPORT_RADIUS;

    const result = await this.transport.getNearbyTransport(id, radius);
    return ok(result);
  }

  @Public()
  @Get(":id/accommodations")
  async getNearbyAccommodations(
    @Param("id") id: string,
    @Query("radiusMeters") radiusMeters?: string,
  ) {
    const radius = radiusMeters
      ? Math.min(Math.max(parseInt(radiusMeters, 10) || DEFAULT_ACCOMMODATION_RADIUS, 500), MAX_ACCOMMODATION_RADIUS)
      : DEFAULT_ACCOMMODATION_RADIUS;

    const result = await this.accommodation.getNearbyAccommodations(id, radius);
    return ok(result);
  }
}
