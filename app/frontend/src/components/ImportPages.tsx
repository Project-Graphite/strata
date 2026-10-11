import { useState } from 'react';
import { Dialog } from '@project-graphite/ui';
import { useAuth } from '../auth';
import type { Space } from '../spaces';
import { useAction } from '../useAction';

export function ImportPages({ onClose, onDone, spaces }: { onClose: () => void; onDone: () => void; spaces: Space[] }) {
  const auth = useAuth();
  const importing = useAction();
  const [spaceId, setSpaceId] = useState(spaces[0]!.id);

  function start(files: FileList | null) {
    if (!files?.length) return;
    const chosen = [...files];
    void importing.run(async () => {
      const { importPages } = await import('../page-import');
      const { imported, tooLong } = await importPages(auth.request, spaceId, chosen);
      onDone();
      onClose();
      return [
        imported === 0 ? 'No Markdown files were found.' : imported === 1 ? 'Imported 1 page.' : `Imported ${imported} pages.`,
        tooLong ? `${tooLong} ${tooLong === 1 ? 'page was' : 'pages were'} too long to import.` : '',
      ]
        .filter(Boolean)
        .join(' ');
    }, 'Could not import the pages');
  }

  return (
    <Dialog onClose={onClose} title="Import pages">
      <div className="grid gap-4">
        <p className="m-0 text-sm text-muted">
          Markdown files become pages. For a Notion export, unzip it and choose the folder: pages keep their nesting and their images come along.
        </p>
        {spaces.length > 1 && (
          <label className="field-label">
            Space
            <select onChange={(event) => setSpaceId(event.currentTarget.value)} value={spaceId}>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-wrap gap-3">
          <label className={`secondary-button ${importing.busy ? 'pointer-events-none opacity-60' : ''}`}>
            Choose Markdown files
            <input accept=".md,.markdown,text/markdown" className="sr-only" disabled={importing.busy} multiple onChange={(event) => start(event.currentTarget.files)} type="file" />
          </label>
          <label className={`secondary-button ${importing.busy ? 'pointer-events-none opacity-60' : ''}`}>
            Choose a folder
            <input className="sr-only" disabled={importing.busy} onChange={(event) => start(event.currentTarget.files)} type="file" {...{ webkitdirectory: '' }} />
          </label>
        </div>
        {importing.busy && (
          <p className="m-0 text-sm text-muted" role="status">
            Importing…
          </p>
        )}
      </div>
    </Dialog>
  );
}
