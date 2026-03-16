import { Controller, Get, Query } from "@nestjs/common";
import { SearchService } from "./search.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { paginated } from "../common/api-response";
import { Public } from "../common/decorators";
import {
  AerodromeSearchSchema,
  type AerodromeSearchInput,
} from "@aerodirectory/shared";

@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

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
