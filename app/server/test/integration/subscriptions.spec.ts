import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { JobsService } from '../../src/jobs/jobs.service';
import { MaintenanceScheduler } from '../../src/jobs/maintenance.scheduler';
import { integrationApp } from './harness';

const dayMs = 24 * 60 * 60 * 1000;
const utcDate = (offsetDays: number) => new Date(Date.now() + offsetDays * dayMs).toISOString().slice(0, 10);

describe('Subscriptions against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('checks what a subscription may hold and keeps it inside its space', async () => {
    const owner = await member('payer');
    const viewer = await member('looker');
    const outsider = await member('nosy');
    const space = (await owner.call('POST', '/spaces', { name: 'Household' })).body;
    await strata.join(space.id, viewer, SpaceRole.VIEWER);
    const valid = { name: 'Music', amountMinor: 999, currency: 'eur', repeatRule: 'FREQ=MONTHLY', startDate: utcDate(10) };

    for (const [change, reason] of [
      [{ paymentLabel: '4242 4242 4242 4242' }, 'card number'],
      [{ cancelUrl: 'http://example.com/cancel' }, 'plain http link'],
      [{ currency: 'EU' }, 'short currency'],
      [{ repeatRule: 'FREQ=HOURLY' }, 'unsupported rule'],
      [{ category: 'gambling' }, 'unknown category'],
    ] as const) {
      expect({ reason, status: (await owner.call('POST', `/spaces/${space.id}/subscriptions`, { ...valid, ...change })).status }).toEqual({
        reason,
        status: 400,
      });
    }
    const created = await owner.call('POST', `/spaces/${space.id}/subscriptions`, { ...valid, paymentLabel: 'Visa ending 1234' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ currency: 'EUR', nextRenewal: utcDate(10), paymentLabel: 'Visa ending 1234', category: 'other' });
    expect((await viewer.call('GET', `/subscriptions/${created.body.id}`)).status).toBe(200);
    expect((await viewer.call('POST', `/spaces/${space.id}/subscriptions`, valid)).status).toBe(403);
    expect((await viewer.call('PATCH', `/subscriptions/${created.body.id}`, { amountMinor: 1 })).status).toBe(403);
    expect((await outsider.call('GET', `/subscriptions/${created.body.id}`)).status).toBe(404);
    expect((await outsider.call('GET', '/subscriptions/summary')).body.totals).toEqual([]);
  });

  it('adds up yearly and monthly costs, keeps price history and drops cancelled ones', async () => {
    const owner = await member('counter');
    const space = owner.personalSpaceId;
    const music = (
      await owner.call('POST', `/spaces/${space}/subscriptions`, {
        name: 'Music',
        amountMinor: 999,
        currency: 'EUR',
        repeatRule: 'FREQ=MONTHLY',
        startDate: '2026-01-15',
        category: 'music',
      })
    ).body;
    await owner.call('POST', `/spaces/${space}/subscriptions`, {
      name: 'Domain',
      amountMinor: 1500,
      currency: 'USD',
      repeatRule: 'FREQ=YEARLY',
      startDate: '2025-03-01',
      category: 'software',
    });

    const summary = (await owner.call('GET', '/subscriptions/summary')).body;
    expect(summary.totals).toEqual([
      { currency: 'EUR', yearlyMinor: 11_988, monthlyMinor: 999 },
      { currency: 'USD', yearlyMinor: 1_500, monthlyMinor: 125 },
    ]);
    expect(summary.categories[0]).toMatchObject({ category: 'music', currency: 'EUR', yearlyMinor: 11_988 });
    expect(summary.upcoming).toHaveLength(2);

    await owner.call('PATCH', `/subscriptions/${music.id}`, { amountMinor: 1199 });
    expect((await owner.call('GET', `/subscriptions/${music.id}/prices`)).body.map((price: { amountMinor: number }) => price.amountMinor)).toEqual([
      1199, 999,
    ]);

    expect((await owner.call('POST', `/subscriptions/${music.id}/cancel`)).body.cancelledOn).not.toBeNull();
    expect((await owner.call('GET', '/subscriptions/summary')).body.totals.map((total: { currency: string }) => total.currency)).toEqual(['USD']);
    expect((await owner.call('GET', `/spaces/${space}/subscriptions?status=cancelled`)).body).toHaveLength(1);
    expect((await owner.call('POST', `/subscriptions/${music.id}/resume`)).body.cancelledOn).toBeNull();
  });

  it('warns about trials and unused subscriptions, and reminds before renewals', async () => {
    const owner = await member('trialist');
    const jobs = strata.service(JobsService);
    const trial = (
      await owner.call('POST', `/spaces/${owner.personalSpaceId}/subscriptions`, {
        name: 'Video',
        amountMinor: 1299,
        currency: 'GBP',
        repeatRule: 'FREQ=MONTHLY',
        startDate: utcDate(10),
        trialEndsOn: utcDate(5),
        reminderDays: 3,
      })
    ).body;
    const reminders = await strata.prisma.scheduledJob.findMany({
      where: { kind: 'subscription.reminder', doneAt: null, payload: { path: ['itemId'], equals: trial.id } },
      orderBy: { runAt: 'asc' },
    });
    expect(reminders.map((job) => job.runAt.toISOString())).toEqual([`${utcDate(2)}T09:00:00.000Z`, `${utcDate(7)}T09:00:00.000Z`]);

    const summary = (await owner.call('GET', '/subscriptions/summary')).body;
    expect(summary.trials.map((entry: { id: string }) => entry.id)).toEqual([trial.id]);
    expect(summary.stillWorthIt).toEqual([]);
    await strata.prisma.subscription.update({ where: { itemId: trial.id }, data: { lastUsedOn: new Date(`${utcDate(-61)}T00:00:00Z`) } });
    expect((await owner.call('GET', '/subscriptions/summary')).body.stillWorthIt.map((entry: { id: string }) => entry.id)).toEqual([trial.id]);
    await owner.call('POST', `/subscriptions/${trial.id}/used`);
    expect((await owner.call('GET', '/subscriptions/summary')).body.stillWorthIt).toEqual([]);

    await jobs.runDue(new Date(reminders[0]!.runAt.getTime() + 1_000));
    expect((await owner.call('GET', '/me/inbox')).body.results[0]).toMatchObject({
      kind: 'subscription_due',
      title: `The free trial of Video ends on ${utcDate(5)}, then it costs £12.99`,
    });
  });

  it('moves a passed renewal to the next one on its own', async () => {
    const owner = await member('renewer');
    const gym = (
      await owner.call('POST', `/spaces/${owner.personalSpaceId}/subscriptions`, {
        name: 'Gym',
        amountMinor: 3000,
        currency: 'EUR',
        repeatRule: 'FREQ=WEEKLY',
        startDate: utcDate(-30),
      })
    ).body;
    await strata.prisma.subscription.update({ where: { itemId: gym.id }, data: { nextRenewal: new Date(`${utcDate(-9)}T00:00:00Z`) } });

    await strata.service(MaintenanceScheduler).run(new Date());

    const renewed = (await owner.call('GET', `/subscriptions/${gym.id}`)).body;
    expect(renewed.nextRenewal >= utcDate(0) && renewed.nextRenewal < utcDate(7)).toBe(true);
    expect((await owner.call('GET', `/spaces/${owner.personalSpaceId}/activity`)).body.results[0]).toMatchObject({
      verb: 'subscription.renewed',
      data: { title: 'Gym', nextRenewal: renewed.nextRenewal },
    });
  });
});
