import { Controller, Get, Injectable, RequestMethod, UseGuards } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { scopeKey, tokenScopes, type TokenScope } from './scopes';

const joined = (...parts: (string | undefined)[]) => `/${parts.flatMap((part) => (part ? part.split('/') : [])).filter(Boolean).join('/')}`;

@Injectable()
export class ApiReference {
  private routes?: { scope: TokenScope; method: string; path: string }[];

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  scopes() {
    const routes = (this.routes ??= this.discovery.getControllers().flatMap(({ instance, metatype }) => {
      if (!instance || !metatype) return [];
      const prefix = this.reflector.get<string>(PATH_METADATA, metatype);
      const prototype = Object.getPrototypeOf(instance) as Record<string, (...args: unknown[]) => unknown>;
      return this.scanner.getAllMethodNames(prototype).flatMap((name) => {
        const handler = prototype[name]!;
        const scope = this.reflector.get<TokenScope | undefined>(scopeKey, handler);
        if (!scope) return [];
        return [{ scope, method: RequestMethod[this.reflector.get<RequestMethod>(METHOD_METADATA, handler)], path: joined(prefix, this.reflector.get<string>(PATH_METADATA, handler)) }];
      });
    }));
    return tokenScopes.map((scope) => ({
      scope,
      routes: routes
        .filter((route) => route.scope === scope)
        .map(({ method, path }) => ({ method, path }))
        .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
    }));
  }
}

@Controller('me/api-reference')
@UseGuards(JwtAuthGuard)
export class ApiReferenceController {
  constructor(private readonly reference: ApiReference) {}

  @Get()
  get() {
    return { basePath: '/api/v1', scopes: this.reference.scopes() };
  }
}
