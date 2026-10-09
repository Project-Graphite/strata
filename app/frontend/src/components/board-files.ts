import type { BinaryFileData, DataURL } from '@excalidraw/excalidraw/types';
import type { FileSource } from './file-source';

(window as { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = '/excalidraw/';

function dataUrl(blob: Blob) {
  return new Promise<DataURL>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as DataURL);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image'));
    reader.readAsDataURL(blob);
  });
}

export async function boardImage(load: FileSource, fileId: string): Promise<BinaryFileData> {
  const blob = await load(fileId);
  return { id: fileId as BinaryFileData['id'], dataURL: await dataUrl(blob), mimeType: blob.type as BinaryFileData['mimeType'], created: Date.now() };
}
