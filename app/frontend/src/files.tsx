import { useEffect, useState } from 'react';
import { readBlob } from './api';
import { useAuth } from './auth';
import type { Item } from './spaces';

export const maxUploadBytes = 25 * 1024 * 1024;
const maxPhotoSide = 2560;
const photoTypes = new Set(['image/jpeg', 'image/webp']);
const previewTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function preparedUpload(file: File): Promise<Blob> {
  if (!photoTypes.has(file.type) || typeof createImageBitmap !== 'function') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxPhotoSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.85));
  return encoded && encoded.size < file.size ? encoded : file;
}

export function saveBlob(blob: Blob, name: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function hasPreview(item: Item) {
  return Boolean(item.file && previewTypes.has(item.file.mimeType));
}

export function FilePreview({ item }: { item: Item }) {
  const { request } = useAuth();
  const [url, setUrl] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let created = '';
    void request<Blob>(`/files/${item.id}`, { signal: controller.signal }, readBlob)
      .then((blob) => {
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch(() => setUrl(''));
    return () => {
      controller.abort();
      if (created) URL.revokeObjectURL(created);
    };
  }, [item.id, request]);

  return url ? (
    <img alt="" className="h-14 w-14 shrink-0 rounded-lg border border-line object-cover" src={url} />
  ) : (
    <span aria-hidden="true" className="h-14 w-14 shrink-0 rounded-lg border border-line bg-surface" />
  );
}
