import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('Http');

export function requestLog(request: Request, response: Response, next: NextFunction) {
  if (!request.path.startsWith('/api/')) return next();
  const started = performance.now();
  const requestId = randomUUID();
  response.set('X-Request-Id', requestId);
  response.on('finish', () => {
    logger.log({
      requestId,
      method: request.method,
      route: request.route ? `${request.baseUrl}${String(request.route.path)}` : 'unmatched',
      status: response.statusCode,
      durationMs: Math.round(performance.now() - started),
      userId: (request.user as { id?: string } | undefined)?.id,
    });
  });
  next();
}
