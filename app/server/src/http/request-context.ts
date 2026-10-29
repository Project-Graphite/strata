import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, hkdfSync } from 'node:crypto';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { agentFamily } from '../auth/device';

export const requestContext = new AsyncLocalStorage<{ requestId?: string; request: Request }>();

export function addressHash(address: string, salt: string | Buffer) {
  return createHmac('sha256', salt).update(address).digest('hex').slice(0, 16);
}

function addressSalt() {
  return process.env.IP_HASH_SALT || Buffer.from(hkdfSync('sha256', Buffer.from(process.env.DATA_ENCRYPTION_KEY!, 'base64'), Buffer.alloc(0), 'address-hash', 32));
}

export function networkOf(request: Request) {
  return { address: request.ip ? addressHash(request.ip, addressSalt()) : null, agent: agentFamily(request.headers['user-agent']) };
}

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const store = { requestId: http.getResponse<Response>().locals.requestId as string | undefined, request: http.getRequest<Request>() };
    return new Observable((subscriber) => requestContext.run(store, () => next.handle().subscribe(subscriber)));
  }
}
