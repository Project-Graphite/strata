import { HttpException, Injectable } from '@nestjs/common';
import { cleanFileName } from '../files/files.controller';
import { FilesService, maxFileBytes } from '../files/files.service';
import { UploadQueue } from '../files/upload-queue';
import { GoogleApiError, GoogleClient, googleHttpError } from './google-client';

const api = 'https://www.googleapis.com/drive/v3/files';

const conversions: Record<string, { mimeType: string; extension: string }> = {
  'application/vnd.google-apps.document': { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx' },
  'application/vnd.google-apps.spreadsheet': { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' },
  'application/vnd.google-apps.presentation': { mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extension: 'pptx' },
  'application/vnd.google-apps.drawing': { mimeType: 'image/png', extension: 'png' },
};

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

function failure(error: unknown) {
  if (error instanceof GoogleApiError && error.status === 413) return 'Files can be at most 25 MB';
  if (error instanceof GoogleApiError && error.status === 403) return 'Google would not export this file. It may be too large to convert.';
  if (error instanceof HttpException) return error.message;
  return googleHttpError(error, 'This file is gone from Google Drive');
}

@Injectable()
export class GoogleDriveService {
  constructor(
    private readonly google: GoogleClient,
    private readonly files: FilesService,
    private readonly uploads: UploadQueue,
  ) {}

  async import(userId: string, input: { fileIds: string[]; spaceId?: string; folderId?: string }) {
    const imported: Awaited<ReturnType<FilesService['upload']>>[] = [];
    const failed: { name: string; reason: string }[] = [];
    for (const fileId of input.fileIds) {
      const file = await this.google
        .request<DriveFile>(userId, `${api}/${encodeURIComponent(fileId)}?fields=id,name,mimeType&supportsAllDrives=true`)
        .catch((error: unknown) => googleHttpError(error, 'That Drive file is gone, or it was not picked for Strata'));
      const converted = conversions[file.mimeType];
      const name = cleanFileName(converted ? `${file.name}.${converted.extension}` : file.name).slice(-200) || 'Google Drive file';
      if (file.mimeType.startsWith('application/vnd.google-apps.') && !converted) {
        failed.push({ name, reason: 'Strata cannot import this kind of Google file' });
        continue;
      }
      const url = converted
        ? `${api}/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent(converted.mimeType)}`
        : `${api}/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`;
      try {
        const data = await this.google.download(userId, url, maxFileBytes);
        imported.push(await this.uploads.run(userId, () => this.files.upload(userId, input.spaceId ?? null, name, data, input.folderId)));
      } catch (error) {
        failed.push({ name, reason: failure(error) });
      }
    }
    return { imported, failed };
  }
}
