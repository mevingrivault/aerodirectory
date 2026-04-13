import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { SearchService } from "./search.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ok, paginated } from "../common/api-response";
import { CurrentUser, Public } from "../common/decorators";
import {
  AerodromeSearchSchema,
  SavedSearchCreateSchema,
  SavedSearchListQuerySchema,
  type AerodromeSearchInput,
  type SavedSearchCreateInput,
  type SavedSearchListQueryInput,
} from "@aerodirectory/shared";

@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get("saved")
  async listSavedSearches(
    @CurrentUser() user: { sub: string },
    @Query(new ZodValidationPipe(SavedSearchListQuerySchema))
    query: SavedSearchListQueryInput,
  ) {
    return ok(await this.search.listSavedSearches(user.sub, query.scope ?? "search"));
  }

  @Post("saved")
  async saveSearch(
    @CurrentUser() user: { sub: string },
    @Body(new ZodValidationPipe(SavedSearchCreateSchema))
    body: SavedSearchCreateInput,
  ) {
    const created = await this.search.createSavedSearch(user.sub, body);
    return ok(created);
  }

  @Delete("saved/:id")
  async deleteSavedSearch(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
  ) {
    await this.search.deleteSavedSearch(user.sub, id);
    return ok({ deleted: true });
  }

  @Public()
  @Get()
  async searchAerodromes(
    @Query(new ZodValidationPipe(AerodromeSearchSchema))
    query: AerodromeSearchInput,
  ) {
    const { data, total } = await this.search.search(query);
    return paginated(data, total, query.page, query.limit);
  }
}
