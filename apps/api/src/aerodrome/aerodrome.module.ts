import { Module } from "@nestjs/common";
import { AerodromeService } from "./aerodrome.service";
import { AerodromeController } from "./aerodrome.controller";
import { RestaurantModule } from "../restaurant/restaurant.module";
import { TransportModule } from "../transport/transport.module";
import { AccommodationModule } from "../accommodation/accommodation.module";
import { MetarModule } from "../metar/metar.module";
import { AuditModule } from "../audit/audit.module";
import { PhotoModule } from "../photo/photo.module";
import { SiaModule } from "../sia/sia.module";

@Module({
  imports: [RestaurantModule, TransportModule, AccommodationModule, MetarModule, AuditModule, PhotoModule, SiaModule],
  providers: [AerodromeService],
  controllers: [AerodromeController],
  exports: [AerodromeService],
})
export class AerodromeModule {}
