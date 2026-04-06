import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import type { SyncSource } from "@aerodirectory/database";

export interface SyncLockHandle {
  release(): Promise<void>;
}

@Injectable()
export class SyncLockService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: process.env["DATABASE_URL"],
  });

  async acquire(source: SyncSource): Promise<SyncLockHandle | null> {
    const client = await this.pool.connect();
    try {
      const key = `navventura:sync:${source}`;
      const result = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
        [key],
      );

      if (!result.rows[0]?.locked) {
        client.release();
        return null;
      }

      return {
        release: () => this.release(client, key),
      };
    } catch (error) {
      client.release();
      throw error;
    }
  }

  private async release(client: PoolClient, key: string) {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [key]);
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
