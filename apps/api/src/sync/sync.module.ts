import { Module } from "@nestjs/common";
import { SyncService } from "./sync.service";
import { SyncController } from "./sync.controller";
import { AuditModule } from "../audit/audit.module";
import { MailModule } from "../mail/mail.module";
import { SyncLockService } from "./sync-lock.service";

@Module({
  imports: [AuditModule, MailModule],
  controllers: [SyncController],
  providers: [SyncService, SyncLockService],
})
export class SyncModule {}
