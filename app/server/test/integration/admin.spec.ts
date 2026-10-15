import { UserRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

describe('Admin against Postgres', () => {
  const strata = integrationApp();
  const { member, upload } = strata;

  it('lists every account with its role and storage to admins only', async () => {
    const admin = await member('overseer', UserRole.ADMIN);
    const someone = await member('regular');
    expect((await upload(someone, someone.personalSpaceId, 'notes.txt', Buffer.alloc(2048, 0x61))).status).toBe(201);

    expect((await someone.call('GET', '/admin/users')).status).toBe(403);
    const listed = await admin.call('GET', '/admin/users');
    expect(listed.status).toBe(200);
    expect(listed.body.find((user: { id: string }) => user.id === someone.id)).toMatchObject({
      email: someone.email,
      handle: someone.handle,
      role: 'member',
      isActive: true,
      usedBytes: 2048,
    });
    expect(listed.body.find((user: { id: string }) => user.id === admin.id)).toMatchObject({ role: 'admin', usedBytes: 0 });
    expect(listed.body[0]).not.toHaveProperty('passwordHash');
  });
});
