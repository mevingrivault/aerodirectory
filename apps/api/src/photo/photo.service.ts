import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PhotoStatus } from "@aerodirectory/database";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { ImageService } from "./image.service";
import { ScanService } from "./scan.service";
import { StorageService } from "./storage.service";
import type { UploadedTempFile } from "./upload.middleware";

@Injectable()
export class PhotoService {
  private readonly logger = new Logger(PhotoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly image: ImageService,
    private readonly scan: ScanService,
    private readonly storage: StorageService,
  ) {}

  async upload(
    userId: string,
    aerodromeId: string,
    upload: UploadedTempFile,
    ip?: string,
    userAgent?: string,
  ) {
    const aerodrome = await this.prisma.aerodrome.findUnique({
      where: { id: aerodromeId },
      select: { id: true },
    });

    if (!aerodrome) {
      throw new NotFoundException("Aérodrome introuvable.");
    }

    const record = await this.prisma.photo.create({
      data: {
        userId,
        aerodromeId,
        originalFilename: upload.originalFilename.slice(0, 255),
        storedFilename: "",
        storedKey: "",
        mimeType: "",
        size: upload.size,
        status: PhotoStatus.PENDING,
      },
    });

    let storedKey: string | null = null;

    try {
      const validated = await this.image.validateSource(
        upload.tempFilePath,
        upload.originalFilename,
        upload.declaredMimeType,
      );

      await this.prisma.photo.update({
        where: { id: record.id },
        data: { status: PhotoStatus.SCANNING },
      });

      await this.scan.scan(upload.tempFilePath);

      const processed = await this.image.reencode(validated);

      const stored = await this.storage.upload(
        processed.buffer,
        processed.ext,
        processed.mimeType,
      );
      storedKey = stored.key;

      const final = await this.prisma.photo.update({
        where: { id: record.id },
        data: {
          storedFilename: stored.filename,
          storedKey: stored.key,
          mimeType: processed.mimeType,
          size: processed.size,
          width: processed.width,
          height: processed.height,
          status: PhotoStatus.PENDING,
          rejectedReason: null,
          reviewedAt: null,
          reviewedById: null,
        },
        select: {
          id: true,
          storedKey: true,
          mimeType: true,
          width: true,
          height: true,
          status: true,
          createdAt: true,
          user: { select: { id: true, displayName: true } },
        },
      });

      await this.audit.log({
        userId,
        action: "PHOTO_UPLOAD",
        ip,
        userAgent,
        metadata: { photoId: final.id, aerodromeId },
      });

      return final;
    } catch (error) {
      if (storedKey) {
        await this.storage.delete(storedKey);
      }

      this.logger.warn(
        `Upload photo rejeté pour ${upload.originalFilename}: ${(error as Error).message}`,
      );

      await this.prisma.photo
        .update({
          where: { id: record.id },
          data: {
            status: PhotoStatus.REJECTED,
            rejectedReason: (error as Error).message,
          },
        })
        .catch(() => undefined);

      throw error;
    } finally {
      await upload.cleanup();
    }
  }

  async findById(photoId: string) {
    return this.prisma.photo.findUnique({
      where: { id: photoId, status: PhotoStatus.READY },
      select: {
        id: true,
        storedKey: true,
        mimeType: true,
        user: {
          select: {
            showCommunityPhotos: true,
          },
        },
      },
    });
  }

  async findAnyById(photoId: string) {
    return this.prisma.photo.findUnique({
      where: { id: photoId },
      select: { id: true, storedKey: true, mimeType: true, status: true },
    });
  }

  async listForAerodrome(aerodromeId: string) {
    const photos = await this.prisma.photo.findMany({
      where: { aerodromeId, status: PhotoStatus.READY },
      select: {
        id: true,
        storedKey: true,
        mimeType: true,
        width: true,
        height: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            displayName: true,
            showCommunityProfile: true,
            showCommunityPhotos: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return photos
      .filter((photo) => photo.user.showCommunityPhotos)
      .map((photo) => ({
        ...photo,
        user: {
          id: photo.user.id,
          displayName: photo.user.showCommunityProfile ? photo.user.displayName : null,
        },
      }));
  }

  async delete(photoId: string, userId: string, role: string) {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) {
      throw new NotFoundException("Photo introuvable.");
    }

    const isOwner = photo.userId === userId;
    const isModerator = role === "MODERATOR" || role === "ADMIN";

    if (!isOwner && !isModerator) {
      throw new ForbiddenException("Vous ne pouvez pas supprimer cette photo.");
    }

    await this.storage.delete(photo.storedKey);
    await this.prisma.photo.delete({ where: { id: photoId } });

    await this.audit.log({
      userId,
      action: "PHOTO_DELETE",
      metadata: { photoId, aerodromeId: photo.aerodromeId },
    });
  }
}
