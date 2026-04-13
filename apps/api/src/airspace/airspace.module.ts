import { Module } from "@nestjs/common";
import { AirspaceService } from "./airspace.service";
import { AirspaceController } from "./airspace.controller";

@Module({
  providers: [AirspaceService],
  controllers: [AirspaceController],
  exports: [AirspaceService],
})
export class AirspaceModule {}
