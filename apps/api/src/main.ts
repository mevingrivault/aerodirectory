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

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: process.env["NODE_ENV"] === "development",
      trustProxy: true,
    }),
  );

  const config = app.get(ConfigService);

  const corsOrigins = config.get<string>("CORS_ORIGINS", "http://localhost:3000");
  await app.register(fastifyCors, {
    origin: corsOrigins.split(",").map((o: string) => o.trim()),
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
    secret: config.get<string>("JWT_SECRET"),
  });

  // Multipart (file uploads) — limit handled per-route in PhotoController
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB hard cap
      files: 1,                    // one file per request
    },
  });

  app.setGlobalPrefix("api/v1");

  const port = config.get<number>("PORT", 4000);
  await app.listen(port, "0.0.0.0");
  console.log(`🛫 Navventura API running on http://localhost:${port}`);
}

bootstrap();
