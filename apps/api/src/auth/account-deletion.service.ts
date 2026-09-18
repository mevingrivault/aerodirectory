import { Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../photo/storage.service";

/**
 * The one way to remove an account, shared by self-service deletion and admin
 * deletion so both honour the right to erasure (RGPD art. 17):
 *
 *  1. audit log entries that carry the e-mail are anonymised while the user
 *     row still exists;
 *  2. every stored object (photos, avatar) is removed from S3, and the
 *     deletion is aborted if any removal fails;
 *  3. the user row is deleted, cascading to the rest.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async purge(userId: string): Promise<{ deletedObjects: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        avatarKey: true,
        photos: { select: { storedKey: true } },
      },
    });

    if (!user) {
      throw new NotFoundException("Utilisateur introuvable");
    }

    // 1. Anonymise audit metadata that mentions the e-mail.
    try {
      await this.prisma.auditLog.updateMany({
        where: {
          userId,
          metadata: { path: ["email"], equals: user.email },
        },
        data: { metadata: { anonymized: true } },
      });
    } catch (err) {
      this.logger.error(`Anonymisation des audit logs échouée pour userId=${userId}`, err);
      throw new InternalServerErrorException(
        "Impossible d'anonymiser les logs d'audit. La suppression du compte a été annulée.",
      );
    }

    // 2. Remove every stored object; refuse to continue if one survives.
    const keys = [
      ...user.photos.map((photo) => photo.storedKey).filter((key) => key.length > 0),
      ...(user.avatarKey ? [user.avatarKey] : []),
    ];
    const failedKeys: string[] = [];

    await Promise.all(
      keys.map(async (key) => {
        try {
          await this.storage.delete(key);
        } catch (err) {
          this.logger.error(`Échec suppression S3 key=${key} pour userId=${userId}`, err);
          failedKeys.push(key);
        }
      }),
    );

    if (failedKeys.length > 0) {
      throw new InternalServerErrorException(
        "Certains fichiers n'ont pas pu être supprimés. La suppression du compte a été annulée.",
      );
    }

    // 3. Delete the row; relations cascade.
    await this.prisma.user.delete({ where: { id: userId } });

    return { deletedObjects: keys.length };
  }
}
