import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Req,
  BadRequestException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { PhotoService } from "./photo.service";
import { CurrentUser } from "../common/decorators";
import { ok } from "../common/api-response";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@Controller("aerodromes/:aerodromeId/photos")
export class PhotoController {
  constructor(private readonly photos: PhotoService) {}

  @Post()
  async upload(
    @Param("aerodromeId") aerodromeId: string,
    @CurrentUser() user: { sub: string; role: string },
    @Req() req: FastifyRequest,
  ) {
    if (!req.isMultipart()) {
      throw new BadRequestException("La requête doit être de type multipart/form-data.");
    }

    const data = await req.file({
      limits: { fileSize: MAX_FILE_SIZE },
    });

    if (!data) {
      throw new BadRequestException("Aucun fichier trouvé dans la requête.");
    }

    // Read buffer (toBuffer() throws if file exceeds limits)
    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch {
      throw new PayloadTooLargeException("La taille du fichier dépasse la limite de 10 Mo.");
    }

    const photo = await this.photos.upload(
      user.sub,
      aerodromeId,
      buffer,
      data.filename,
      req.ip,
      req.headers["user-agent"],
    );

    return ok(photo);
  }

  @Get()
  async list(
    @Param("aerodromeId") aerodromeId: string,
  ) {
    const photos = await this.photos.listForAerodrome(aerodromeId);
    return ok(photos);
  }

  @Delete(":photoId")
  async remove(
    @Param("photoId") photoId: string,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    await this.photos.delete(photoId, user.sub, user.role);
    return ok({ deleted: true });
  }
}
