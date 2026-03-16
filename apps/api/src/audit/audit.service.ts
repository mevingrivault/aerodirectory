import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditAction } from "@aerodirectory/database";

export interface AuditLogEntry {
  userId?: string;
  action: AuditAction;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    // Fire-and-forget — audit logging should not block the request
    this.prisma.auditLog
      .create({
        data: {
          userId: entry.userId,
          action: entry.action,
          ip: entry.ip,
          userAgent: entry.userAgent,
          metadata: entry.metadata ?? undefined,
        },
      })
      .catch((err) => {
        console.error("Failed to write audit log:", err);
      });
  }

  async getByUser(userId: string, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}
