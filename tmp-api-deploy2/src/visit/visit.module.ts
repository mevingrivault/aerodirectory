import { Module } from "@nestjs/common";
import { VisitService } from "./visit.service";
import { VisitController } from "./visit.controller";

@Module({
  providers: [VisitService],
  controllers: [VisitController],
})
export class VisitModule {}
