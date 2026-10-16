import { useState } from 'react';
import { Dialog, Select } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { spaceOptions, type Space } from '../spaces';
import { useAction } from '../useAction';
import { Hint } from './Hint';
import { FileButton } from './FileButton';

export function ImportPages({ onClose, onDone, spaces }: { onClose: () => void; onDone: () => void; spaces: Space[] }) {
  const auth = useAuth();
  const importing = useAction();
  const [spaceId, setSpaceId] = useState(spaces[0]!.id);

  function start(chosen: File[]) {
    void importing.run(async () => {
      const { importPages } = await import('../page-import');
      const { imported, tooLong } = await importPages(auth.request, spaceId, chosen).finally(onDone);
      onClose();
      return [
        imported === 1 ? 'Imported 1 page.' : imported ? `Imported ${imported} pages.` : tooLong ? '' : 'No Markdown files were found.',
        tooLong ? `${tooLong} ${tooLong === 1 ? 'page was' : 'pages were'} too long to import.` : '',
      ]
        .filter(Boolean)
        .join(' ');
    }, 'Could not import the pages');
  }

  return (
    <Dialog onClose={onClose} title="Import pages">
      <div className="grid gap-4">
        <Hint>
          Markdown files become pages. For a Notion export, unzip it and choose the folder: pages keep their nesting and their images come along.
        </Hint>
        {spaces.length > 1 && (
          <Select label="Space" onChange={setSpaceId} options={spaceOptions(spaces)} value={spaceId} />
        )}
        <div className="flex flex-wrap gap-3">
          <FileButton accept=".md,.markdown,text/markdown" busy={importing.busy} label="Choose Markdown files" multiple onFiles={start} />
          <FileButton busy={importing.busy} folder label="Choose a folder" onFiles={start} />
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
