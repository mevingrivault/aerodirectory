import { Module } from "@nestjs/common";
import { AltchaService } from "./altcha.service";
import { AltchaController } from "./altcha.controller";

@Module({
  controllers: [AltchaController],
  providers: [AltchaService],
  exports: [AltchaService],
})
export class AltchaModule {}
