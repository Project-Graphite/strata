import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { authFailures, httpDuration, httpRequests, httpServerErrors } from '../metrics/metrics';

const logger = new Logger('Http');

export function requestLog(request: Request, response: Response, next: NextFunction) {
  if (!request.path.startsWith('/api/')) return next();
  const started = performance.now();
  const requestId = randomUUID();
  response.set('X-Request-Id', requestId);
  response.locals.requestId = requestId;
  response.on('close', () => {
    const route = request.route ? `${request.baseUrl}${String(request.route.path)}` : 'unmatched';
    const status = response.statusCode;
    const durationMs = Math.round(performance.now() - started);
    const labels = { method: request.method, route, status_class: `${Math.floor(status / 100)}xx` };
    httpRequests.inc(labels);
    httpDuration.observe(labels, durationMs / 1000);
    if (status >= 500) httpServerErrors.inc({ method: request.method, route });
    if (status === 401 || status === 403 || status === 429) authFailures.inc({ status: String(status) });
    logger.log({
      requestId,
      method: request.method,
      route,
      status,
      durationMs,
      userId: (request.user as { id?: string } | undefined)?.id,
    });
  });
  next();
}
