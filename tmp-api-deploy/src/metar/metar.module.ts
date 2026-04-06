import { Module } from "@nestjs/common";
import { MetarService } from "./metar.service";

@Module({
  providers: [MetarService],
  exports: [MetarService],
})
export class MetarModule {}
