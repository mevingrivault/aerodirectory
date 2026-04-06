import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
import {
  PHOTO_MAX_UPLOAD_BYTES,
  PHOTO_UPLOAD_FIELD_NAME,
} from "./photo.constants";

export interface UploadedTempFile {
  tempFilePath: string;
  originalFilename: string;
  declaredMimeType: string;
  size: number;
  cleanup: () => Promise<void>;
}

@Injectable()
export class PhotoUploadMiddleware {
  private readonly logger = new Logger(PhotoUploadMiddleware.name);
  private readonly tempRoot: string;
  private readonly maxFileSize: number;

  constructor(private readonly config: ConfigService) {
    const configuredTempRoot = this.config.get<string>("PHOTO_UPLOAD_TMP_DIR");
    const configuredMaxFileSize = Number(this.config.get("PHOTO_MAX_UPLOAD_BYTES"));

    this.tempRoot = configuredTempRoot?.trim() || join(tmpdir(), "navventura-uploads");
    this.maxFileSize =
      Number.isFinite(configuredMaxFileSize) && configuredMaxFileSize > 0
        ? configuredMaxFileSize
        : PHOTO_MAX_UPLOAD_BYTES;
  }

  async parseSingleImage(req: FastifyRequest): Promise<UploadedTempFile> {
    if (!req.isMultipart()) {
      throw new BadRequestException(
        "La requête doit être envoyée en multipart/form-data.",
      );
    }

    let part: Awaited<ReturnType<FastifyRequest["file"]>>;

    try {
      part = await req.file({
        limits: {
          files: 1,
          fileSize: this.maxFileSize,
        },
      });
    } catch (error) {
      throw this.toUploadException(error);
    }

    if (!part) {
      throw new BadRequestException("Aucun fichier n'a été envoyé.");
    }

    if (part.fieldname !== PHOTO_UPLOAD_FIELD_NAME) {
      throw new BadRequestException(
        `Le champ de fichier attendu est "${PHOTO_UPLOAD_FIELD_NAME}".`,
      );
    }

    const tempDirectory = join(this.tempRoot, randomUUID());
    const tempFilePath = join(tempDirectory, `${randomUUID()}.upload`);
    let bytesWritten = 0;

    const cleanup = async () => {
      await rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
    };

    try {
      await mkdir(tempDirectory, { recursive: true });

      part.file.on("data", (chunk: Buffer) => {
        bytesWritten += chunk.length;
      });

      await pipeline(
        part.file,
        createWriteStream(tempFilePath, { flags: "wx" }),
      );

      if (part.file.truncated || bytesWritten > this.maxFileSize) {
        throw new PayloadTooLargeException(
          `La taille maximale autorisée est de ${Math.floor(this.maxFileSize / 1024 / 1024)} Mo.`,
        );
      }

      if (bytesWritten === 0) {
        throw new BadRequestException("Le fichier envoyé est vide.");
      }

      return {
        tempFilePath,
        originalFilename: part.filename || "upload",
        declaredMimeType: part.mimetype || "application/octet-stream",
        size: bytesWritten,
        cleanup,
      };
    } catch (error) {
      await cleanup();
      this.logger.warn(
        `Échec pendant la mise en tampon du fichier temporaire: ${(error as Error).message}`,
      );
      throw this.toUploadException(error);
    }
  }

  private toUploadException(error: unknown): Error {
    if (
      error instanceof PayloadTooLargeException ||
      error instanceof BadRequestException
    ) {
      return error;
    }

    const message = error instanceof Error ? error.message : "Erreur inconnue";
    if (
      /too large/i.test(message) ||
      /fileSize/i.test(message) ||
      /FST_REQ_FILE_TOO_LARGE/i.test(message)
    ) {
      return new PayloadTooLargeException(
        `La taille maximale autorisée est de ${Math.floor(this.maxFileSize / 1024 / 1024)} Mo.`,
      );
    }

    return new BadRequestException(
      "Impossible de lire le fichier envoyé.",
    );
  }
}

