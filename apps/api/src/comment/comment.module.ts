import { Module } from "@nestjs/common";
import { CommentService } from "./comment.service";
import { CommentController } from "./comment.controller";
import { AltchaModule } from "../altcha/altcha.module";

@Module({
  imports: [AltchaModule],
  providers: [CommentService],
  controllers: [CommentController],
})
export class CommentModule {}
