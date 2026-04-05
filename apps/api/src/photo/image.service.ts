import {
  Injectable,
  BadRequestException,
  Logger,
  PayloadTooLargeException,
} from "@nestjs/common";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
]);

// HEIC/HEIF magic bytes (ftyp box at offset 4)
const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"];

const MAX_DIMENSION = 2560; // px
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export interface ProcessedImage {
  buffer: Buffer;
  mimeType: string;
  ext: string;
  width: number;
  height: number;
  size: number;
}

@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name);

  /**
   * Full validation + processing pipeline:
   * 1. Size check
   * 2. Extension check
   * 3. Magic bytes validation (real MIME type)
   * 4. HEIC/HEIF → WebP conversion
   * 5. Sharp compression + resize
   */
  async process(
    buffer: Buffer,
    originalFilename: string,
  ): Promise<ProcessedImage> {
    // 1. Size check
    if (buffer.length > MAX_FILE_SIZE) {
      throw new PayloadTooLargeException(
        `La taille du fichier dépasse la limite de ${MAX_FILE_SIZE / 1024 / 1024} Mo.`,
      );
    }

    // 2. Extension check
    const ext = originalFilename.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        `Extension non autorisée : .${ext}. Formats acceptés : JPEG, PNG, WebP, HEIC.`,
      );
    }

    // 3. Real MIME type detection (magic bytes via file-type, with HEIC fallback)
    const detectedType = await fileTypeFromBuffer(buffer);
    const realMime = detectedType?.mime ?? this.detectHeicFromBuffer(buffer);

    if (!realMime || !ALLOWED_MIME_TYPES.has(realMime)) {
      throw new BadRequestException(
        `Type de fichier non autorisé (${realMime ?? "inconnu"}). Formats acceptés : JPEG, PNG, WebP, HEIC.`,
      );
    }

    // Guard against extension spoofing
    const isHeic = realMime === "image/heic" || realMime === "image/heif";
    const isImage = realMime.startsWith("image/");
    if (!isImage) {
      throw new BadRequestException("Le fichier n'est pas une image valide.");
    }

    // 4 & 5. Process with Sharp (handles HEIC natively on most systems via libvips)
    try {
      let pipeline = sharp(buffer);

      // Convert HEIC/HEIF to WebP
      if (isHeic) {
        pipeline = pipeline.webp({ quality: 85 });
      } else {
        // Optimize each format
        switch (realMime) {
          case "image/jpeg":
            pipeline = pipeline.jpeg({ quality: 85, progressive: true });
            break;
          case "image/png":
            pipeline = pipeline.png({ compressionLevel: 8 });
            break;
          case "image/webp":
            pipeline = pipeline.webp({ quality: 85 });
            break;
        }
      }

      // Resize if too large (preserve aspect ratio)
      pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      });

      const processed = await pipeline.toBuffer({ resolveWithObject: true });
      const outputMime = isHeic ? "image/webp" : realMime;
      const outputExt = this.mimeToExt(outputMime);

      return {
        buffer: processed.data,
        mimeType: outputMime,
        ext: outputExt,
        width: processed.info.width,
        height: processed.info.height,
        size: processed.info.size,
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error("Image processing failed", err);
      throw new BadRequestException("Impossible de traiter l'image. Vérifiez que le fichier n'est pas corrompu.");
    }
  }

  /**
   * Detects HEIC/HEIF by checking the ftyp box at offset 4 in the buffer.
   * file-type doesn't always detect HEIC on all versions.
   */
  private detectHeicFromBuffer(buffer: Buffer): string | null {
    if (buffer.length < 12) return null;
    // ftyp box: bytes 4-7 are "ftyp", bytes 8-11 are the brand
    const marker = buffer.slice(4, 8).toString("ascii");
    if (marker !== "ftyp") return null;
    const brand = buffer.slice(8, 12).toString("ascii").toLowerCase();
    return HEIC_BRANDS.includes(brand) ? "image/heic" : null;
  }

  private mimeToExt(mime: string): string {
    const map: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    return map[mime] ?? "jpg";
  }
}
