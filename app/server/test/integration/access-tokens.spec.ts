import { describe, expect, it } from 'vitest';
import { integrationApp, password } from './harness';

describe('Access tokens against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  function withToken(token: string, method: string, path: string, body?: unknown) {
    return fetch(`${strata.base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  it('acts only within its scopes, never on the account, and stops when revoked', async () => {
    const owner = await member('scripter');
    const other = await member('bystander');
    const note = await strata.item(owner.personalSpaceId, 'Readable');

    expect((await owner.call('POST', '/me/tokens', { name: 'Backup', scopes: ['items:read'], password: 'wrong' })).status).toBe(403);
    expect((await owner.call('POST', '/me/tokens', { name: 'Backup', scopes: ['admin'], password })).status).toBe(400);
    const created = await owner.call('POST', '/me/tokens', {
      name: 'Backup',
      scopes: ['spaces:read', 'items:read'],
      expiresInDays: 7,
      password,
    });
    expect(created.status).toBe(201);
    const token: string = created.body.token;
    expect(token).toMatch(/^strata_pat_[\w-]{43}$/);

    expect((await withToken(token, 'GET', '/spaces')).status).toBe(200);
    expect((await withToken(token, 'GET', `/items/${note.id}`)).status).toBe(200);
    expect((await withToken(token, 'PATCH', `/items/${note.id}`, { title: 'Changed' })).status).toBe(403);
    expect((await withToken(token, 'POST', '/spaces', { name: 'Made by a token' })).status).toBe(403);
    expect((await withToken(token, 'GET', '/me')).status).toBe(403);
    expect((await withToken(token, 'GET', '/me/tokens')).status).toBe(403);
    expect((await withToken(token, 'POST', '/me/tokens', { name: 'More', scopes: ['items:write'], password })).status).toBe(403);
    expect((await withToken(token, 'GET', `/items/${(await strata.item(other.personalSpaceId, 'Theirs')).id}`)).status).toBe(404);

    const [listed] = (await owner.call('GET', '/me/tokens')).body;
    expect(listed).toMatchObject({ name: 'Backup', scopes: ['spaces:read', 'items:read'], lastUsedAt: expect.any(String) });
    expect(listed).not.toHaveProperty('token');
    expect(listed).not.toHaveProperty('tokenHash');

    expect((await other.call('DELETE', `/me/tokens/${listed.id}`)).status).toBe(404);
    expect((await owner.call('DELETE', `/me/tokens/${listed.id}`)).status).toBe(204);
    expect((await withToken(token, 'GET', '/spaces')).status).toBe(401);
    expect((await owner.call('GET', '/me/audit')).body.results.map((event: { action: string }) => event.action)).toEqual([
      'access_token_revoked',
      'access_token_created',
    ]);
  });

  it('lists the endpoints each scope reaches, for people signed in', async () => {
    const owner = await member('api-reader');
    const reference = (await owner.call('GET', '/me/api-reference')).body;
    expect(reference.basePath).toBe('/api/v1');
    expect(reference.scopes.map((entry: { scope: string }) => entry.scope)).toEqual(['spaces:read', 'items:read', 'items:write']);
    const routes = (scope: string) => reference.scopes.find((entry: { scope: string }) => entry.scope === scope).routes;
    expect(routes('spaces:read')).toContainEqual({ method: 'GET', path: '/spaces' });
    expect(routes('items:read')).toContainEqual({ method: 'GET', path: '/agenda' });
    expect(routes('items:write')).toContainEqual({ method: 'POST', path: '/spaces/:spaceId/tasks' });
    expect(JSON.stringify(reference)).not.toContain('/me/tokens');

    const token = (await owner.call('POST', '/me/tokens', { name: 'Docs', scopes: ['items:read'], password })).body.token;
    expect((await withToken(token, 'GET', '/me/api-reference')).status).toBe(403);
  });

  it('stops every token when the other devices are signed out', async () => {
    const owner = await member('rotator');
    const created = await owner.call('POST', '/me/tokens', { name: 'Sync', scopes: ['spaces:read'], password });
    expect((await withToken(created.body.token, 'GET', '/spaces')).status).toBe(200);

    expect((await owner.call('DELETE', '/me/sessions')).status).toBe(204);

    expect((await withToken(created.body.token, 'GET', '/spaces')).status).toBe(401);
    expect((await owner.call('GET', '/me/tokens')).body).toEqual([]);
    expect((await owner.call('GET', '/spaces')).status).toBe(200);
  });

  it('keeps an open tab signed in when another tab refreshes, until signing out', async () => {
    const owner = await member('two-tabs');
    const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:4104' };
    const refreshCookie = (response: Response) => response.headers.getSetCookie().find((cookie) => cookie.startsWith('strata_refresh='))!.split(';')[0]!;
    const login = await fetch(`${strata.base}/auth/login`, { method: 'POST', headers, body: JSON.stringify({ email: owner.email, password }) });
    const firstTab = (await login.json()).accessToken;

    const refreshed = await fetch(`${strata.base}/auth/refresh`, { method: 'POST', headers: { ...headers, Cookie: refreshCookie(login) } });
    expect(refreshed.status).toBe(201);
    expect((await withToken(firstTab, 'GET', '/spaces')).status).toBe(200);

    await fetch(`${strata.base}/auth/logout`, { method: 'POST', headers: { ...headers, Cookie: refreshCookie(refreshed) } });
    expect((await withToken(firstTab, 'GET', '/spaces')).status).toBe(401);
  });
});
