import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { PhotoModule } from "../photo/photo.module";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [PhotoModule, MailModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
