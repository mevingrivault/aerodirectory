import { Module } from "@nestjs/common";
import { PhotoController } from "./photo.controller";
import { PhotoService } from "./photo.service";
import { ImageService } from "./image.service";
import { ScanService } from "./scan.service";
import { StorageService } from "./storage.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  controllers: [PhotoController],
  providers: [PhotoService, ImageService, ScanService, StorageService],
  exports: [PhotoService],
})
export class PhotoModule {}
