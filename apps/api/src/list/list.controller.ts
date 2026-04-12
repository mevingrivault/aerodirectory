import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { ListService } from "./list.service";
import { CurrentUser } from "../common/decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ok } from "../common/api-response";
import {
  AerodromeListCreateSchema,
  AerodromeListItemCreateSchema,
  AerodromeListUpdateSchema,
  type AerodromeListCreateInput,
  type AerodromeListItemCreateInput,
  type AerodromeListUpdateInput,
} from "@aerodirectory/shared";

@Controller("lists")
export class ListController {
  constructor(private readonly lists: ListService) {}

  @Get()
  async list(@CurrentUser() user: { sub: string }) {
    return ok(await this.lists.listForUser(user.sub));
  }

  @Post()
  async create(
    @CurrentUser() user: { sub: string },
    @Body(new ZodValidationPipe(AerodromeListCreateSchema)) body: AerodromeListCreateInput,
  ) {
    return ok(await this.lists.createList(user.sub, body));
  }

  @Put(":listId")
  async update(
    @CurrentUser() user: { sub: string },
    @Param("listId") listId: string,
    @Body(new ZodValidationPipe(AerodromeListUpdateSchema)) body: AerodromeListUpdateInput,
  ) {
    return ok(await this.lists.updateList(user.sub, listId, body));
  }

  @Delete(":listId")
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() user: { sub: string },
    @Param("listId") listId: string,
  ) {
    await this.lists.deleteList(user.sub, listId);
    return ok({ deleted: true });
  }

  @Post(":listId/items")
  async addItem(
    @CurrentUser() user: { sub: string },
    @Param("listId") listId: string,
    @Body(new ZodValidationPipe(AerodromeListItemCreateSchema)) body: AerodromeListItemCreateInput,
  ) {
    return ok(await this.lists.addItem(user.sub, listId, body));
  }

  @Delete(":listId/items/:aerodromeId")
  @HttpCode(HttpStatus.OK)
  async removeItem(
    @CurrentUser() user: { sub: string },
    @Param("listId") listId: string,
    @Param("aerodromeId") aerodromeId: string,
  ) {
    await this.lists.removeItem(user.sub, listId, aerodromeId);
    return ok({ deleted: true });
  }
}
