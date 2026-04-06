import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFile, stat } from "fs/promises";
import { extname } from "path";
import sharp from "sharp";
import {
  PHOTO_ALLOWED_EXTENSIONS,
  PHOTO_ALLOWED_MIME_TYPES,
  PHOTO_MAX_HEIGHT,
  PHOTO_MAX_INPUT_PIXELS,
  PHOTO_MAX_UPLOAD_BYTES,
  PHOTO_MAX_WIDTH,
  type AllowedPhotoMimeType,
  type NormalizedPhotoMimeType,
} from "./photo.constants";

export interface ValidatedImageSource {
  sourceBuffer: Buffer;
  sourceMimeType: AllowedPhotoMimeType;
  outputMimeType: NormalizedPhotoMimeType;
  outputExtension: "jpg" | "webp";
  width: number;
  height: number;
}

export interface ProcessedImage {
  buffer: Buffer;
  mimeType: NormalizedPhotoMimeType;
  ext: "jpg" | "webp";
  width: number;
  height: number;
  size: number;
}

@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name);
  private readonly maxBytes: number;
  private readonly maxWidth: number;
  private readonly maxHeight: number;
  private readonly maxInputPixels: number;

  constructor(private readonly config: ConfigService) {
    this.maxBytes = this.getPositiveNumber("PHOTO_MAX_UPLOAD_BYTES", PHOTO_MAX_UPLOAD_BYTES);
    this.maxWidth = this.getPositiveNumber("PHOTO_MAX_WIDTH", PHOTO_MAX_WIDTH);
    this.maxHeight = this.getPositiveNumber("PHOTO_MAX_HEIGHT", PHOTO_MAX_HEIGHT);
    this.maxInputPixels = this.getPositiveNumber("PHOTO_MAX_INPUT_PIXELS", PHOTO_MAX_INPUT_PIXELS);
  }

  async validateSource(
    tempFilePath: string,
    originalFilename: string,
    declaredMimeType?: string,
  ): Promise<ValidatedImageSource> {
    const fileStats = await stat(tempFilePath);
    if (fileStats.size === 0) {
      throw new BadRequestException("Le fichier envoyé est vide.");
    }

    if (fileStats.size > this.maxBytes) {
      throw new PayloadTooLargeException(
        `La taille maximale autorisée est de ${Math.floor(this.maxBytes / 1024 / 1024)} Mo.`,
      );
    }

    const extension = extname(originalFilename).replace(".", "").toLowerCase();
    if (extension && !PHOTO_ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException(
        `Extension non autorisée: .${extension}. Formats acceptés: JPEG, PNG, WebP, HEIC, HEIF.`,
      );
    }

    const sourceBuffer = await readFile(tempFilePath);
    const detectedType = await this.detectFileType(sourceBuffer);

    if (!detectedType || !PHOTO_ALLOWED_MIME_TYPES.has(detectedType.mime)) {
      throw new BadRequestException(
        `Le fichier n'est pas une image autorisée (${detectedType?.mime ?? "type inconnu"}).`,
      );
    }

    if (declaredMimeType && declaredMimeType !== detectedType.mime) {
      this.logger.warn(
        `MIME déclaré incohérent pour ${originalFilename}: ${declaredMimeType} -> ${detectedType.mime}`,
      );
    }

    const metadata = await sharp(sourceBuffer, {
      limitInputPixels: this.maxInputPixels,
      failOn: "error",
    }).metadata();

    if (!metadata.width || !metadata.height) {
      throw new BadRequestException("Impossible de lire les dimensions de l'image.");
    }

    const outputMimeType: NormalizedPhotoMimeType =
      detectedType.mime === "image/jpeg" && !metadata.hasAlpha
        ? "image/jpeg"
        : "image/webp";

    return {
      sourceBuffer,
      sourceMimeType: detectedType.mime,
      outputMimeType,
      outputExtension: outputMimeType === "image/jpeg" ? "jpg" : "webp",
      width: metadata.width,
      height: metadata.height,
    };
  }

  async reencode(source: ValidatedImageSource): Promise<ProcessedImage> {
    try {
      let pipeline = sharp(source.sourceBuffer, {
        limitInputPixels: this.maxInputPixels,
        failOn: "error",
      })
        .rotate()
        .resize({
          width: this.maxWidth,
          height: this.maxHeight,
          fit: "inside",
          withoutEnlargement: true,
        });

      pipeline =
        source.outputMimeType === "image/jpeg"
          ? pipeline.jpeg({
              quality: 86,
              mozjpeg: true,
              progressive: true,
            })
          : pipeline.webp({
              quality: 86,
              effort: 4,
            });

      const processed = await pipeline.toBuffer({ resolveWithObject: true });

      if (processed.info.size > this.maxBytes) {
        throw new PayloadTooLargeException(
          `Le fichier dépasse la taille maximale autorisée de ${Math.floor(this.maxBytes / 1024 / 1024)} Mo après traitement.`,
        );
      }

      if (!processed.info.width || !processed.info.height) {
        throw new BadRequestException("Le traitement de l'image n'a pas produit de dimensions valides.");
      }

      return {
        buffer: processed.data,
        mimeType: source.outputMimeType,
        ext: source.outputExtension,
        width: processed.info.width,
        height: processed.info.height,
        size: processed.info.size,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof PayloadTooLargeException
      ) {
        throw error;
      }

      this.logger.error(
        `Échec du re-encodage de l'image: ${(error as Error).message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadRequestException(
        "Impossible de traiter cette image. Vérifiez qu'elle n'est pas corrompue.",
      );
    }
  }

  private async detectFileType(
    sourceBuffer: Buffer,
  ): Promise<{ ext: string; mime: AllowedPhotoMimeType } | null> {
    const fileTypeModule = (await import("file-type")) as {
      fileTypeFromBuffer: (
        buffer: Buffer,
      ) => Promise<{ ext: string; mime: string } | undefined>;
    };

    const detected = await fileTypeModule.fileTypeFromBuffer(sourceBuffer);
    if (!detected) {
      return null;
    }

    if (!PHOTO_ALLOWED_MIME_TYPES.has(detected.mime)) {
      return null;
    }

    return {
      ext: detected.ext,
      mime: detected.mime as AllowedPhotoMimeType,
    };
  }

  private getPositiveNumber(key: string, fallback: number): number {
    const value = Number(this.config.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}

