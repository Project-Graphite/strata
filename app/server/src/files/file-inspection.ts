export interface InspectedFile {
  mimeType: string;
  data: Buffer;
  width: number | null;
  height: number | null;
}

interface Image {
  data: Buffer;
  width: number;
  height: number;
}

export const inlineTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export const officeTypes = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
} as const;

const jpegFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const gifApplications = new Set(['NETSCAPE2.0', 'ANIMEXTS1.0', 'ICCRGBG1012']);
const pngMetadataChunks = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
const webpMetadataChunks = new Set(['EXIF', 'XMP ']);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function startsWith(data: Buffer, ...bytes: number[]) {
  return bytes.every((byte, index) => data[index] === byte);
}

function keptJpegSegment(marker: number, segment: Buffer) {
  if (marker === 0xfe) return false;
  if (marker < 0xe0 || marker > 0xef) return true;
  return marker === 0xe0 || marker === 0xee || (marker === 0xe2 && segment.toString('latin1', 4, 16) === 'ICC_PROFILE\0');
}

function scanEnd(data: Buffer, offset: number) {
  for (let at = data.indexOf(0xff, offset); at >= 0 && at + 1 < data.length; at = data.indexOf(0xff, at + 1)) {
    const next = data[at + 1]!;
    if (next !== 0x00 && next !== 0xff && (next < 0xd0 || next > 0xd7)) return at;
  }
  return data.length;
}

function cleanJpeg(data: Buffer): Image | null {
  const kept = [data.subarray(0, 2)];
  let width = 0;
  let height = 0;
  let scanned = false;
  let offset = 2;
  while (offset + 2 <= data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1]!;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd9) {
      kept.push(data.subarray(offset, offset + 2));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(data.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 4 > data.length) return null;
    const end = offset + 2 + data.readUInt16BE(offset + 2);
    if (end > data.length) return null;
    if (jpegFrameMarkers.has(marker) && end - offset >= 9) {
      height = data.readUInt16BE(offset + 5);
      width = data.readUInt16BE(offset + 7);
    }
    if (keptJpegSegment(marker, data.subarray(offset, end))) kept.push(data.subarray(offset, end));
    offset = end;
    if (marker === 0xda) {
      scanned = true;
      const scan = scanEnd(data, offset);
      kept.push(data.subarray(offset, scan));
      offset = scan;
    }
  }
  return scanned && width && height ? { data: Buffer.concat(kept), width, height } : null;
}

function gifColorTableBytes(packed: number) {
  return packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0;
}

function gifSubBlocksEnd(data: Buffer, offset: number) {
  while (offset < data.length) {
    const size = data[offset]!;
    offset += 1 + size;
    if (size === 0) return offset;
  }
  return data.length + 1;
}

function keptGifExtension(data: Buffer, offset: number) {
  const label = data[offset + 1];
  if (label === 0xfe) return false;
  return label !== 0xff || gifApplications.has(data.toString('latin1', offset + 3, offset + 14));
}

function cleanGif(data: Buffer): Image | null {
  if (data.length < 13) return null;
  let offset = 13 + gifColorTableBytes(data[10]!);
  const kept = [data.subarray(0, offset)];
  while (offset < data.length && data[offset] !== 0x3b) {
    const block = data[offset]!;
    let end: number;
    if (block === 0x2c && offset + 10 <= data.length) end = gifSubBlocksEnd(data, offset + 11 + gifColorTableBytes(data[offset + 9]!));
    else if (block === 0x21) end = gifSubBlocksEnd(data, offset + 2);
    else return null;
    if (end > data.length) return null;
    if (block === 0x2c || keptGifExtension(data, offset)) kept.push(data.subarray(offset, end));
    offset = end;
  }
  kept.push(Buffer.from([0x3b]));
  return { data: Buffer.concat(kept), width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
}

function cleanPng(data: Buffer): Image | null {
  const kept = [data.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= data.length) {
    const end = offset + 12 + data.readUInt32BE(offset);
    const type = data.toString('latin1', offset + 4, offset + 8);
    if (end > data.length) return null;
    if (!pngMetadataChunks.has(type)) kept.push(data.subarray(offset, end));
    offset = end;
    if (type === 'IEND') {
      return { data: Buffer.concat(kept), width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
    }
  }
  return null;
}

function cleanWebp(data: Buffer): Image | null {
  const kept: Buffer[] = [];
  let width = 0;
  let height = 0;
  let offset = 12;
  while (offset + 8 <= data.length) {
    const type = data.toString('latin1', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (offset + 8 + size > data.length) return null;
    const body = offset + 8;
    if (type === 'VP8X' && size >= 10) {
      const chunk = Buffer.from(data.subarray(offset, Math.min(end, data.length)));
      chunk[8] = chunk[8]! & ~0x0c;
      width = data.readUIntLE(body + 4, 3) + 1;
      height = data.readUIntLE(body + 7, 3) + 1;
      kept.push(chunk);
    } else {
      if (type === 'VP8 ' && !width && size >= 10) {
        width = data.readUInt16LE(body + 6) & 0x3fff;
        height = data.readUInt16LE(body + 8) & 0x3fff;
      }
      if (type === 'VP8L' && !width && size >= 5) {
        const bits = data.readUInt32LE(body + 1);
        width = (bits & 0x3fff) + 1;
        height = ((bits >> 14) & 0x3fff) + 1;
      }
      if (!webpMetadataChunks.has(type)) kept.push(data.subarray(offset, Math.min(end, data.length)));
    }
    offset = end;
  }
  if (!width || !height) return null;
  const body = Buffer.concat(kept);
  const header = Buffer.from(data.subarray(0, 12));
  header.writeUInt32LE(body.length + 4, 4);
  return { data: Buffer.concat([header, body]), width, height };
}

function text(data: Buffer) {
  if (data.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(0, 64 * 1024));
  } catch {
    return null;
  }
}

function image(mimeType: string, cleaned: Image | null): InspectedFile | null {
  return cleaned && { mimeType, data: cleaned.data, width: cleaned.width, height: cleaned.height };
}

function attachment(mimeType: string, data: Buffer): InspectedFile {
  return { mimeType, data, width: null, height: null };
}

export function inspectFile(data: Buffer, name: string): InspectedFile | null {
  if (startsWith(data, 0xff, 0xd8, 0xff)) return image('image/jpeg', cleanJpeg(data));
  if (data.subarray(0, 8).equals(pngSignature)) return image('image/png', cleanPng(data));
  if (data.toString('latin1', 0, 6) === 'GIF87a' || data.toString('latin1', 0, 6) === 'GIF89a') return image('image/gif', cleanGif(data));
  if (data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') {
    return image('image/webp', cleanWebp(data));
  }
  if (data.toString('latin1', 0, 5) === '%PDF-') return attachment('application/pdf', data);
  if (startsWith(data, 0x50, 0x4b, 0x03, 0x04) || startsWith(data, 0x50, 0x4b, 0x05, 0x06)) {
    return attachment(officeTypes[(name.split('.').pop()?.toLowerCase() ?? '') as keyof typeof officeTypes] ?? 'application/zip', data);
  }
  const content = text(data);
  if (content === null) return null;
  return attachment(/^﻿?\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(content) ? 'image/svg+xml' : 'text/plain', data);
}
