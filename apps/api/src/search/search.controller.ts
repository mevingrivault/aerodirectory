import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SearchService } from "./search.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ok, paginated } from "../common/api-response";
import { CurrentUser, Public } from "../common/decorators";
import {
  AerodromeSearchSchema,
  PublicSavedSearchListQuerySchema,
  SavedSearchCreateSchema,
  SavedSearchListQuerySchema,
  SavedSearchVisibilitySchema,
  type AerodromeSearchInput,
  type PublicSavedSearchListQueryInput,
  type SavedSearchCreateInput,
  type SavedSearchListQueryInput,
  type SavedSearchVisibilityInput,
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

  @Put("saved/:id")
  async updateSavedSearchVisibility(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SavedSearchVisibilitySchema))
    body: SavedSearchVisibilityInput,
  ) {
    const updated = await this.search.updateSavedSearchVisibility(user.sub, id, body);
    return ok(updated);
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
  @Get("public/:userId")
  async listPublicSavedSearches(
    @Param("userId") userId: string,
    @Query(new ZodValidationPipe(PublicSavedSearchListQuerySchema))
    query: PublicSavedSearchListQueryInput,
  ) {
    return ok(await this.search.listPublicSavedSearches(userId, query));
  }

  @Public()
  @Get("public/:userId/similar")
  async listSimilarPublicSearches(@Param("userId") userId: string) {
    return ok(await this.search.listSimilarPublicSearches(userId));
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
