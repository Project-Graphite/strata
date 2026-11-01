import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router';
import { Banner, Dialog, LinesSkeleton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import type { Space } from '../spaces';
import { useAction } from '../useAction';
import { Hint } from './Hint';
import { FileButton } from './FileButton';
import { Button } from './Button';
import { DialogActions } from './DialogActions';
import type { DraftPart } from '../draft-parts';
import { DraftRecoveryDialog } from './DraftRecoveryDialog';
import type { PageImportPlan } from '../page-import';
import { readImportProgress, verifyImportSources, type ImportProgress } from '../page-import-progress';
import { pageHref } from '../notes';

const MarkdownImportDialog = lazy(() => import('./MarkdownImportDialog'));

export function ImportPages({ onClose, onDone, spaces }: { onClose: () => void; onDone: () => void; spaces: Space[] }) {
  const auth = useAuth();
  const importing = useAction();
  const navigate = useNavigate();
  const spaceId = spaces[0]!.id;
  const [recovery, setRecovery] = useState<DraftPart[]>();
  const [pageImport, setPageImport] = useState<PageImportPlan>();
  const [progress, setProgress] = useState<ImportProgress>();

  function recovered(id: string) {
    onDone();
    onClose();
    navigate(pageHref(id));
  }

  function recover([file]: File[]) {
    void importing.run(async () => {
      const { draftRecoveryParts, recoverDraftPart } = await import('../draft-parts');
      const parts = await draftRecoveryParts(file!);
      if (parts.length > 1) {
        setRecovery(parts);
        return '';
      }
      try {
        recovered((await recoverDraftPart(auth.request, spaceId, parts[0]!)).id);
      } catch (error) {
        setRecovery(parts);
        throw error;
      }
      return 'Recovered the draft into a new page.';
    }, 'Could not recover the draft');
  }

  function start(chosen: File[]) {
    void importing.run(async () => {
      const { preparePageImport } = await import('../page-import');
      if (progress) await verifyImportSources(chosen, progress, auth.user!.id, spaceId);
      setPageImport(await preparePageImport(chosen, progress));
      return '';
    }, 'Could not import the pages');
  }

  if (recovery) return <DraftRecoveryDialog onClose={() => setRecovery(undefined)} onComplete={recovered} parts={recovery} spaceId={spaceId} />;
  if (pageImport) return <Suspense fallback={<LinesSkeleton label="Preparing import preview" lines={6} />}><MarkdownImportDialog onClose={onClose} onDone={onDone} plan={pageImport} spaceId={spaceId} /></Suspense>;

  return (
    <Dialog dismissible={!importing.busy} onClose={onClose} title="Import pages">
      <div className="mt-5 grid gap-4">
        <Hint>
          Markdown files become pages. For a Notion export, unzip it and choose the folder: pages keep their nesting and their images come along.
        </Hint>
        <Hint>Strata draft files recover body formatting or board content into a new page. Attachments require access to their original files; database properties are separate.</Hint>
        {progress && (
          <Banner action={<Button label="Clear progress" onClick={() => setProgress(undefined)} />}>
            Loaded progress for {progress.pages.length} pages. Choose the original source folder or files to resume. Changed source files are refused.
          </Banner>
        )}
        <div className="flex flex-wrap gap-3">
          <FileButton accept=".md,.markdown,text/markdown" busy={importing.busy} label="Choose Markdown files" multiple onFiles={start} />
          <FileButton busy={importing.busy} folder label="Choose a folder" onFiles={start} />
          <FileButton accept=".strata-page" busy={importing.busy} label="Recover a draft" onFiles={recover} />
          <FileButton accept=".strata-import" busy={importing.busy} label="Load import progress" onFiles={([file]) => void importing.run(async () => {
            const saved = await readImportProgress(file!);
            if (saved.userId !== auth.user!.id) throw new Error('Resume this import with the original account');
            if (spaceId !== saved.spaceId) throw new Error('Switch to the original space before resuming this import');
            setProgress(saved);
            return 'Choose the original source folder or Markdown files.';
          }, 'Could not load import progress')} />
        </div>
        {importing.busy && (
          <p className="m-0 text-small text-muted" role="status">
            Importing…
          </p>
        )}
        <DialogActions>
          <Button disabled={importing.busy} label="Done" large onClick={onClose} />
        </DialogActions>
      </div>
    </Dialog>
  );
}
