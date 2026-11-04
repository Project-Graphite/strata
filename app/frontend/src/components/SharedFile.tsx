import { useEffect, useMemo, useState } from 'react';
import { fileSize, previewable, saveBlob } from '../files';
import { useAction } from '../useAction';
import { Button } from './Button';
import { sharedFiles } from './file-source';
import { Page } from './Page';

export interface SharedFileDetails {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export function SharedFile({ code, file }: { code: string; file: SharedFileDetails }) {
  const load = useMemo(() => sharedFiles(code), [code]);
  const download = useAction();
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!previewable(file.mimeType)) return;
    let created = '';
    void load(file.id).then((blob) => {
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      if (created) URL.revokeObjectURL(created);
    };
  }, [file.id, file.mimeType, load]);

  return (
    <Page description={`Shared file · ${fileSize(file.sizeBytes)}`} title={file.name} variant="panel">
      {url && <img alt={file.name} className="mt-6 max-h-[70vh] w-full rounded-field border border-line object-contain" src={url} />}
      <div className="mt-6">
        <Button
          disabled={download.busy}
          label={download.busy ? 'Downloading…' : 'Download'}
          onClick={() =>
            void download.run(async () => {
              saveBlob(await load(file.id), file.name);
              return '';
            }, 'Could not download the file')
          }
          primary
        />
      </div>
    </Page>
  );
}
