import { ValidateBy } from 'class-validator';

export const maxRichTextBytes = 200_000;

export function isRichText(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const document = value as { type?: unknown; content?: unknown };
  return document.type === 'doc' && (document.content === undefined || Array.isArray(document.content)) && Buffer.byteLength(JSON.stringify(value)) <= maxRichTextBytes;
}

export const IsRichText = () =>
  ValidateBy({ name: 'isRichText', validator: { validate: isRichText, defaultMessage: () => 'Descriptions are editor documents of at most 200 KB.' } });
