import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

describe('Simple databases against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  const schema = (people = true) => ({
    properties: [
      { id: 'status', name: 'Status', type: 'select', options: [{ id: 'todo', name: 'To do', color: 'gray' }, { id: 'done', name: 'Done', color: 'green' }] },
      { id: 'due', name: 'Due', type: 'date' },
      { id: 'cost', name: 'Cost', type: 'number' },
      { id: 'tags', name: 'Tags', type: 'multiSelect', options: [{ id: 'home', name: 'Home', color: 'blue' }, { id: 'work', name: 'Work', color: 'red' }] },
      ...(people ? [{ id: 'owner', name: 'Owner', type: 'person' }] : []),
      { id: 'site', name: 'Site', type: 'link' },
      { id: 'paid', name: 'Paid', type: 'checkbox' },
    ],
    view: 'board',
    groupBy: 'status',
    dateBy: 'due',
  });

  it('turns a page into a database, keeps typed values on its pages and lists them', async () => {
    const owner = await member('collector');
    const viewer = await member('onlooker');
    const outsider = await member('stranger');
    const space = (await owner.call('POST', '/spaces', { name: 'Flat' })).body;
    await strata.join(space.id, viewer, SpaceRole.VIEWER);
    const database = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Repairs' })).body;
    const row = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Boiler', parentId: database.id })).body;
    const loose = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Loose' })).body;

    expect((await owner.call('GET', `/notes/${database.id}/database`)).status).toBe(404);
    expect((await viewer.call('PUT', `/notes/${database.id}/database`, schema())).status).toBe(403);
    expect((await owner.call('PUT', `/notes/${database.id}/database`, { ...schema(), groupBy: 'due' })).status).toBe(400);
    const saved = await owner.call('PUT', `/notes/${database.id}/database`, schema());
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ view: 'board', groupBy: 'status', dateBy: 'due', rows: [{ id: row.id, title: 'Boiler', values: {} }] });
    expect((await owner.call('GET', `/notes/${database.id}`)).body).toMatchObject({ database: true, row: null });

    const values = { status: 'todo', due: '2026-10-20', cost: 120.5, tags: ['home', 'home'], owner: viewer.id, site: ' https://example.com/fix ', paid: false };
    expect((await owner.call('PATCH', `/notes/${row.id}/properties`, { values })).body).toEqual({
      values: { status: 'todo', due: '2026-10-20', cost: 120.5, tags: ['home'], owner: viewer.id, site: 'https://example.com/fix', paid: false },
    });
    expect((await owner.call('PATCH', `/notes/${row.id}/properties`, { values: { status: 'lost' } })).body.message).toBe('Status needs one of its options');
    expect((await owner.call('PATCH', `/notes/${row.id}/properties`, { values: { due: '2026-02-30' } })).body.message).toBe('Due needs a date');
    expect((await owner.call('PATCH', `/notes/${row.id}/properties`, { values: { owner: outsider.id } })).status).toBe(400);
    expect((await owner.call('PATCH', `/notes/${row.id}/properties`, { values: { site: 'javascript:alert(1)' } })).status).toBe(400);
    expect((await owner.call('PATCH', `/notes/${row.id}/properties`, { values: { nothing: 1 } })).status).toBe(400);
    expect((await owner.call('PATCH', `/notes/${loose.id}/properties`, { values: { cost: 1 } })).status).toBe(400);
    expect((await viewer.call('PATCH', `/notes/${row.id}/properties`, { values: { cost: 1 } })).status).toBe(403);
    expect((await outsider.call('GET', `/notes/${database.id}/database`)).status).toBe(404);

    expect((await owner.call('PATCH', `/notes/${row.id}/properties`, { values: { paid: null, site: '' } })).body.values).not.toHaveProperty('paid');
    expect((await viewer.call('GET', `/notes/${row.id}`)).body).toMatchObject({
      row: { properties: expect.arrayContaining([expect.objectContaining({ id: 'status', type: 'select' })]), values: { status: 'todo', cost: 120.5 } },
    });
    expect((await viewer.call('GET', `/notes/${database.id}/database`)).body.rows[0].values).toMatchObject({ status: 'todo', due: '2026-10-20' });
  });

  it('drops values that no longer fit when the properties change, and all of them when it stops being a database', async () => {
    const owner = await member('reshaper');
    const space = (await owner.call('POST', '/spaces', { name: 'Garden' })).body;
    const database = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Plants' })).body;
    const row = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Basil', parentId: database.id })).body;
    await owner.call('PUT', `/notes/${database.id}/database`, schema(false));
    await owner.call('PATCH', `/notes/${row.id}/properties`, { values: { status: 'done', tags: ['home', 'work'], cost: 3, due: '2026-11-01', paid: true } });

    const next = schema(false);
    next.properties = next.properties
      .filter((property) => property.id !== 'paid')
      .map((property) => {
        if (property.id === 'tags') return { ...property, options: [{ id: 'work', name: 'Work', color: 'red' }] };
        if (property.id === 'status') return { ...property, options: [{ id: 'todo', name: 'To do', color: 'gray' }] };
        if (property.id === 'cost') return { ...property, type: 'text' };
        return property;
      });
    const saved = (await owner.call('PUT', `/notes/${database.id}/database`, next)).body;
    expect(saved.rows[0].values).toEqual({ tags: ['work'], due: '2026-11-01' });

    expect((await owner.call('DELETE', `/notes/${database.id}/database`)).status).toBe(204);
    expect((await owner.call('GET', `/notes/${database.id}`)).body.database).toBe(false);
    expect((await owner.call('GET', `/notes/${row.id}`)).body.row).toBeNull();
    expect((await owner.call('PATCH', `/notes/${row.id}/properties`, { values: { due: '2026-11-02' } })).status).toBe(400);
  });
});
