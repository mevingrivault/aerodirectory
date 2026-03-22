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

@Controller("aerodromes")
export class AerodromeController {
  constructor(private readonly aerodromes: AerodromeService) {}

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
}
