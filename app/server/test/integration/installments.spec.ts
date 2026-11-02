import { describe, expect, it, vi } from 'vitest';
import { MaintenanceScheduler } from '../../src/jobs/maintenance.scheduler';
import { InstallmentsService } from '../../src/spending/installments.service';
import { integrationApp } from './harness';

describe('Installments and card due dates against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('tracks plans and card due dates, reminds before and after a missed payment, and puts them on the agenda', async () => {
    const owner = await member('installer');
    const viewer = await member('installment-viewer');
    expect((await owner.call('POST', '/me/accounts', { name: 'Bad card', kind: 'credit_card', currency: 'EGP', dueDay: 32 })).status).toBe(400);
    const card = (await owner.call('POST', '/me/accounts', { name: 'CIB Visa', kind: 'credit_card', currency: 'EGP', balanceMinor: -250_000, creditLimitMinor: 5_000_000, dueDay: 20 })).body;
    expect(card.dueDay).toBe(20);
    expect(card).not.toHaveProperty('spaceId');
    const elsewhere = (await viewer.call('POST', '/me/accounts', { name: 'Other', currency: 'EGP' })).body;

    const plan = { name: 'valU phone', currency: 'EGP', monthlyMinor: 100_000, count: 6, firstDueOn: '2027-01-31', accountId: card.id };
    expect((await owner.call('POST', '/me/installments', { ...plan, count: 0 })).status).toBe(400);
    expect((await owner.call('POST', '/me/installments', { ...plan, accountId: elsewhere.id })).status).toBe(400);
    expect((await viewer.call('POST', '/me/installments', plan)).status).toBe(400);
    const phone = (await owner.call('POST', '/me/installments', plan)).body;
    expect(phone).toMatchObject({ totalMinor: 600_000, remainingMinor: 600_000, nextDueOn: '2027-01-31', status: 'due', paidCount: 0 });
    expect((await owner.call('POST', `/installments/${phone.id}/paid`)).body.nextDueOn).toBe('2027-02-28');
    expect((await owner.call('POST', `/installments/${phone.id}/paid`)).body).toMatchObject({ nextDueOn: '2027-03-31', remainingMinor: 400_000 });
    expect((await owner.call('PATCH', `/installments/${phone.id}`, { paidCount: 7 })).status).toBe(400);
    expect((await owner.call('PATCH', `/installments/${phone.id}`, { paidCount: 6 })).body).toMatchObject({ status: 'done', nextDueOn: null, remainingMinor: 0 });
    await owner.call('PATCH', `/installments/${phone.id}`, { paidCount: 2 });
    expect((await viewer.call('PATCH', `/installments/${phone.id}`, { paidCount: 3 })).status).toBe(404);
    expect((await viewer.call('GET', '/me/installments')).body).toEqual([]);
    expect((await owner.call('GET', '/me/installments')).body.map((shown: { name: string }) => shown.name)).toEqual(['valU phone']);

    const maintenance = strata.service(MaintenanceScheduler) as unknown as { running: boolean };
    await vi.waitFor(() => expect(maintenance.running).toBe(false), { timeout: 15_000 });
    const installments = strata.service(InstallmentsService);
    const remindedFrom = new Date();
    for (const at of ['2027-03-29', '2027-03-30', '2027-04-02', '2027-04-03', '2027-04-18']) await installments.remind(new Date(`${at}T09:00:00Z`));
    const notes = await strata.prisma.inboxNotification.findMany({
      where: { userId: owner.id, kind: 'payment_due', createdAt: { gte: remindedFrom } },
      orderBy: { createdAt: 'asc' },
      select: { title: true, body: true, link: true },
    });
    expect(notes).toEqual([
      { title: 'valU phone is due on Wed 31 Mar', body: expect.stringMatching(/^EGP\s1,000\.00, payment 3 of 6$/), link: '/spending/accounts' },
      { title: 'Missed payment: valU phone', body: expect.stringMatching(/^EGP\s1,000\.00 was due on Wed 31 Mar$/), link: '/spending/accounts' },
      { title: 'CIB Visa is due on Tue 20 Apr', body: expect.stringMatching(/^EGP\s2,500\.00 owed$/), link: '/spending/accounts' },
    ]);
    expect(await strata.prisma.inboxNotification.count({ where: { userId: viewer.id, kind: 'payment_due' } })).toBe(0);

    const agenda = (await owner.call('GET', '/agenda?from=2027-03-01&to=2027-05-01')).body;
    expect(agenda.filter((entry: { kind: string }) => entry.kind === 'payment').map((entry: { start: string; title: string; spaceId: string | null }) => [entry.start, entry.title, entry.spaceId])).toEqual([
      ['2027-03-20', 'CIB Visa payment due', null],
      ['2027-03-31', 'valU phone installment', null],
      ['2027-04-20', 'CIB Visa payment due', null],
      ['2027-04-30', 'valU phone installment', null],
    ]);
    expect((await viewer.call('GET', '/agenda?from=2027-03-01&to=2027-05-01')).body).toEqual([]);
    expect((await owner.call('DELETE', `/installments/${phone.id}`)).status).toBe(204);
    expect((await owner.call('DELETE', `/installments/${phone.id}`)).status).toBe(404);
  });
});
