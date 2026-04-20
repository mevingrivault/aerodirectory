import { Module } from "@nestjs/common";
import { SearchService } from "./search.service";
import { SearchController } from "./search.controller";
import { PhotoModule } from "../photo/photo.module";

@Module({
  imports: [PhotoModule],
  providers: [SearchService],
  controllers: [SearchController],
})
export class SearchModule {}
