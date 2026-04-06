import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { PhotoModule } from "../photo/photo.module";

@Module({
  imports: [PhotoModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
