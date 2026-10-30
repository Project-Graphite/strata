import { useEffect, useReducer, useRef } from 'react';
import { Link } from 'react-router';
import { Dialog, ListRow } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { saveBlob } from '../files';
import { runPageImport, type PageImportPlan } from '../page-import';
import { useAction } from '../useAction';
import { saveImportProgress } from '../page-import-progress';
import { Button, TextButton } from './Button';
import { DialogActions } from './DialogActions';
import { Hint } from './Hint';

export default function MarkdownImportDialog({ plan, spaceId, onClose, onDone }: { plan: PageImportPlan; spaceId: string; onClose: () => void; onDone: () => void }) {
  const auth = useAuth();
  const action = useAction();
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const ready = plan.pages.filter((page) => !page.blocked);
  const completed = ready.filter((page) => page.created && page.nested && page.indexed).length;
  const started = plan.pages.some((page) => page.created || page.error);
  return (
    <Dialog dismissible={!action.busy} onClose={onClose} title="Review page import">
      <div className="mt-5 grid gap-4">
        <Hint>{ready.length} pages ready; {plan.pages.length - ready.length} skipped. Nothing is uploaded until you start. Original images are kept unchanged; missing or unsupported images keep their descriptions.</Hint>
        <Hint>Completed pages are kept on failure. Save import progress before closing or reloading, then load it in Import with the original source folder to resume. CSV databases are not available yet.</Hint>
        <p className="m-0 text-small text-muted" role="status">{completed} of {ready.length} completed · {plan.uploaded.size} images uploaded</p>
        {plan.pages.length === 0 && <Hint>No Markdown files were found. Choose unzipped Markdown files or a Notion export folder.</Hint>}
        <ul className="panel-rows max-h-96 overflow-y-auto">
          {plan.pages.map((page) => <ListRow key={page.id} meta={page.path} title={page.title || 'Untitled'}>
            <span className="text-small text-muted">{page.parentPath ? `Inside ${plan.pages.find((parent) => parent.path === page.parentPath)?.title || page.parentPath}` : 'Space root'}</span>
            <span className="text-small text-muted">{page.blocked ? `Skipped: ${page.blocked}` : page.error ? `Needs retry: ${page.error}` : page.created && page.nested && page.indexed ? 'Imported' : page.created ? 'Page created; finishing placement and links' : 'Ready'}</span>
            {page.issues.map((issue) => <span className="text-small text-muted" key={issue}>{issue}</span>)}
            {page.created && !action.busy && <Link className="w-fit text-small" onClick={onClose} to={`/notes/${page.id}`}>Open imported page</Link>}
          </ListRow>)}
        </ul>
        {plan.uploaded.size > 0 && <Hint>Uploaded files stay in the selected space if a later step fails. Review them in Files before removing any.</Hint>}
        <DialogActions start={<div className="flex flex-wrap gap-2">
          <TextButton disabled={action.busy} label="Save import progress" onClick={() => void action.run(async () => {
            saveBlob(await saveImportProgress(plan, auth.user!.id, spaceId), 'strata-import.strata-import');
            return 'Saved import progress. Keep the original source files to resume.';
          }, 'Could not save import progress')} />
          <TextButton disabled={action.busy} label="Download import report" onClick={() => saveBlob(new Blob([JSON.stringify({ pages: plan.pages.map(({ id, path, title, blocked, created, nested, indexed, issues, error }) => ({ id, path, title, blocked, created, nested, indexed, issues, error })), uploadedImages: [...plan.uploaded].map(([path, id]) => ({ path, id })), omittedImages: [...plan.omitted].map(([path, reason]) => ({ path, reason })) }, null, 2)], { type: 'application/json' }), 'strata-import-report.json')} />
        </div>}>
          <Button disabled={action.busy} label={completed === ready.length ? 'Done' : 'Close'} large onClick={onClose} primary={completed === ready.length} />
          {completed < ready.length && <Button disabled={action.busy} label={action.busy ? 'Importing…' : started ? 'Resume import' : `Import ${ready.length} ${ready.length === 1 ? 'page' : 'pages'}`} large onClick={() => void action.run(async () => {
            controller.current = new AbortController();
            await runPageImport(auth.request, spaceId, plan, refresh, controller.current.signal);
            if (controller.current.signal.aborted) return '';
            onDone();
            return plan.pages.some((page) => page.error) ? 'Imported pages are kept. Review the failures and resume.' : 'Finished importing the supported pages.';
          }, 'Could not finish importing the pages')} primary />}
        </DialogActions>
      </div>
    </Dialog>
  );
}
