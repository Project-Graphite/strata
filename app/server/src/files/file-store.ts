import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';

export abstract class FileStore {
  abstract write(sha256: string, data: Buffer): Promise<void>;
  abstract read(sha256: string): Readable;
  abstract remove(sha256: string): Promise<void>;
}

@Injectable()
export class DiskFileStore extends FileStore {
  private readonly root: string;

  constructor(config: ConfigService) {
    super();
    this.root = config.get<string>('FILES_ROOT') ?? '/data/files';
  }

  async write(sha256: string, data: Buffer) {
    const path = this.path(sha256);
    if (await stat(path).then(() => true, () => false)) return;
    await mkdir(join(this.root, sha256.slice(0, 2)), { recursive: true });
    const temporary = `${path}.${process.pid}.${Date.now()}.part`;
    await writeFile(temporary, data, { flag: 'wx' });
    await rename(temporary, path);
  }

  read(sha256: string) {
    return createReadStream(this.path(sha256));
  }

  async remove(sha256: string) {
    await rm(this.path(sha256), { force: true });
  }

  private path(sha256: string) {
    return join(this.root, sha256.slice(0, 2), sha256);
  }
}
