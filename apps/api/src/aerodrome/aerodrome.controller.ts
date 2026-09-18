import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Header,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AerodromeService } from "./aerodrome.service";
import { RestaurantService } from "../restaurant/restaurant.service";
import { TransportService } from "../transport/transport.service";
import { AccommodationService } from "../accommodation/accommodation.service";
import { MetarService } from "../metar/metar.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ok, paginated } from "../common/api-response";
import { Public, Roles, CurrentUser } from "../common/decorators";
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
    private readonly metar: MetarService,
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
  @Header("Cache-Control", "public, max-age=600")
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
  @Get("stats")
  async stats() {
    const data = await this.aerodromes.stats();
    return ok(data);
  }

  @Public()
  @Get("featured")
  async featured() {
    const data = await this.aerodromes.featured(3);
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

  // Source data is imported (openAIP, OSM); the API only lets an admin manage
  // the few sheets created by hand (source "manual"), and every change is
  // written to the audit log.
  @Roles("ADMIN")
  @Post()
  async create(
    @Body(new ZodValidationPipe(AerodromeCreateSchema))
    body: AerodromeCreateInput,
    @CurrentUser() user: { sub: string },
    @Req() req: FastifyRequest,
  ) {
    const aerodrome = await this.aerodromes.create(body, {
      adminId: user.sub,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return ok(aerodrome);
  }

  @Roles("ADMIN")
  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AerodromeUpdateSchema))
    body: AerodromeUpdateInput,
    @CurrentUser() user: { sub: string },
    @Req() req: FastifyRequest,
  ) {
    const aerodrome = await this.aerodromes.update(id, body, {
      adminId: user.sub,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return ok(aerodrome);
  }

  @Roles("ADMIN")
  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: { sub: string },
    @Req() req: FastifyRequest,
  ) {
    await this.aerodromes.delete(id, {
      adminId: user.sub,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
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

  @Public()
  @Get(":id/weather")
  async getWeather(@Param("id") id: string) {
    const aerodrome = await this.aerodromes.findById(id);
    const result = await this.metar.getWeather(
      aerodrome.icaoCode ?? null,
      aerodrome.latitude,
      aerodrome.longitude,
    );
    return ok(result);
  }
}
