import { SpaceRole, UserRole } from '@prisma/client';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FilesService } from '../../src/files/files.service';
import { integrationApp, type Member } from './harness';

function png(note: string, pixels = 'pixels') {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(3, 4);
  const chunk = (type: string, body: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    return Buffer.concat([length, Buffer.from(type, 'latin1'), body, Buffer.alloc(4)]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('tEXt', Buffer.from(`Comment\0${note}`, 'latin1')),
    chunk('IDAT', Buffer.from(pixels, 'latin1')),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const exists = (path: string) => access(path).then(() => true, () => false);

describe('The file store against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  afterAll(() => strata.prisma.siteSettings.deleteMany({ where: { id: 1 } }));

  function upload(as: Member, spaceId: string, name: string, data: Buffer, type = 'application/octet-stream') {
    return fetch(`${strata.base}/spaces/${spaceId}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${as.token}`, 'Content-Type': type, 'X-File-Name': encodeURIComponent(name) },
      body: new Uint8Array(data),
    });
  }

  function download(as: Member, itemId: string) {
    return fetch(`${strata.base}/files/${itemId}`, { headers: { Authorization: `Bearer ${as.token}` } });
  }

  it('stores uploads as items without their metadata and serves them only to members', async () => {
    const editor = await member('uploader');
    const viewer = await member('glancer');
    const outsider = await member('snoop');
    const space = (await editor.call('POST', '/spaces', { name: 'Photos' })).body;
    await strata.join(space.id, viewer, SpaceRole.VIEWER);

    const uploaded = await upload(editor, space.id, 'garden ☀.png', png('home address'));
    expect(uploaded.status).toBe(201);
    const item = await uploaded.json();
    expect(item).toMatchObject({
      kind: 'file',
      title: 'garden ☀.png',
      file: { mimeType: 'image/png', width: 2, height: 3 },
    });
    expect((await viewer.call('GET', `/spaces/${space.id}/items?kind=file`)).body.totalResults).toBe(1);

    const image = await download(viewer, item.id);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('content-disposition')).toBe("inline; filename*=UTF-8''garden%20%E2%98%80.png");
    expect(image.headers.get('content-security-policy')).toBe('sandbox');
    expect(image.headers.get('x-content-type-options')).toBe('nosniff');
    const bytes = Buffer.from(await image.arrayBuffer());
    expect(bytes.toString('latin1')).toContain('pixels');
    expect(bytes.toString('latin1')).not.toContain('home address');
    expect(Number(image.headers.get('content-length'))).toBe(bytes.length);

    const pdf = await (await upload(editor, space.id, 'Lease.pdf', Buffer.from('%PDF-1.7 lease'))).json();
    expect((await download(viewer, pdf.id)).headers.get('content-disposition')).toMatch(/^attachment;/);

    expect((await download(outsider, item.id)).status).toBe(404);
    expect((await upload(viewer, space.id, 'mine.png', png('x'))).status).toBe(403);
    expect((await upload(outsider, space.id, 'mine.png', png('x'))).status).toBe(404);
    expect((await upload(editor, space.id, 'setup.exe', Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0]))).status).toBe(415);
    expect((await upload(editor, space.id, 'data.json', Buffer.from('{}'), 'application/json')).status).toBe(400);
    expect((await upload(editor, space.id, '', png('x'))).status).toBe(400);
    expect((await upload(editor, space.id, 'huge.txt', Buffer.alloc(25 * 1024 * 1024 + 1, 0x61))).status).toBe(413);
  });

  it('keeps one copy of identical files and removes it once nothing uses it', async () => {
    const owner = await member('saver');
    const data = png('copy', `pixels ${owner.id}`);
    const first = await (await upload(owner, owner.personalSpaceId, 'a.png', data)).json();
    const second = await (await upload(owner, owner.personalSpaceId, 'b.png', data)).json();
    const { sha256 } = await strata.prisma.file.findUniqueOrThrow({ where: { itemId: first.id } });
    const blob = join(strata.filesRoot, sha256.slice(0, 2), sha256);
    expect(await strata.prisma.fileBlob.count({ where: { sha256 } })).toBe(1);
    expect(await exists(blob)).toBe(true);

    const later = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const files = strata.service(FilesService);
    expect((await owner.call('POST', `/items/${first.id}/trash`)).status).toBe(204);
    expect((await owner.call('DELETE', `/items/${first.id}`)).status).toBe(204);
    await files.removeOrphans(later);
    expect(await exists(blob)).toBe(true);

    expect((await owner.call('POST', `/items/${second.id}/trash`)).status).toBe(204);
    expect((await owner.call('DELETE', `/items/${second.id}`)).status).toBe(204);
    expect(await strata.prisma.file.count({ where: { sha256 } })).toBe(0);
    await files.removeOrphans(new Date());
    expect(await strata.prisma.fileBlob.count({ where: { sha256 } })).toBe(1);
    expect(await exists(blob)).toBe(true);
    await files.removeOrphans(later);
    expect(await strata.prisma.fileBlob.count({ where: { sha256 } })).toBe(0);
    expect(await exists(blob)).toBe(false);
  });

  it('stops uploads at the storage limit the system manager sets', async () => {
    const manager = await member('quota', UserRole.SYSTEM_MANAGER);
    const owner = await member('hoarder');
    expect((await manager.call('PATCH', '/admin/site', { fileQuotaMb: 1 })).body).toMatchObject({ fileQuotaMb: 1 });

    expect((await upload(owner, owner.personalSpaceId, 'one.txt', Buffer.alloc(700 * 1024, 0x61))).status).toBe(201);
    const refused = await upload(owner, owner.personalSpaceId, 'two.txt', Buffer.alloc(700 * 1024, 0x62));
    expect(refused.status).toBe(413);
    expect((await refused.json()).message).toContain('1 MB');
    await manager.call('PATCH', '/admin/site', { fileQuotaMb: 100 });
  });
});
