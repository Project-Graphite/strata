import { existsSync, readdirSync } from 'node:fs';
import { extname } from 'node:path';
import type { NextFunction, Request, Response } from 'express';

export function brotliAssets(root: string) {
  const compressed = new Set(existsSync(root) ? readdirSync(root).filter((name) => name.endsWith('.br')) : []);
  return (request: Request, response: Response, next: NextFunction) => {
    if (compressed.has(`${request.path.slice(1)}.br`) && request.acceptsEncodings('br') === 'br') {
      response.set({ 'Content-Encoding': 'br', Vary: 'Accept-Encoding' }).type(extname(request.path));
      request.url = `${request.path}.br`;
    }
    next();
  };
}
