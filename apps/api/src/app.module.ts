import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { SyncModule } from "./sync/sync.module";
import { AltchaModule } from "./altcha/altcha.module";
import { CryptoModule } from "./common/crypto.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { AerodromeModule } from "./aerodrome/aerodrome.module";
import { SearchModule } from "./search/search.module";
import { VisitModule } from "./visit/visit.module";
import { CommentModule } from "./comment/comment.module";
import { PlannerModule } from "./planner/planner.module";
import { AuditModule } from "./audit/audit.module";
import { HealthModule } from "./health/health.module";
import { RestaurantModule } from "./restaurant/restaurant.module";
import { AdminModule } from "./admin/admin.module";
import { PhotoModule } from "./photo/photo.module";
import { NotificationModule } from "./notification/notification.module";
import { ListModule } from "./list/list.module";
import { AirspaceModule } from "./airspace/airspace.module";
import { ThrottlerGuard } from "@nestjs/throttler";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: "short",
        ttl: 1000,
        limit: 10,
      },
      {
        name: "medium",
        ttl: 10000,
        limit: 50,
      },
      {
        name: "long",
        ttl: 60000,
        limit: 200,
      },
    ]),
    AltchaModule,
    CryptoModule,
    PrismaModule,
    AuthModule,
    AerodromeModule,
    SearchModule,
    VisitModule,
    CommentModule,
    PlannerModule,
    AuditModule,
    HealthModule,
    RestaurantModule,
    AdminModule,
    PhotoModule,
    NotificationModule,
    ListModule,
    AirspaceModule,
    SyncModule,
  ],
  providers: [
    // Activate rate limiting globally
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
