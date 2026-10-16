import { describe, expect, it } from 'vitest';
import { inspectFile } from '../src/files/file-inspection';

function segment(marker: number, body: Buffer) {
  const header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([header, body]);
}

function chunk(type: string, body: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  return Buffer.concat([length, Buffer.from(type, 'latin1'), body, Buffer.alloc(4)]);
}

function riffChunk(type: string, body: Buffer) {
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  return Buffer.concat([Buffer.from(type, 'latin1'), size, body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

describe('inspectFile', () => {
  it('removes Exif, Photoshop and comment segments from a JPEG and reads its size', () => {
    const frame = Buffer.from([8, 0, 4, 0, 3, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      segment(0xe0, Buffer.from('JFIF\0keep', 'latin1')),
      segment(0xe1, Buffer.from('Exif\0\0GPS 51.5,-0.1', 'latin1')),
      segment(0xed, Buffer.from('Photoshop IPTC', 'latin1')),
      segment(0xfe, Buffer.from('taken at home', 'latin1')),
      segment(0xc0, frame),
      segment(0xda, Buffer.alloc(10)),
      Buffer.from('scan data', 'latin1'),
      Buffer.from([0xff, 0xd9]),
    ]);

    const inspected = inspectFile(jpeg, 'photo.jpg')!;

    expect(inspected).toMatchObject({ mimeType: 'image/jpeg', width: 3, height: 4 });
    const kept = inspected.data.toString('latin1');
    expect(kept).toContain('JFIF');
    expect(kept).toContain('scan data');
    expect(kept).not.toContain('GPS');
    expect(kept).not.toContain('Photoshop');
    expect(kept).not.toContain('taken at home');
  });

  it('keeps only colour segments of a JPEG, keeps every scan and drops whatever follows the image', () => {
    const frame = Buffer.from([8, 0, 4, 0, 3, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
    const scan = Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]);
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      segment(0xe2, Buffer.from('ICC_PROFILE\0colour', 'latin1')),
      segment(0xe2, Buffer.from('MPF\0second image index', 'latin1')),
      segment(0xeb, Buffer.from('JP gain map XMP GPS', 'latin1')),
      segment(0xee, Buffer.from('Adobe', 'latin1')),
      segment(0xc2, frame),
      segment(0xda, Buffer.alloc(8)),
      scan,
      segment(0xc4, Buffer.from('table', 'latin1')),
      segment(0xda, Buffer.alloc(8)),
      scan,
      Buffer.from([0xff, 0xd9]),
      Buffer.from([0xff, 0xd8]),
      segment(0xe1, Buffer.from('Exif\0\0GPS of the hidden image', 'latin1')),
    ]);

    const inspected = inspectFile(jpeg, 'photo.jpg')!;

    expect(inspected).toMatchObject({ mimeType: 'image/jpeg', width: 3, height: 4 });
    const kept = inspected.data.toString('latin1');
    expect(kept).toContain('ICC_PROFILE');
    expect(kept).toContain('Adobe');
    expect(kept).toContain('table');
    expect(kept).not.toContain('MPF');
    expect(kept).not.toContain('GPS');
    expect(inspected.data.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect(inspected.data.indexOf(scan)).not.toBe(inspected.data.lastIndexOf(scan));
  });

  it('removes comments and metadata from a GIF but keeps its animation loop', () => {
    const block = (bytes: Buffer) => Buffer.concat([Buffer.from([bytes.length]), bytes]);
    const extension = (label: number, ...blocks: Buffer[]) => Buffer.concat([Buffer.from([0x21, label]), ...blocks.map(block), Buffer.from([0])]);
    const screen = Buffer.from([5, 0, 6, 0, 0x80, 0, 0]);
    const image = Buffer.concat([Buffer.from([0x2c, 0, 0, 0, 0, 5, 0, 6, 0, 0, 2]), block(Buffer.from([0x44, 0x01])), Buffer.from([0])]);
    const gif = Buffer.concat([
      Buffer.from('GIF89a', 'latin1'),
      screen,
      Buffer.alloc(6),
      extension(0xff, Buffer.from('NETSCAPE2.0', 'latin1'), Buffer.from([1, 0, 0])),
      extension(0xff, Buffer.from('XMP DataXMP', 'latin1'), Buffer.from('GPS 51.5,-0.1', 'latin1')),
      extension(0xfe, Buffer.from('taken at home', 'latin1')),
      extension(0xf9, Buffer.from([0, 10, 0, 0])),
      image,
      Buffer.from([0x3b]),
      Buffer.from('appended secret', 'latin1'),
    ]);

    const inspected = inspectFile(gif, 'loop.gif')!;

    expect(inspected).toMatchObject({ mimeType: 'image/gif', width: 5, height: 6 });
    const kept = inspected.data.toString('latin1');
    expect(kept).toContain('NETSCAPE2.0');
    expect(kept).not.toContain('XMP');
    expect(kept).not.toContain('GPS');
    expect(kept).not.toContain('taken at home');
    expect(kept).not.toContain('appended secret');
    expect(inspected.data.subarray(-1)).toEqual(Buffer.from([0x3b]));
    expect(inspectFile(gif.subarray(0, gif.indexOf(0x3b, 30)), 'cut.gif')?.data.subarray(-1)).toEqual(Buffer.from([0x3b]));
    expect(inspectFile(Buffer.concat([gif.subarray(0, 19), Buffer.from([0x99])]), 'broken.gif')).toBeNull();
  });

  it('removes text and Exif chunks from a PNG and reads its size', () => {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(5, 0);
    header.writeUInt32BE(6, 4);
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('tEXt', Buffer.from('Comment\0secret place', 'latin1')),
      chunk('eXIf', Buffer.from('GPS', 'latin1')),
      chunk('IDAT', Buffer.from('pixels', 'latin1')),
      chunk('IEND', Buffer.alloc(0)),
    ]);

    const inspected = inspectFile(png, 'shot.png')!;

    expect(inspected).toMatchObject({ mimeType: 'image/png', width: 5, height: 6 });
    expect(inspected.data.toString('latin1')).toContain('pixels');
    expect(inspected.data.toString('latin1')).not.toContain('secret place');
    expect(inspected.data.toString('latin1')).not.toContain('GPS');
  });

  it('removes Exif and XMP from a WebP, clears their flags and fixes the RIFF size', () => {
    const extended = Buffer.alloc(10);
    extended[0] = 0x0c;
    extended.writeUIntLE(9, 4, 3);
    extended.writeUIntLE(19, 7, 3);
    const body = Buffer.concat([
      Buffer.from('WEBP', 'latin1'),
      riffChunk('VP8X', extended),
      riffChunk('EXIF', Buffer.from('GPS 51.5', 'latin1')),
      riffChunk('XMP ', Buffer.from('<x:xmpmeta/>', 'latin1')),
      riffChunk('VP8 ', Buffer.alloc(12)),
    ]);
    const size = Buffer.alloc(4);
    size.writeUInt32LE(body.length);
    const webp = Buffer.concat([Buffer.from('RIFF', 'latin1'), size, body]);

    const inspected = inspectFile(webp, 'image.webp')!;

    expect(inspected).toMatchObject({ mimeType: 'image/webp', width: 10, height: 20 });
    expect(inspected.data.toString('latin1')).not.toContain('GPS');
    expect(inspected.data.toString('latin1')).not.toContain('xmpmeta');
    expect(inspected.data[20]! & 0x0c).toBe(0);
    expect(inspected.data.readUInt32LE(4)).toBe(inspected.data.length - 8);
  });

  it('recognises documents by their first bytes and refuses everything else', () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

    expect(inspectFile(Buffer.from('%PDF-1.7 ...'), 'a.pdf')?.mimeType).toBe('application/pdf');
    expect(inspectFile(zip, 'Report.DOCX')?.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(inspectFile(zip, 'archive.zip')?.mimeType).toBe('application/zip');
    expect(inspectFile(Buffer.from('Shopping list\n- milk'), 'list.txt')?.mimeType).toBe('text/plain');
    expect(inspectFile(Buffer.from('<?xml version="1.0"?>\n<svg xmlns="x"></svg>'), 'logo.svg')?.mimeType).toBe(
      'image/svg+xml',
    );
    expect(inspectFile(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]), 'setup.exe')).toBeNull();
    expect(inspectFile(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'broken.jpg')).toBeNull();
  });

  it('inspects text full of comments without stalling', () => {
    expect(inspectFile(Buffer.from('<!---->'.repeat(5_000) + 'x'), 'notes.txt')?.mimeType).toBe('text/plain');
    expect(inspectFile(Buffer.from('<!-- logo --->\n<!-- - -->\n<svg></svg>'), 'logo.svg')?.mimeType).toBe('image/svg+xml');
  });
});
