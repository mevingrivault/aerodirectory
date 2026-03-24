import { Module } from "@nestjs/common";
import { AerodromeService } from "./aerodrome.service";
import { AerodromeController } from "./aerodrome.controller";
import { RestaurantModule } from "../restaurant/restaurant.module";

@Module({
  imports: [RestaurantModule],
  providers: [AerodromeService],
  controllers: [AerodromeController],
  exports: [AerodromeService],
})
export class AerodromeModule {}
