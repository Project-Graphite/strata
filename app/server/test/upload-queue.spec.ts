import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { UploadQueue } from '../src/files/upload-queue';

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
}

describe('UploadQueue', () => {
  it('runs two uploads at once and one at a time for each person', async () => {
    const queue = new UploadQueue();
    const started: string[] = [];
    const gates = new Map<string, ReturnType<typeof gate>>();
    const upload = (userId: string, name: string) => {
      const finish = gate();
      gates.set(name, finish);
      return queue.run(userId, async () => {
        started.push(name);
        await finish.opened;
        return name;
      });
    };

    const uploads = [upload('ana', 'a1'), upload('ana', 'a2'), upload('ben', 'b1'), upload('cy', 'c1')];
    await Promise.resolve();
    expect(started).toEqual(['a1', 'b1']);

    gates.get('a1')!.open();
    await uploads[0];
    await Promise.resolve();
    expect(started).toEqual(['a1', 'b1', 'a2']);

    gates.get('b1')!.open();
    gates.get('a2')!.open();
    await Promise.all([uploads[1], uploads[2]]);
    await Promise.resolve();
    expect(started).toEqual(['a1', 'b1', 'a2', 'c1']);
    gates.get('c1')!.open();
    await expect(Promise.all(uploads)).resolves.toEqual(['a1', 'a2', 'b1', 'c1']);
  });

  it('refuses a fifth upload from the same person and frees the slot after a failure', async () => {
    const queue = new UploadQueue();
    const finish = gate();
    const held = Array.from({ length: 4 }, () => queue.run('ana', () => finish.opened));

    await expect(queue.run('ana', async () => 'late')).rejects.toBeInstanceOf(HttpException);

    finish.open();
    await Promise.all(held);
    await expect(queue.run('ana', () => Promise.reject(new Error('broken')))).rejects.toThrow('broken');
    await expect(queue.run('ana', async () => 'next')).resolves.toBe('next');
  });
});
