import { useState } from 'react';
import { Link } from 'react-router';
import { Dialog } from '@project-graphite/ui';
import { useAuth } from '../auth';
import type { DraftPart } from '../draft-parts';
import { useAction } from '../useAction';
import { Button } from './Button';
import { DialogActions } from './DialogActions';
import { Hint } from './Hint';

export function DraftRecoveryDialog({ parts, spaceId, onClose, onComplete }: { parts: DraftPart[]; spaceId: string; onClose: () => void; onComplete: (firstId: string) => void }) {
  const auth = useAuth();
  const action = useAction();
  const [completed, setCompleted] = useState<Record<number, string>>({});
  return (
    <Dialog dismissible={!action.busy} onClose={onClose} title="Recover draft">
      <div className="mt-5 grid gap-4">
        <Hint>{parts.length > 1 ? `This draft will become ${parts.length} smaller pages. Large blocks continue across parts.` : 'Retry recovering this draft into a new page.'} Keep this window open to resume after an error.</Hint>
        <p className="m-0 text-small text-muted" role="status">{Object.keys(completed).length} of {parts.length} recovered</p>
        <ul className="m-0 grid max-h-64 list-none gap-3 overflow-y-auto p-0">
          {parts.map((part, index) => <li className="flex items-center justify-between gap-4 text-body" key={part.id}><span>{part.title}</span>{completed[index] ? action.busy ? <span className="text-muted">Recovered</span> : <Link to={`/pages/${completed[index]}`}>Open recovered page</Link> : <span className="text-muted">Waiting</span>}</li>)}
        </ul>
        <DialogActions>
          <Button disabled={action.busy} label="Close" large onClick={onClose} />
          <Button disabled={action.busy} label={action.busy ? 'Recovering…' : Object.keys(completed).length ? 'Resume recovery' : `Recover ${parts.length} ${parts.length === 1 ? 'page' : 'pages'}`} onClick={() => void action.run(async () => {
            const { recoverDraftPart } = await import('../draft-parts');
            let firstId = completed[0];
            for (const [index, part] of parts.entries()) {
              if (completed[index]) continue;
              const recovered = await recoverDraftPart(auth.request, spaceId, part);
              if (index === 0) firstId = recovered.id;
              setCompleted((current) => ({ ...current, [index]: recovered.id }));
            }
            onComplete(firstId!);
            return `Recovered ${parts.length} ${parts.length === 1 ? 'page' : 'pages'}.`;
          }, 'Could not finish recovery. Completed pages are kept; resume to continue.')} large primary />
        </DialogActions>
      </div>
    </Dialog>
  );
}
