import { describe, expect, it } from 'vitest';
import { SignInAttemptsService } from '../src/auth/sign-in-attempts.service';

const withoutRedis = { run: () => Promise.resolve(undefined) };

async function fail(attempts: SignInAttemptsService, times: number, address: string) {
  for (let attempt = 0; attempt < times; attempt += 1) {
    await attempts.failed('sam@example.com', address);
  }
}

describe('SignInAttemptsService', () => {
  it('locks an account for the address that failed 10 times while other addresses can still sign in', async () => {
    const attempts = new SignInAttemptsService(withoutRedis as never);

    await fail(attempts, 10, '203.0.113.9');

    await expect(attempts.assertAllowed('SAM@example.com', '203.0.113.9')).rejects.toMatchObject({ status: 429 });
    await expect(attempts.assertAllowed('sam@example.com', '198.51.100.7')).resolves.toBeUndefined();
  });

  it('locks the account everywhere after 100 failures across addresses, until a successful sign-in clears it', async () => {
    const attempts = new SignInAttemptsService(withoutRedis as never);

    for (let address = 0; address < 11; address += 1) {
      await fail(attempts, 9, `203.0.113.${address}`);
    }
    await expect(attempts.assertAllowed('sam@example.com', '198.51.100.7')).resolves.toBeUndefined();
    await fail(attempts, 1, '203.0.113.99');
    await expect(attempts.assertAllowed('sam@example.com', '198.51.100.7')).rejects.toMatchObject({ status: 429 });

    await attempts.clear('sam@example.com');
    await expect(attempts.assertAllowed('sam@example.com', '198.51.100.7')).resolves.toBeUndefined();
    await expect(attempts.assertAllowed('sam@example.com', '203.0.113.0')).resolves.toBeUndefined();
  });

  it('keeps the counts in one Redis hash per account', async () => {
    const commands: unknown[][] = [];
    const attempts = new SignInAttemptsService({
      run: (operation: (client: object) => Promise<unknown>) =>
        operation({
          hIncrBy: (...args: unknown[]) => Promise.resolve(commands.push(['hIncrBy', ...args])),
          expire: (...args: unknown[]) => Promise.resolve(commands.push(['expire', ...args])),
          hmGet: () => Promise.resolve(['10', '10']),
        }),
    } as never);

    await attempts.failed('sam@example.com', '203.0.113.9');

    const key = commands[0]?.[1] as string;
    expect(key).toMatch(/^sign-in-attempts:[0-9a-f]{64}$/);
    expect(commands).toEqual([
      ['hIncrBy', key, 'address:203.0.113.9', 1],
      ['hIncrBy', key, 'account', 1],
      ['expire', key, 900],
    ]);
    await expect(attempts.assertAllowed('sam@example.com', '203.0.113.9')).rejects.toMatchObject({ status: 429 });
  });
});
