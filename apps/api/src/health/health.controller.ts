import { Controller, Get } from "@nestjs/common";
import { Public } from "../common/decorators";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: "ok",
        timestamp: new Date().toISOString(),
        database: "connected",
      };
    } catch {
      return {
        status: "degraded",
        timestamp: new Date().toISOString(),
        database: "disconnected",
      };
    }
  }
}
