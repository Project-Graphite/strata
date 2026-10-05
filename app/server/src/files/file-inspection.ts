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
const jpegMetadataMarkers = new Set([0xe1, 0xed, 0xfe]);
const pngMetadataChunks = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
const webpMetadataChunks = new Set(['EXIF', 'XMP ']);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function startsWith(data: Buffer, ...bytes: number[]) {
  return bytes.every((byte, index) => data[index] === byte);
}

function cleanJpeg(data: Buffer): Image | null {
  const kept = [data.subarray(0, 2)];
  let width = 0;
  let height = 0;
  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1]!;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xda) {
      kept.push(data.subarray(offset));
      return width && height ? { data: Buffer.concat(kept), width, height } : null;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(data.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    const end = offset + 2 + data.readUInt16BE(offset + 2);
    if (end > data.length) return null;
    if (jpegFrameMarkers.has(marker) && end - offset >= 9) {
      height = data.readUInt16BE(offset + 5);
      width = data.readUInt16BE(offset + 7);
    }
    if (!jpegMetadataMarkers.has(marker)) kept.push(data.subarray(offset, end));
    offset = end;
  }
  return null;
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
  if (data.toString('latin1', 0, 6) === 'GIF87a' || data.toString('latin1', 0, 6) === 'GIF89a') {
    return data.length >= 10
      ? { mimeType: 'image/gif', data, width: data.readUInt16LE(6), height: data.readUInt16LE(8) }
      : null;
  }
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
