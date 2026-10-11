import { SpaceRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { JobsService } from '../../src/jobs/jobs.service';
import { dayMs } from '../../src/recurrence/dates';
import { integrationApp } from './harness';

const day = (offset: number) => new Date(Date.now() + offset * dayMs).toISOString().slice(0, 10);

describe('People against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('keeps people with birthdays, contact details and gift ideas, inside their space', async () => {
    const owner = await member('host');
    const viewer = await member('guest');
    const outsider = await member('other');
    const family = (await owner.call('POST', '/spaces', { name: 'Family' })).body;
    await strata.join(family.id, viewer, SpaceRole.VIEWER);

    expect((await viewer.call('POST', `/spaces/${family.id}/people`, { name: 'Sam' })).status).toBe(403);
    expect((await owner.call('POST', `/spaces/${family.id}/people`, { name: 'Sam', birthdayMonth: 2, birthdayDay: 30 })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${family.id}/people`, { name: 'Sam', birthdayMonth: 2 })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${family.id}/people`, { name: 'Sam', email: 'not-an-email' })).status).toBe(400);

    const soon = day(3);
    const sam = (
      await owner.call('POST', `/spaces/${family.id}/people`, {
        name: 'Sam',
        relationship: 'Sister',
        birthdayMonth: Number(soon.slice(5, 7)),
        birthdayDay: Number(soon.slice(8, 10)),
        birthYear: Number(soon.slice(0, 4)) - 30,
        email: 'sam@example.com',
      })
    ).body;
    expect(sam).toMatchObject({ name: 'Sam', relationship: 'Sister', nextBirthday: soon, turning: 30, email: 'sam@example.com', giftIdeas: [], events: [], spaceName: 'Family' });

    const idea = { id: randomUUID(), text: 'A good umbrella', done: false };
    expect((await owner.call('PATCH', `/people/${sam.id}`, { giftIdeas: [idea], phone: '+44 20 7946 0000' })).body).toMatchObject({ giftIdeas: [idea], phone: '+44 20 7946 0000' });
    expect((await owner.call('PATCH', `/people/${sam.id}`, { giftIdeas: [{ text: 'No id', done: false }] })).status).toBe(400);
    expect((await viewer.call('PATCH', `/people/${sam.id}`, { notes: 'Mine' })).status).toBe(403);
    expect((await outsider.call('GET', `/people/${sam.id}`)).status).toBe(404);
    expect((await viewer.call('GET', '/me/people')).body.map((person: { name: string }) => person.name)).toEqual(['Sam']);
    expect((await outsider.call('GET', '/me/people')).body).toEqual([]);

    const dinner = (await owner.call('POST', `/spaces/${family.id}/events`, { title: 'Dinner with Sam', startsOn: day(-10), timeZone: 'UTC' })).body;
    const link = (await owner.call('POST', `/items/${sam.id}/links`, { targetId: dinner.id, kind: 'reference' })).body;
    expect((await owner.call('GET', `/people/${sam.id}`)).body.events).toEqual([
      { linkId: link.id, ownLink: true, id: dinner.id, title: 'Dinner with Sam', startsOn: day(-10), startTime: null },
    ]);
  });

  it('shows birthdays in the agenda and reminds the day before, only for people who turned People on', async () => {
    const owner = await member('remember');
    const partner = await member('forgetful');
    const home = (await owner.call('POST', '/spaces', { name: 'Home' })).body;
    await strata.join(home.id, partner, SpaceRole.EDITOR);
    await owner.call('PATCH', '/me', { features: ['people'] });
    const jobs = strata.service(JobsService);

    const soon = day(3);
    const ana = (await owner.call('POST', `/spaces/${home.id}/people`, { name: 'Ana', birthdayMonth: Number(soon.slice(5, 7)), birthdayDay: Number(soon.slice(8, 10)) })).body;

    const agenda = (await owner.call('GET', `/agenda?from=${day(0)}&to=${day(7)}`)).body;
    expect(agenda.filter((entry: { kind: string }) => entry.kind === 'birthday')).toEqual([
      { kind: 'birthday', itemId: ana.id, spaceId: home.id, title: 'Ana’s birthday', allDay: true, start: soon, end: null, location: null },
    ]);
    expect((await partner.call('GET', `/agenda?from=${day(0)}&to=${day(7)}`)).body.some((entry: { kind: string }) => entry.kind === 'birthday')).toBe(false);

    const pending = () => strata.prisma.scheduledJob.findMany({ where: { kind: 'person.birthday', doneAt: null, payload: { path: ['itemId'], equals: ana.id } } });
    const [reminder] = await pending();
    expect(reminder!.runAt.toISOString()).toBe(`${day(2)}T09:00:00.000Z`);

    const reminded = async () => (await owner.call('GET', '/me/inbox')).body.results.some((entry: { kind: string }) => entry.kind === 'birthday');
    for (let round = 0; round < 50 && !(await reminded()); round += 1) {
      await jobs.runDue(new Date(reminder!.runAt.getTime() + 1_000));
    }
    expect((await owner.call('GET', '/me/inbox')).body.results[0]).toMatchObject({ kind: 'birthday', title: 'Ana’s birthday is tomorrow', link: `/people/${ana.id}` });
    expect((await partner.call('GET', '/me/inbox')).body.results.some((entry: { kind: string }) => entry.kind === 'birthday')).toBe(false);
    const next = (await pending()).find((job) => job.id !== reminder!.id);
    expect(next!.payload).toMatchObject({ birthday: `${Number(soon.slice(0, 4)) + 1}${soon.slice(4)}` });

    await owner.call('PATCH', `/people/${ana.id}`, { birthdayMonth: null, birthdayDay: null });
    expect(await pending()).toEqual([]);
  });
});
