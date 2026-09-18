import { Global, Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { REDIS_CLIENT, type RedisClient } from "./redis.constants";
import { ReplayStore } from "./replay-store";

export { REDIS_CLIENT, type RedisClient } from "./redis.constants";

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): RedisClient => {
        const logger = new Logger("RedisModule");
        const url = config.get<string>("REDIS_URL")?.trim();
        if (!url) {
          logger.warn("REDIS_URL non défini — les sessions de refresh sont conservées en mémoire (développement uniquement).");
          return null;
        }

        const client = new Redis(url, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableReadyCheck: false,
        });
        client.on("error", (err: Error) => logger.warn(`Erreur Redis : ${err.message}`));
        return client;
      },
    },
    ReplayStore,
  ],
  exports: [REDIS_CLIENT, ReplayStore],
})
export class RedisModule {}
