import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

describe('Trips against Postgres', () => {
  const strata = integrationApp();
  const { member, upload } = strata;

  it('keeps a trip with its packing list, itinerary, documents, notes and spending in one place', async () => {
    await strata.prisma.exchangeRate.upsert({ where: { currency: 'EUR' }, create: { currency: 'EUR', perEuro: 1, publishedOn: new Date('2026-10-09') }, update: { perEuro: 1 } });
    await strata.prisma.exchangeRate.upsert({ where: { currency: 'USD' }, create: { currency: 'USD', perEuro: 1.25, publishedOn: new Date('2026-10-09') }, update: { perEuro: 1.25 } });
    const owner = await member('traveller');
    const friend = await member('companion');
    const outsider = await member('stay-at-home');
    const group = (await owner.call('POST', '/spaces', { name: 'Lisbon crew' })).body;
    await strata.join(group.id, friend, SpaceRole.VIEWER);

    const trip = { title: 'Lisbon', destination: 'Lisbon, Portugal', startsOn: '2027-05-01', endsOn: '2027-05-06', budgetMinor: 120000, currency: 'EUR' };
    expect((await friend.call('POST', `/spaces/${group.id}/trips`, trip)).status).toBe(403);
    expect((await owner.call('POST', `/spaces/${group.id}/trips`, { ...trip, endsOn: '2027-04-30' })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${group.id}/trips`, { ...trip, endsOn: '2028-06-01' })).status).toBe(400);
    const lisbon = (await owner.call('POST', `/spaces/${group.id}/trips`, trip)).body;
    expect(lisbon).toMatchObject({ title: 'Lisbon', destination: 'Lisbon, Portugal', when: 'upcoming', spaceName: 'Lisbon crew', itinerary: [], documents: [], pages: [], expenses: [] });
    expect(lisbon.packing).toMatchObject({ title: 'Packing for Lisbon', tasks: [] });

    await owner.call('POST', `/spaces/${group.id}/tasks`, { title: 'Passport', listId: lisbon.packing.id });
    const flight = (await owner.call('POST', `/spaces/${group.id}/events`, { title: 'Flight out', startsOn: '2027-05-01', startTime: '08:15', timeZone: 'Europe/Lisbon' })).body;
    const dinner = (await owner.call('POST', `/spaces/${group.id}/events`, { title: 'Dinner in Alfama', startsOn: '2027-05-02', timeZone: 'Europe/Lisbon' })).body;
    const ticket = await (await upload(owner, group.id, 'Boarding pass.pdf', Buffer.from('%PDF-1.7 pass'))).json();
    const notes = (await owner.call('POST', `/spaces/${group.id}/notes`, { title: 'Places to eat' })).body;
    const hotel = (await owner.call('POST', `/spaces/${group.id}/expenses`, { title: 'Hotel', amountMinor: 60000, currency: 'EUR', spentOn: '2027-05-01', category: 'travel' })).body;
    const tour = (await owner.call('POST', `/spaces/${group.id}/expenses`, { title: 'Tram tour', amountMinor: 2500, currency: 'USD', spentOn: '2027-05-03', category: 'travel' })).body;
    for (const target of [dinner, flight, ticket, notes, hotel, tour]) {
      expect((await owner.call('POST', `/items/${lisbon.id}/links`, { targetId: target.id, kind: 'reference' })).status).toBe(201);
    }

    const detail = (await friend.call('GET', `/trips/${lisbon.id}`)).body;
    expect(detail.itinerary.map((entry: { title: string }) => entry.title)).toEqual(['Flight out', 'Dinner in Alfama']);
    expect(detail.itinerary[0]).toMatchObject({ startsOn: '2027-05-01', startTime: '08:15' });
    expect(detail.packing.tasks.map((task: { title: string }) => task.title)).toEqual(['Passport']);
    expect(detail.documents).toMatchObject([{ id: ticket.id, title: 'Boarding pass.pdf', mimeType: 'application/pdf' }]);
    expect(detail.pages).toMatchObject([{ id: notes.id, title: 'Places to eat' }]);
    expect(detail.expenses.map((expense: { title: string }) => expense.title)).toEqual(['Tram tour', 'Hotel']);
    expect(detail.spending).toEqual({ currency: 'EUR', spentMinor: 62000, missing: [] });
    expect((await outsider.call('GET', `/trips/${lisbon.id}`)).status).toBe(404);

    expect((await friend.call('PATCH', `/trips/${lisbon.id}`, { destination: 'Porto' })).status).toBe(403);
    expect((await owner.call('PATCH', `/trips/${lisbon.id}`, { endsOn: '2027-04-01' })).status).toBe(400);
    expect((await owner.call('PATCH', `/trips/${lisbon.id}`, { endsOn: '2027-05-08', budgetMinor: null })).body).toMatchObject({ endsOn: '2027-05-08', budgetMinor: null });

    await owner.call('POST', `/spaces/${group.id}/trips`, { title: 'Last spring', startsOn: '2026-04-01', endsOn: '2026-04-03' });
    expect((await friend.call('GET', '/me/trips')).body.map((shown: { title: string; when: string }) => [shown.title, shown.when])).toEqual([
      ['Last spring', 'past'],
      ['Lisbon', 'upcoming'],
    ]);

    expect((await owner.call('POST', `/items/${hotel.id}/trash`)).status).toBe(204);
    expect((await owner.call('GET', `/trips/${lisbon.id}`)).body.spending.spentMinor).toBe(2000);
  });
});
