import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type {
  AerodromeCreateInput,
  AerodromeUpdateInput,
} from "@aerodirectory/shared";

@Injectable()
export class AerodromeService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const aerodrome = await this.prisma.aerodrome.findUnique({
      where: { id },
      include: {
        runways: true,
        frequencies: true,
        fuels: true,
        _count: { select: { visits: true, comments: true } },
      },
    });

    if (!aerodrome) {
      throw new NotFoundException("Aerodrome not found");
    }

    return aerodrome;
  }

  async findByIcao(icaoCode: string) {
    const aerodrome = await this.prisma.aerodrome.findUnique({
      where: { icaoCode },
      include: {
        runways: true,
        frequencies: true,
        fuels: true,
        _count: { select: { visits: true, comments: true } },
      },
    });

    if (!aerodrome) {
      throw new NotFoundException("Aerodrome not found");
    }

    return aerodrome;
  }

  async create(input: AerodromeCreateInput) {
    const { runways, frequencies, fuels, ...data } = input;

    return this.prisma.aerodrome.create({
      data: {
        ...data,
        runways: runways ? { create: runways } : undefined,
        frequencies: frequencies ? { create: frequencies } : undefined,
        fuels: fuels ? { create: fuels } : undefined,
      },
      include: {
        runways: true,
        frequencies: true,
        fuels: true,
      },
    });
  }

  async update(id: string, input: AerodromeUpdateInput) {
    // Verify exists
    await this.findById(id);

    const { runways, frequencies, fuels, ...data } = input;

    return this.prisma.aerodrome.update({
      where: { id },
      data: {
        ...data,
        // For nested updates, replace all related records
        ...(runways && {
          runways: {
            deleteMany: {},
            create: runways,
          },
        }),
        ...(frequencies && {
          frequencies: {
            deleteMany: {},
            create: frequencies,
          },
        }),
        ...(fuels && {
          fuels: {
            deleteMany: {},
            create: fuels,
          },
        }),
      },
      include: {
        runways: true,
        frequencies: true,
        fuels: true,
      },
    });
  }

  async delete(id: string) {
    await this.findById(id);
    await this.prisma.aerodrome.delete({ where: { id } });
  }

  async list(page: number, limit: number) {
    const [data, total] = await Promise.all([
      this.prisma.aerodrome.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: "asc" },
        include: {
          runways: true,
          _count: { select: { visits: true, comments: true } },
        },
      }),
      this.prisma.aerodrome.count(),
    ]);

    return { data, total };
  }
}
