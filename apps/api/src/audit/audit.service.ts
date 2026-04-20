import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { AuditAction, Prisma } from "@aerodirectory/database";

export interface AuditLogEntry {
  userId?: string;
  action: AuditAction;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Anonymise une adresse IP (RGPD Art. 5 — minimisation des données) :
 * - IPv4 : supprime le dernier octet  →  192.168.1.42 → 192.168.1.0
 * - IPv6 : garde les 48 premiers bits →  2001:db8:85a3::8a2e:0370:7334 → 2001:db8:85a3::
 */
function anonymizeIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  // IPv4
  if (ip.includes(".") && !ip.includes(":")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      parts[3] = "0";
      return parts.join(".");
    }
  }
  // IPv6 (ou IPv4-mapped ::ffff:x.x.x.x)
  if (ip.includes(":")) {
    // On ne conserve que le /48 : on coupe après les 3 premiers groupes
    const groups = ip.split(":");
    return groups.slice(0, 3).join(":") + "::";
  }
  return undefined; // format inconnu → ne pas stocker
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    // Fire-and-forget — audit logging should not block the request
    this.prisma.auditLog
      .create({
        data: {
          userId: entry.userId,
          action: entry.action,
          ip: anonymizeIp(entry.ip),
          userAgent: entry.userAgent,
          metadata: entry.metadata as Prisma.InputJsonValue | undefined,
        },
      })
      .catch((err) => {
        this.logger.error("Failed to write audit log", err);
      });
  }

  async getByUser(userId: string, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  // RGPD Art. 5(1)(e) — durée de conservation limitée à 3 ans
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeExpiredLogs(): Promise<void> {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 3);

    try {
      const { count } = await this.prisma.auditLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (count > 0) {
        this.logger.log(`Purge RGPD : ${count} audit log(s) supprimé(s) (antérieurs au ${cutoff.toISOString()})`);
      }
    } catch (err) {
      this.logger.error("Échec de la purge des audit logs expirés", err);
    }
  }
}
