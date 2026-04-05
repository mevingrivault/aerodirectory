import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@aerodirectory/database";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: pg.Pool;
  private readonly client: PrismaClient;

  constructor() {
    this.pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
    const adapter = new PrismaPg(this.pool);
    this.client = new PrismaClient({ adapter });
  }

  // Expose all Prisma delegates so injection sites (this.prisma.user, etc.) work unchanged
  get user() { return this.client.user; }
  get emailToken() { return this.client.emailToken; }
  get aerodrome() { return this.client.aerodrome; }
  get runway() { return this.client.runway; }
  get frequency() { return this.client.frequency; }
  get fuel() { return this.client.fuel; }
  get visit() { return this.client.visit; }
  get comment() { return this.client.comment; }
  get correction() { return this.client.correction; }
  get report() { return this.client.report; }
  get aircraftProfile() { return this.client.aircraftProfile; }
  get auditLog() { return this.client.auditLog; }
  get airspace() { return this.client.airspace; }
  get osmPoi() { return this.client.osmPoi; }
  get photo() { return this.client.photo; }

  get $queryRaw() { return this.client.$queryRaw.bind(this.client); }
  get $executeRaw() { return this.client.$executeRaw.bind(this.client); }
  get $transaction() { return this.client.$transaction.bind(this.client); }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
    await this.pool.end();
  }
}
