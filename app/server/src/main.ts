import { join } from 'node:path';
import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { Response } from 'express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './http/api-exception.filter';
import { requestLog } from './http/request-log';
import { securityHeaders } from './http/security-headers';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
  });
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.setGlobalPrefix('api/v1');
  app.use(securityHeaders);
  app.use(requestLog);
  app.use(cookieParser());
  app.enableShutdownHooks();
  app.useGlobalFilters(new ApiExceptionFilter(app.getHttpAdapter()));
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.enableCors({
    credentials: true,
    origin: process.env.AUTH_TRUSTED_ORIGINS?.split(',') ?? [],
  });
  const frontendRoot = join(__dirname, '..', '..', 'frontend', 'dist');
  app.useStaticAssets(join(frontendRoot, 'assets'), {
    prefix: '/assets',
    immutable: true,
    maxAge: '1y',
  });
  app.useStaticAssets(frontendRoot);
  await app.init();
  app
    .getHttpAdapter()
    .getInstance()
    .get(/^(?!\/api(?:\/|$)).*/, (_request: unknown, response: Response) =>
      response.sendFile(join(frontendRoot, 'index.html')),
    );
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
