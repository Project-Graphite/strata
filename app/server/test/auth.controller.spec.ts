import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from '../src/auth/auth.controller';

describe('AuthController', () => {
  it('renews and ends sessions only for requests from a trusted origin', async () => {
    const auth = {
      refresh: vi.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'next', user: {} }),
      logout: vi.fn(),
    };
    const controller = new AuthController(
      auth as never,
      new ConfigService({ AUTH_TRUSTED_ORIGINS: 'https://strata.example', APP_URL: 'https://strata.example' }),
    );
    const request = (origin?: string) =>
      ({ headers: origin ? { origin } : {}, cookies: { strata_refresh: 'current' } }) as never;
    const response = { cookie: vi.fn(), clearCookie: vi.fn() };

    for (const origin of [undefined, 'https://attacker.example']) {
      await expect(controller.refresh(request(origin), response as never)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(controller.logout(request(origin), response as never)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(auth.logout).not.toHaveBeenCalled();

    await controller.refresh(request('https://strata.example'), response as never);
    expect(auth.refresh).toHaveBeenCalledWith('current');
    expect(response.cookie).toHaveBeenCalledWith(
      'strata_refresh',
      'next',
      expect.objectContaining({ httpOnly: true, path: '/api/v1/auth', sameSite: 'strict' }),
    );
  });

  it('refuses sign-ins posted from another site', async () => {
    const auth = {
      login: vi.fn().mockResolvedValue({ session: { accessToken: 'access', refreshToken: 'next', user: {} } }),
      completeTwoStep: vi.fn(),
    };
    const controller = new AuthController(
      auth as never,
      new ConfigService({ AUTH_TRUSTED_ORIGINS: 'https://strata.example', APP_URL: 'https://strata.example' }),
    );
    const request = (origin?: string) => ({ headers: origin ? { origin } : {}, cookies: {} }) as never;
    const response = { cookie: vi.fn() };
    const input = { email: 'sam@example.com', password: 'correct horse battery' };

    await expect(controller.login(input, request('https://attacker.example'), response as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      controller.completeTwoStep({ challenge: 'challenge', code: '123456' }, request('https://attacker.example'), response as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.login).not.toHaveBeenCalled();
    expect(auth.completeTwoStep).not.toHaveBeenCalled();

    await controller.login(input, request('https://strata.example'), response as never);
    await controller.login(input, request(), response as never);
    expect(auth.login).toHaveBeenCalledTimes(2);
  });

  it('marks session cookies secure exactly when the app is served over https, and counts sign-ins by client address', async () => {
    const auth = { login: vi.fn().mockResolvedValue({ session: { accessToken: 'access', refreshToken: 'next', user: {} } }) };
    const input = { email: 'sam@example.com', password: 'correct horse battery' };
    const signIn = async (appUrl: string) => {
      const response = { cookie: vi.fn() };
      await new AuthController(auth as never, new ConfigService({ AUTH_TRUSTED_ORIGINS: appUrl, APP_URL: appUrl })).login(
        input,
        { headers: {}, cookies: {}, ip: '203.0.113.9' } as never,
        response as never,
      );
      return response.cookie.mock.calls.map(([, , options]) => (options as { secure: boolean }).secure);
    };

    expect(await signIn('https://strata.example')).toEqual([true, true]);
    expect(await signIn('http://localhost:4104')).toEqual([false, false]);
    expect(auth.login).toHaveBeenCalledWith(input, expect.objectContaining({ address: '203.0.113.9' }));
  });
});
