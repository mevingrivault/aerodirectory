import { Module } from "@nestjs/common";
import { AerodromeService } from "./aerodrome.service";
import { AerodromeController } from "./aerodrome.controller";
import { RestaurantModule } from "../restaurant/restaurant.module";
import { TransportModule } from "../transport/transport.module";
import { AccommodationModule } from "../accommodation/accommodation.module";
import { MetarModule } from "../metar/metar.module";

@Module({
  imports: [RestaurantModule, TransportModule, AccommodationModule, MetarModule],
  providers: [AerodromeService],
  controllers: [AerodromeController],
  exports: [AerodromeService],
})
export class AerodromeModule {}
