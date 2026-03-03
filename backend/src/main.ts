import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import { mkdir } from 'fs/promises';
import helmet from 'helmet';
import { join } from 'path';
import { types as pgTypes } from 'pg';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logging/json.logger';
import { GlobalExceptionFilter } from './monitoring/filters/global-exception.filter';
import { MetricsService } from './monitoring/metrics.service';
import { SentryService } from './monitoring/sentry.service';

// Parse PostgreSQL "timestamp without time zone" as UTC to avoid +/−timezone drift.
pgTypes.setTypeParser(1114, (value: string) => new Date(`${value}Z`));

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const logger = new JsonLogger('Bootstrap');
  app.useLogger(logger);
  app.enableShutdownHooks();

  const metricsService = app.get(MetricsService);
  const sentryService = app.get(SentryService);
  app.useGlobalFilters(new GlobalExceptionFilter(sentryService));

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.disable('x-powered-by');

  expressApp.use((req: { method: string; path: string; route?: { path?: string } }, res: { statusCode: number; on: (event: string, cb: () => void) => void }, next: () => void) => {
    const start = Date.now();
    res.on('finish', () => {
      metricsService.recordRequest({
        method: req.method,
        path: req.route?.path || req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
      });
    });
    next();
  });

  const uploadDriver = process.env.UPLOAD_DRIVER || 'local';
  if (uploadDriver === 'local') {
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    const uploadPath = join(process.cwd(), uploadDir);
    await mkdir(uploadPath, { recursive: true });
    app.useStaticAssets(uploadPath, { prefix: '/uploads/' });
  }

  const trustProxy = process.env.TRUST_PROXY === 'true';
  if (trustProxy) {
    expressApp.set('trust proxy', true);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const originsRaw = process.env.CORS_ORIGINS ?? '*';
  const corsOrigins = originsRaw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (isProduction && corsOrigins.includes('*')) {
    throw new Error(
      'CORS_ORIGINS cannot include "*" in production. Set explicit origins.',
    );
  }

  if (corsOrigins.includes('*')) {
    app.enableCors({ origin: true, credentials: true });
  } else {
    app.enableCors({
      origin: (origin, callback) => {
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('CORS policy violation'), false);
      },
      credentials: true,
    });
  }

  app.use(
    helmet({
      contentSecurityPolicy: false,
      hsts: isProduction,
      frameguard: true,
      noSniff: true,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(compression());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerEnabled = process.env.SWAGGER_ENABLED !== 'false';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('HOLAT API')
      .setDescription('HOLAT platform backend API documentation')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, swaggerDocument, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  logger.log(`Backend is running: http://localhost:${port}/api`);
  if (swaggerEnabled) {
    logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
