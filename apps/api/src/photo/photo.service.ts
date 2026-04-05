import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ImageService } from "./image.service";
import { ScanService } from "./scan.service";
import { StorageService } from "./storage.service";
import { PhotoStatus } from "@aerodirectory/database";

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

  /**
   * Full upload pipeline:
   * UPLOAD → validate type → scan → convert/compress → store → save DB
   */
  async upload(
    userId: string,
    aerodromeId: string,
    buffer: Buffer,
    originalFilename: string,
    ip?: string,
    userAgent?: string,
  ) {
    // Verify aerodrome exists
    const aerodrome = await this.prisma.aerodrome.findUnique({
      where: { id: aerodromeId },
      select: { id: true },
    });
    if (!aerodrome) throw new NotFoundException("Aérodrome introuvable.");

    // Create a PENDING record immediately (for traceability)
    const record = await this.prisma.photo.create({
      data: {
        userId,
        aerodromeId,
        originalFilename: originalFilename.slice(0, 255),
        storedFilename: "",
        storedKey: "",
        mimeType: "",
        size: buffer.length,
        status: PhotoStatus.PENDING,
      },
    });

    try {
      // Step 1: Validate type + process image (magic bytes, HEIC conv, compress)
      await this.prisma.photo.update({
        where: { id: record.id },
        data: { status: PhotoStatus.SCANNING },
      });

      const processed = await this.image.process(buffer, originalFilename);

      // Step 2: Antivirus scan
      await this.scan.scan(processed.buffer);

      // Step 3: Store to S3
      const { key, filename } = await this.storage.upload(
        processed.buffer,
        processed.ext,
        processed.mimeType,
      );

      // Step 4: Finalize DB record
      const final = await this.prisma.photo.update({
        where: { id: record.id },
        data: {
          storedFilename: filename,
          storedKey: key,
          mimeType: processed.mimeType,
          size: processed.size,
          width: processed.width,
          height: processed.height,
          status: PhotoStatus.READY,
        },
        select: {
          id: true,
          storedKey: true,
          mimeType: true,
          width: true,
          height: true,
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
    } catch (err) {
      // Mark as rejected and clean up
      await this.prisma.photo.update({
        where: { id: record.id },
        data: {
          status: PhotoStatus.REJECTED,
          rejectedReason: (err as Error).message,
        },
      }).catch(() => undefined);

      throw err;
    }
  }

  async listForAerodrome(aerodromeId: string) {
    return this.prisma.photo.findMany({
      where: { aerodromeId, status: PhotoStatus.READY },
      select: {
        id: true,
        storedKey: true,
        mimeType: true,
        width: true,
        height: true,
        createdAt: true,
        user: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async delete(photoId: string, userId: string, role: string) {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException("Photo introuvable.");

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
