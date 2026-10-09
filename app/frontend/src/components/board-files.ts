import type { BinaryFileData, DataURL } from '@excalidraw/excalidraw/types';
import { readBlob } from '../api';
import type { useAuth } from '../auth';

(window as { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = '/excalidraw/';

function dataUrl(blob: Blob) {
  return new Promise<DataURL>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as DataURL);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image'));
    reader.readAsDataURL(blob);
  });
}

export async function boardImage(request: ReturnType<typeof useAuth>['request'], fileId: string): Promise<BinaryFileData> {
  const blob = await request<Blob>(`/files/${fileId}`, {}, readBlob);
  return { id: fileId as BinaryFileData['id'], dataURL: await dataUrl(blob), mimeType: blob.type as BinaryFileData['mimeType'], created: Date.now() };
}
