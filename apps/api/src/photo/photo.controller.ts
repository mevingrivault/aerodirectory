import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AltchaGuard } from "../altcha/altcha.guard";
import { ok } from "../common/api-response";
import { CurrentUser, Public } from "../common/decorators";
import { PhotoService } from "./photo.service";
import { StorageService } from "./storage.service";
import { PhotoUploadMiddleware } from "./upload.middleware";

@Controller("aerodromes/:aerodromeId/photos")
export class PhotoController {
  constructor(
    private readonly photos: PhotoService,
    private readonly storage: StorageService,
    private readonly uploadMiddleware: PhotoUploadMiddleware,
  ) {}

  @UseGuards(AltchaGuard)
  @Throttle({ short: { limit: 5, ttl: 60000 }, medium: { limit: 20, ttl: 3600000 } })
  @Post()
  async upload(
    @Param("aerodromeId") aerodromeId: string,
    @CurrentUser() user: { sub: string; role: string },
    @Req() req: FastifyRequest,
  ) {
    const upload = await this.uploadMiddleware.parseSingleImage(req);

    const photo = await this.photos.upload(
      user.sub,
      aerodromeId,
      upload,
      req.ip,
      req.headers["user-agent"],
    );

    return ok(photo);
  }

  @Public()
  @Get()
  async list(@Param("aerodromeId") aerodromeId: string) {
    const photos = await this.photos.listForAerodrome(aerodromeId);
    return ok(photos);
  }

  @Public()
  @Get(":photoId/file")
  async serve(
    @Param("photoId") photoId: string,
    @Res() res: FastifyReply,
  ) {
    const photo = await this.photos.findById(photoId);
    if (!photo) {
      throw new NotFoundException("Photo introuvable.");
    }

    const { stream, contentType, contentLength } = await this.storage.getObject(photo.storedKey);

    res.header("Content-Type", contentType);
    res.header("Cache-Control", "public, max-age=31536000, immutable");
    if (contentLength) {
      res.header("Content-Length", contentLength);
    }
    res.send(stream);
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

