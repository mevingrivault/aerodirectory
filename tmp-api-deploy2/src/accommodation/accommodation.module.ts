import { Module } from "@nestjs/common";
import { AccommodationService } from "./accommodation.service";

@Module({
  providers: [AccommodationService],
  exports: [AccommodationService],
})
export class AccommodationModule {}
