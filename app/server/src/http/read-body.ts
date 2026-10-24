import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { Request } from 'express';

export async function readBody(request: Request, maxBytes: number, tooLargeMessage: string) {
  if (Number(request.headers['content-length'] ?? 0) > maxBytes) throw new PayloadTooLargeException(tooLargeMessage);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new PayloadTooLargeException(tooLargeMessage);
    chunks.push(chunk as Buffer);
  }
  if (size === 0) throw new BadRequestException('The file is empty');
  return Buffer.concat(chunks);
}
