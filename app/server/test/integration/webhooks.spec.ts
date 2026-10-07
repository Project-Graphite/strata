import { SpaceRole } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signature, WebhooksService } from '../../src/webhooks/webhooks.service';
import { postPublic } from '../../src/widgets/safe-fetch';
import { integrationApp } from './harness';

vi.mock('../../src/widgets/safe-fetch', async (original) => ({ ...(await original<typeof import('../../src/widgets/safe-fetch')>()), postPublic: vi.fn() }));

const settle = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Webhooks against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  afterEach(() => vi.mocked(postPublic).mockReset());

  it('sends signed activity from my spaces to my address, and keeps the address and secret private', async () => {
    const owner = await member('hook-owner');
    const stranger = await member('hook-stranger');
    const shared = (await owner.call('POST', '/spaces', { name: 'Allotment' })).body;
    await strata.join(shared.id, stranger, SpaceRole.EDITOR);
    const sent: { url: string; body: string; headers: Record<string, string> }[] = [];
    vi.mocked(postPublic).mockImplementation((url, body, headers) => {
      sent.push({ url, body, headers });
      return Promise.resolve(200);
    });

    expect((await owner.call('POST', '/me/webhooks', { url: 'http://hooks.example/in', events: ['task.completed'] })).status).toBe(400);
    expect((await owner.call('POST', '/me/webhooks', { url: 'https://hooks.example/in', events: ['nothing.happened'] })).status).toBe(400);
    expect((await owner.call('POST', '/me/webhooks', { url: 'https://hooks.example/in', events: ['task.completed'], spaceId: (await member('hook-elsewhere')).personalSpaceId })).status).toBe(404);
    const created = await owner.call('POST', '/me/webhooks', { url: 'https://hooks.example/in?token=abc', events: ['task.completed', 'item.created'], spaceId: shared.id });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ host: 'hooks.example', events: ['task.completed', 'item.created'], active: true, spaceId: shared.id });
    expect(created.body.secret).toMatch(/^whsec_[\w-]{43}$/);
    const listed = (await owner.call('GET', '/me/webhooks')).body;
    expect(JSON.stringify(listed)).not.toContain('whsec_');
    expect(JSON.stringify(listed)).not.toContain('token=abc');
    expect((await stranger.call('GET', `/me/webhooks/${created.body.id}/deliveries`)).status).toBe(404);

    await settle(20);
    const task = (await stranger.call('POST', `/spaces/${shared.id}/tasks`, { title: 'Water the beans' })).body;
    await stranger.call('POST', `/tasks/${task.id}/complete`);
    await owner.call('POST', `/spaces/${owner.personalSpaceId}/tasks`, { title: 'Not in the shared space' });
    await strata.service(WebhooksService).scan();
    for (let attempt = 0; attempt < 40 && sent.length < 2; attempt += 1) await settle();

    expect(sent.map(({ headers }) => headers['X-Strata-Event'])).toEqual(['item.created', 'task.completed']);
    const [, completed] = sent;
    expect(completed!.url).toBe('https://hooks.example/in?token=abc');
    expect(completed!.headers['X-Strata-Signature']).toBe(signature(created.body.secret, completed!.headers['X-Strata-Timestamp']!, completed!.body));
    expect(JSON.parse(completed!.body)).toMatchObject({
      id: completed!.headers['X-Strata-Delivery'],
      event: 'task.completed',
      space: { id: shared.id, name: 'Allotment' },
      actor: { id: stranger.id, displayName: 'hook-stranger' },
      item: { id: task.id, kind: 'task', title: 'Water the beans' },
    });
    const deliveries = (await owner.call('GET', `/me/webhooks/${created.body.id}/deliveries`)).body;
    expect(deliveries.map((delivery: { event: string; status: number }) => [delivery.event, delivery.status]).sort()).toEqual([
      ['item.created', 200],
      ['task.completed', 200],
    ]);

    await strata.service(WebhooksService).scan();
    await settle(200);
    expect(sent).toHaveLength(2);

    vi.mocked(postPublic).mockResolvedValue(500);
    expect((await owner.call('POST', `/me/webhooks/${created.body.id}/ping`)).body).toMatchObject({ event: 'ping', status: 500, error: 'The address answered with status 500' });
    expect((await owner.call('PATCH', `/me/webhooks/${created.body.id}`, { active: false })).body.active).toBe(false);
    expect((await owner.call('DELETE', `/me/webhooks/${created.body.id}`)).status).toBe(204);
    expect(await strata.prisma.webhookDelivery.count({ where: { webhookId: created.body.id } })).toBe(0);
  });
});
