import { createContext, useContext, useMemo } from 'react';
import { apiRequest, readBlob } from '../api';
import { useAuth } from '../auth';

export type FileSource = (fileId: string) => Promise<Blob>;

export const FileSourceContext = createContext<FileSource | null>(null);

export function sharedFiles(code: string): FileSource {
  return (fileId) => apiRequest<Blob>(`/share/${encodeURIComponent(code)}/files/${fileId}`, {}, undefined, readBlob);
}

export function useFileSource(): FileSource {
  const shared = useContext(FileSourceContext);
  const { request } = useAuth();
  return useMemo(() => shared ?? ((fileId: string) => request<Blob>(`/files/${fileId}`, {}, readBlob)), [shared, request]);
}
