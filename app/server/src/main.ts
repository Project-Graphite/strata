import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConsoleLogger, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './http/api-exception.filter';
import { requestLog } from './http/request-log';
import { securityHeaders } from './http/security-headers';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
  });
  const trustedProxies = Number(process.env.TRUST_PROXY ?? 1);
  app.set('trust proxy', trustedProxies);
  Logger.log(
    trustedProxies === 0 ? 'Client IPs come from the socket; X-Forwarded-For is ignored' : `Client IPs come from X-Forwarded-For behind ${trustedProxies} trusted proxy hop(s)`,
    'Bootstrap',
  );
  app.disable('x-powered-by');
  app.setGlobalPrefix('api/v1');
  app.use(compression({ filter: (request, response) => !String(response.getHeader('Content-Type')).startsWith('text/event-stream') && compression.filter(request, response) }));
  app.use(securityHeaders);
  app.use('/api', (_request: Request, response: Response, next: NextFunction) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
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
  app.useStaticAssets(frontendRoot, { index: false });
  await app.init();
  app
    .getHttpAdapter()
    .getInstance()
    .get(/^(?!\/api(?:\/|$)).*/, async (request: Request, response: Response) => {
      if (/\.[a-z0-9]+$/i.test(request.path)) {
        response.status(404).type('text').send('Not found');
        return;
      }
      const page = await readFile(join(frontendRoot, 'index.html'), 'utf8');
      response
        .set('Cache-Control', 'no-cache')
        .type('html')
        .send(page.replace('<head>', `<head><meta name="csp-nonce" content="${response.locals.cspNonce}" />`));
    });
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
