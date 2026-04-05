import {
  Injectable,
  BadRequestException,
  Logger,
  PayloadTooLargeException,
} from "@nestjs/common";
import sharp from "sharp";

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

    // 3. Real MIME type detection (magic bytes)
    const realMime = this.detectMimeFromBuffer(buffer);

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
   * Detects MIME type from magic bytes (no external library needed).
   */
  private detectMimeFromBuffer(buffer: Buffer): string | null {
    if (buffer.length < 12) return null;
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
    // WebP: RIFF....WEBP
    if (buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
    // HEIC/HEIF: ftyp box at offset 4
    const marker = buffer.slice(4, 8).toString("ascii");
    if (marker === "ftyp") {
      const brand = buffer.slice(8, 12).toString("ascii").toLowerCase();
      if (HEIC_BRANDS.includes(brand)) return "image/heic";
    }
    return null;
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
