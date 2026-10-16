import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const uploadsAtOnce = 2;
const uploadsPerUser = 4;

interface Waiting {
  userId: string;
  start: () => void;
}

@Injectable()
export class UploadQueue {
  private readonly running = new Set<string>();
  private readonly waiting: Waiting[] = [];
  private readonly pending = new Map<string, number>();

  async run<T>(userId: string, upload: () => Promise<T>): Promise<T> {
    const queued = this.pending.get(userId) ?? 0;
    if (queued >= uploadsPerUser) {
      throw new HttpException('Wait for your other uploads to finish, then try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.pending.set(userId, queued + 1);
    try {
      await new Promise<void>((start) => {
        this.waiting.push({ userId, start });
        this.startNext();
      });
      try {
        return await upload();
      } finally {
        this.running.delete(userId);
        this.startNext();
      }
    } finally {
      const left = this.pending.get(userId)! - 1;
      if (left) this.pending.set(userId, left);
      else this.pending.delete(userId);
    }
  }

  private startNext() {
    while (this.running.size < uploadsAtOnce) {
      const index = this.waiting.findIndex((entry) => !this.running.has(entry.userId));
      if (index < 0) return;
      const [next] = this.waiting.splice(index, 1);
      this.running.add(next!.userId);
      next!.start();
    }
  }
}
