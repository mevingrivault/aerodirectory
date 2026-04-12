import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type {
  AerodromeListCreateInput,
  AerodromeListItemCreateInput,
  AerodromeListUpdateInput,
} from "@aerodirectory/shared";

@Injectable()
export class ListService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureDefaultFavorites(userId: string) {
    const existing = await this.prisma.aerodromeList.findFirst({
      where: { userId, isDefault: true },
      select: { id: true },
    });
    if (existing) return existing.id;

    try {
      const created = await this.prisma.aerodromeList.create({
        data: {
          userId,
          isDefault: true,
          name: "Favoris",
          description: "Liste automatique des aérodromes favoris",
        },
        select: { id: true },
      });
      return created.id;
    } catch {
      const fallback = await this.prisma.aerodromeList.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!fallback) throw new BadRequestException("Impossible d'initialiser la liste par défaut.");
      await this.prisma.aerodromeList.update({
        where: { id: fallback.id },
        data: { isDefault: true },
      });
      return fallback.id;
    }
  }

  private async assertOwnedList(userId: string, listId: string) {
    const list = await this.prisma.aerodromeList.findUnique({
      where: { id: listId },
      select: { id: true, userId: true },
    });

    if (!list) throw new NotFoundException("Liste introuvable");
    if (list.userId !== userId) throw new ForbiddenException("Accès refusé à cette liste");
  }

  async listForUser(userId: string) {
    await this.ensureDefaultFavorites(userId);

    const lists = await this.prisma.aerodromeList.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      include: {
        items: {
          orderBy: { createdAt: "desc" },
          include: {
            aerodrome: {
              select: {
                id: true,
                name: true,
                icaoCode: true,
                city: true,
              },
            },
          },
        },
        _count: { select: { items: true } },
      },
    });

    return lists.map((list) => ({
      ...list,
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
      items: list.items.map((item) => ({
        ...item,
        note: item.note ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
    }));
  }

  async createList(userId: string, input: AerodromeListCreateInput) {
    const name = input.name.trim();

    try {
      const list = await this.prisma.aerodromeList.create({
        data: {
          userId,
          name,
          description: input.description?.trim() || null,
        },
      });
      return {
        ...list,
        createdAt: list.createdAt.toISOString(),
        updatedAt: list.updatedAt.toISOString(),
      };
    } catch {
      throw new BadRequestException("Une liste avec ce nom existe déjà.");
    }
  }

  async updateList(userId: string, listId: string, input: AerodromeListUpdateInput) {
    await this.assertOwnedList(userId, listId);

    const list = await this.prisma.aerodromeList.update({
      where: { id: listId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description === null ? null : input.description.trim() }
          : {}),
      },
    });

    return {
      ...list,
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
    };
  }

  async deleteList(userId: string, listId: string) {
    await this.assertOwnedList(userId, listId);

    const list = await this.prisma.aerodromeList.findUniqueOrThrow({
      where: { id: listId },
      select: { isDefault: true },
    });

    if (list.isDefault) {
      throw new BadRequestException("La liste Favoris par défaut ne peut pas être supprimée.");
    }

    await this.prisma.aerodromeList.delete({ where: { id: listId } });
  }

  async addItem(userId: string, listId: string, input: AerodromeListItemCreateInput) {
    await this.assertOwnedList(userId, listId);

    const aerodrome = await this.prisma.aerodrome.findUnique({
      where: { id: input.aerodromeId },
      select: { id: true },
    });
    if (!aerodrome) throw new NotFoundException("Aérodrome introuvable");

    try {
      const item = await this.prisma.aerodromeListItem.upsert({
        where: {
          listId_aerodromeId: {
            listId,
            aerodromeId: input.aerodromeId,
          },
        },
        update: {
          note: input.note?.trim() || null,
        },
        create: {
          listId,
          aerodromeId: input.aerodromeId,
          note: input.note?.trim() || null,
        },
        include: {
          aerodrome: {
            select: {
              id: true,
              name: true,
              icaoCode: true,
              city: true,
            },
          },
        },
      });

      return {
        ...item,
        note: item.note ?? null,
        createdAt: item.createdAt.toISOString(),
      };
    } catch {
      throw new BadRequestException("Impossible d'ajouter cet aérodrome à la liste.");
    }
  }

  async removeItem(userId: string, listId: string, aerodromeId: string) {
    await this.assertOwnedList(userId, listId);

    await this.prisma.aerodromeListItem.deleteMany({
      where: {
        listId,
        aerodromeId,
      },
    });
  }
}
