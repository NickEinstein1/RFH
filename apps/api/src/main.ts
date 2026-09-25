import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env', override: true });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { json, urlencoded, static as expressStatic } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);

  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: config.get('NODE_ENV') === 'production' ? undefined : false,
    }),
  );

  // Resident / facility media (JPEG photos). Mounted before Nest guards.
  app.use(
    '/api/media',
    expressStatic(join(__dirname, '..', 'public'), {
      maxAge: '7d',
      index: false,
      fallthrough: true,
    }),
  );

  // Cap JSON payloads (resident photos / order images are client-resized).
  app.use(json({ limit: '1.2mb' }));
  app.use(urlencoded({ extended: true, limit: '1.2mb' }));

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigin = config.get('CORS_ORIGIN', 'http://localhost:5173');
  app.enableCors({
    origin: corsOrigin.split(',').map((o: string) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });

  // Production: terminate TLS at reverse proxy (TLS 1.3). Local HTTP is for dev only.
  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`RFH API listening on http://localhost:${port}/api`);
}
bootstrap();
