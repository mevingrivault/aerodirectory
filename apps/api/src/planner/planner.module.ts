import { Module } from "@nestjs/common";
import { PlannerService } from "./planner.service";
import { PlannerController } from "./planner.controller";
import { AirspaceModule } from "../airspace/airspace.module";

@Module({
  imports: [AirspaceModule],
  providers: [PlannerService],
  controllers: [PlannerController],
})
export class PlannerModule {}
