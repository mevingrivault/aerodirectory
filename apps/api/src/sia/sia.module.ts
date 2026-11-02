import { Module } from "@nestjs/common";
import { SiaService } from "./sia.service";

@Module({
  providers: [SiaService],
  exports: [SiaService],
})
export class SiaModule {}
