import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { AerodromeModule } from "./aerodrome/aerodrome.module";
import { SearchModule } from "./search/search.module";
import { VisitModule } from "./visit/visit.module";
import { CommentModule } from "./comment/comment.module";
import { PlannerModule } from "./planner/planner.module";
import { AuditModule } from "./audit/audit.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),
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
    PrismaModule,
    AuthModule,
    AerodromeModule,
    SearchModule,
    VisitModule,
    CommentModule,
    PlannerModule,
    AuditModule,
    HealthModule,
  ],
})
export class AppModule {}
