import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ConfigService } from "@nestjs/config";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyCookie from "@fastify/cookie";
import fastifyMultipart from "@fastify/multipart";
import { AppModule } from "./app.module";
import { resolveCorsOrigins, resolveTrustProxy } from "./common/bootstrap-config";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: process.env["NODE_ENV"] === "development",
      // Never `true`: that would let clients forge X-Forwarded-For and defeat
      // rate limiting and account lockout. Defaults to one hop (the reverse
      // proxy); see resolveTrustProxy for the accepted TRUST_PROXY values.
      trustProxy: resolveTrustProxy(process.env["TRUST_PROXY"]),
    }),
  );

  const config = app.get(ConfigService);

  const corsOrigins = resolveCorsOrigins(
    { get: (key, fallback) => config.get<string>(key, fallback ?? "") },
    process.env["NODE_ENV"],
  );
  await app.register(fastifyCors, {
    origin: corsOrigins,
    credentials: true,
  });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  await app.register(fastifyCookie, {
    secret: config.get<string>("COOKIE_SECRET") || config.get<string>("JWT_SECRET"),
  });

  // Multipart (file uploads) — limit handled per-route in PhotoController
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
    },
  });

  app.setGlobalPrefix("api/v1");

  const port = config.get<number>("PORT", 4000);
  await app.listen(port, "0.0.0.0");
  console.log(`🛫 Navventura API running on http://localhost:${port}`);
}

bootstrap();
