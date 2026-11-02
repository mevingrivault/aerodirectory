import { Module } from "@nestjs/common";
import { AltchaModule } from "../altcha/altcha.module";
import { NotificationModule } from "../notification/notification.module";
import { AdminCommunityInfoController, CommunityInfoController } from "./community-info.controller";
import { CommunityInfoService } from "./community-info.service";

@Module({
  imports: [AltchaModule, NotificationModule],
  providers: [CommunityInfoService],
  controllers: [CommunityInfoController, AdminCommunityInfoController],
})
export class CommunityInfoModule {}
