import { Module } from "@nestjs/common";
import { CommentService } from "./comment.service";
import { CommentController } from "./comment.controller";
import { AltchaModule } from "../altcha/altcha.module";
import { NotificationModule } from "../notification/notification.module";

@Module({
  imports: [AltchaModule, NotificationModule],
  providers: [CommentService],
  controllers: [CommentController],
})
export class CommentModule {}
