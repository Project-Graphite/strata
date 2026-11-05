import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { appCatalogue, enabledApps, orderedApps } from '../../frontend/src/apps';
import { moreSections, phoneTabBar, searchableAreas, sidebarSections } from '../../frontend/src/navigation';
import { moved } from '../../frontend/src/reorder';
import { UpdateProfileDto } from '../src/users/dto/users.dto';

const user = { features: ['tasks', 'agenda', 'pages', 'spending', 'files'], appOrder: ['spending', 'pages', 'agenda'] };

describe('app order', () => {
  it('moves one entry to a new place and clamps the target', () => {
    expect(moved(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moved(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moved(['a', 'b', 'c'], 1, 9)).toEqual(['a', 'c', 'b']);
  });

  it('puts apps in the saved order and the rest in catalogue order after them', () => {
    expect(orderedApps(['tidy', 'tasks']).map((app) => app.key).slice(0, 3)).toEqual(['tidy', 'tasks', 'agenda']);
    expect(orderedApps().map((app) => app.key)).toEqual(appCatalogue.map((app) => app.key));
    expect(enabledApps(user).map((app) => app.key)).toEqual(['spending', 'pages', 'agenda', 'tasks', 'files']);
    expect(enabledApps(undefined)).toEqual([]);
  });

  it('drives the sidebar, phone tabs, More page and search from the same order', () => {
    const apps = enabledApps(user);
    expect(sidebarSections(null, apps)[0]!.items.map((item) => item.href)).toEqual(['/', '/spending', '/pages', '/agenda', '/tasks', '/files']);
    expect(phoneTabBar(null, apps).map((tab) => tab.href)).toEqual(['/', '/spending', '/pages', '/spaces', '/more']);
    expect(moreSections(null, apps)[0]!.items.map((item) => item.href)).toEqual(['/agenda', '/tasks', '/files']);
    expect(searchableAreas(apps, false).slice(1, 6).map((area) => area.href)).toEqual(['/spending', '/pages', '/agenda', '/tasks', '/files']);
  });

  it('accepts only known apps, once each, as an order', async () => {
    const errors = async (appOrder: unknown) => (await validate(plainToInstance(UpdateProfileDto, { appOrder }))).map((error) => error.property);
    expect(await errors(['tasks', 'agenda'])).toEqual([]);
    expect(await errors(['tasks', 'tasks'])).toEqual(['appOrder']);
    expect(await errors(['games'])).toEqual(['appOrder']);
  });
});
