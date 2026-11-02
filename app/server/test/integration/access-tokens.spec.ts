import { describe, expect, it, vi } from 'vitest';
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

    expect((await other.call('PATCH', `/me/tokens/${listed.id}`, { scopes: ['items:write'], password })).status).toBe(404);
    expect((await owner.call('PATCH', `/me/tokens/${listed.id}`, { scopes: ['items:write'], password: 'wrong password' })).status).toBe(403);
    const edited = await owner.call('PATCH', `/me/tokens/${listed.id}`, { name: 'Backup and edits', scopes: ['account:read', 'items:read', 'items:write'], password });
    expect(edited.body).toMatchObject({ name: 'Backup and edits', scopes: ['account:read', 'items:read', 'items:write'] });
    expect((await withToken(token, 'PATCH', `/items/${note.id}`, { title: 'Changed' })).status).toBe(200);
    expect((await withToken(token, 'GET', '/me')).status).toBe(200);
    expect((await withToken(token, 'GET', '/me/api-reference')).status).toBe(200);
    expect((await withToken(token, 'GET', '/spaces')).status).toBe(403);
    expect((await withToken(token, 'PATCH', `/me/tokens/${listed.id}`, { scopes: ['spaces:write'], password })).status).toBe(403);

    expect((await other.call('DELETE', `/me/tokens/${listed.id}`)).status).toBe(404);
    expect((await owner.call('DELETE', `/me/tokens/${listed.id}`)).status).toBe(204);
    expect((await withToken(token, 'GET', '/spaces')).status).toBe(401);
    expect((await owner.call('GET', '/me/audit')).body.results.map((event: { action: string }) => event.action)).toEqual([
      'access_token_revoked',
      'access_token_updated',
      'sign_in_failed',
      'access_token_created',
      'sign_in_failed',
    ]);
  });

  it('lists the endpoints each scope reaches, for people signed in', async () => {
    const owner = await member('api-reader');
    const reference = (await owner.call('GET', '/me/api-reference')).body;
    expect(reference.basePath).toBe('/api/v1');
    expect(reference.scopes.map((entry: { scope: string }) => entry.scope)).toEqual(['account:read', 'account:write', 'spaces:read', 'spaces:write', 'items:read', 'items:write', 'spending:capture']);
    const routes = (scope: string) => reference.scopes.find((entry: { scope: string }) => entry.scope === scope).routes;
    expect(routes('spaces:read')).toContainEqual({ method: 'GET', path: '/spaces' });
    expect(routes('items:read')).toContainEqual({ method: 'GET', path: '/agenda' });
    expect(routes('items:write')).toContainEqual({ method: 'POST', path: '/spaces/:spaceId/tasks' });
    expect(routes('items:write')).toEqual(expect.arrayContaining([{ method: 'POST', path: '/me/expenses' }, { method: 'DELETE', path: '/subscriptions/:id' }, { method: 'PUT', path: '/notes/:id/content' }]));
    expect(routes('spending:capture')).toEqual([{ method: 'POST', path: '/me/captures' }]);
    expect(JSON.stringify(reference)).not.toContain('/me/tokens');

    const token = (await owner.call('POST', '/me/tokens', { name: 'Docs', scopes: ['items:read'], password })).body.token;
    expect((await withToken(token, 'GET', '/me/api-reference')).status).toBe(403);
  });

  it('stops every token when the other devices are signed out', async () => {
    const owner = await member('rotator');
    const created = await owner.call('POST', '/me/tokens', { name: 'Sync', scopes: ['spaces:read'], password });
    expect((await withToken(created.body.token, 'GET', '/spaces')).status).toBe(200);
    expect((await owner.call('POST', '/me/calendar-feed')).status).toBe(201);

    expect((await owner.call('DELETE', '/me/sessions')).status).toBe(204);

    expect((await owner.call('GET', '/me/calendar-feed')).body).toEqual({ enabled: false });
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

  it('stays inside the one space a token is pinned to and writes page content', async () => {
    const owner = await member('pinned-scripter');
    const stranger = await member('pinned-stranger');
    const club = (await owner.call('POST', '/spaces', { name: 'Club' })).body;
    const home = owner.personalSpaceId;
    expect((await owner.call('POST', '/me/tokens', { name: 'Elsewhere', scopes: ['items:read'], spaceId: stranger.personalSpaceId, password })).status).toBe(404);
    const pinned = (await owner.call('POST', '/me/tokens', { name: 'Club only', scopes: ['spaces:read', 'items:read', 'items:write'], spaceId: club.id, password })).body;
    expect(pinned.spaceId).toBe(club.id);
    expect((await owner.call('GET', '/me/tokens')).body.map((token: { spaceId: string | null }) => token.spaceId)).toEqual([club.id]);
    const call = (method: string, path: string, body?: unknown) =>
      withToken(pinned.token, method, path, body).then(async (response) => ({ status: response.status, body: response.status === 204 ? null : await response.json() }));

    expect((await call('GET', '/spaces')).body.map((space: { id: string }) => space.id)).toEqual([club.id]);
    expect((await call('GET', `/spaces/${home}/notes`)).status).toBe(404);
    expect((await call('POST', `/spaces/${home}/notes`, { title: 'Nope' })).status).toBe(404);
    const page = (await call('POST', `/spaces/${club.id}/notes`, { title: 'Minutes' })).body;
    expect(page.spaceId).toBe(club.id);
    const written = await call('PUT', `/notes/${page.id}/content`, { blocks: [['heading', 'Agenda'], ['bullets', ['Budget', 'Dates']], ['tasks', ['Book the hall']]] });
    expect(written.status).toBe(200);
    expect(written.body.text).toContain('Agenda');
    expect(written.body.text).toContain('Book the hall');
    expect((await call('PUT', `/notes/${page.id}/content`, { blocks: [['heading', ['no']]] })).status).toBe(400);
    expect((await call('PUT', `/notes/${page.id}/content`, { blocks: [['poem', 'no']] })).status).toBe(400);
    expect((await call('PUT', `/notes/${page.id}/content`, {})).status).toBe(400);
    expect((await call('PUT', `/notes/${page.id}/content`, { text: 'First line\nSecond line' })).status).toBe(200);
    await vi.waitFor(async () => expect((await call('GET', `/notes/${page.id}/content`)).body.text).toContain('Second line'), { timeout: 10_000 });
    expect((await owner.call('GET', `/notes/${page.id}/versions`)).body.length).toBeGreaterThanOrEqual(1);
    const mine = await strata.item(home, 'Private');
    expect((await call('GET', `/notes/${mine.id}/content`)).status).toBe(404);
    expect((await call('PUT', `/notes/${mine.id}/content`, { text: 'Nope' })).status).toBe(404);
    expect((await owner.call('GET', `/notes/${mine.id}/content`)).body).toEqual({ text: '' });
  });
});
