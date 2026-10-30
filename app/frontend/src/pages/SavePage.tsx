import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Banner, Fieldset, ListRow, Placeholder, Radio, Skeleton, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { firstLink, saveBookmark } from '../bookmarks';
import { fileSize, uploadFiles } from '../files';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { atMost, required, useFormErrors } from '../validation';
import { Button } from '../components/Button';
import { DialogActions } from '../components/DialogActions';
import { Empty } from '../components/Empty';
import { Page } from '../components/Page';
import { LoadError } from '../components/LoadError';
import { ButtonSkeleton, FieldSkeleton, rowsOf, SkeletonLine } from '../components/Skeletons';

interface Shared {
  title: string;
  text: string;
  url: string;
  files: File[];
}

const shareCache = 'strata-share';

async function readShare(): Promise<Shared | null> {
  if (!('caches' in window) || !(await caches.has(shareCache))) return null;
  const cache = await caches.open(shareCache);
  const text = await cache.match('/share-target/text');
  if (!text) return null;
  const fileKeys = (await cache.keys())
    .map((key) => new URL(key.url).pathname)
    .filter((path) => path.startsWith('/share-target/files/'))
    .sort((a, b) => Number(a.split('/').pop()) - Number(b.split('/').pop()));
  const files = await Promise.all(
    fileKeys.map(async (path) => {
      const response = (await cache.match(path))!;
      return new File([await response.blob()], decodeURIComponent(response.headers.get('X-File-Name') ?? 'shared file'), {
        type: response.headers.get('Content-Type') ?? '',
      });
    }),
  );
  return { ...((await text.json()) as Omit<Shared, 'files'>), files };
}

function suggestedTitle(shared: Shared) {
  const parts: string[] = [];
  for (const part of [shared.title, shared.text, shared.url].map((value) => value.trim())) {
    if (part && !parts.some((kept) => kept.includes(part))) parts.push(part);
  }
  return parts.join(' — ').slice(0, 200);
}

export function SavePage() {
  const auth = useAuth();
  const spaces = useSpaces();
  const navigate = useNavigate();
  const saving = useAction();
  const form = useFormErrors();
  const [shared, setShared] = useState<Shared | null>();
  const [asTask, setAsTask] = useState(false);

  useEffect(() => {
    void readShare().then(setShared);
  }, []);

  if (shared === undefined || !spaces.data) {
    return (
      <Page title="Save what you shared" variant="panel">
        <div className="mt-8">
          {spaces.error ? (
            <LoadError error={spaces.error} onRetry={spaces.reload} />
          ) : (
            <Placeholder className="grid gap-4" label="Opening what you shared">
              <FieldSkeleton />
              <div className="grid gap-2">
                <SkeletonLine className="mb-2 leading-[1.4375]" width="w-16" />
                {rowsOf(2).map((choice) => (
                  <span className="flex h-9.5 items-center gap-2" key={choice}>
                    <Skeleton className="size-5 rounded-full" />
                    <SkeletonLine width={choice ? 'w-10' : 'w-48'} />
                  </span>
                ))}
              </div>
              <SkeletonLine className="text-small" width="w-3/4" />
              <DialogActions>
                <ButtonSkeleton large width="w-24" />
                <ButtonSkeleton large width="w-20" />
              </DialogActions>
            </Placeholder>
          )}
        </div>
      </Page>
    );
  }
  if (!shared) {
    return (
      <Page title="Save what you shared" titleHidden>
        <Empty title="Nothing to save" variant="page">
          Share a link, some text or files to Strata from another app on this device, and they appear here.
        </Empty>
      </Page>
    );
  }
  const editable = spaces.data.filter((space) => space.role !== 'viewer');
  const title = suggestedTitle(shared);
  const link = shared.files.length ? '' : firstLink(shared.url, shared.text, shared.title);
  const asBookmark = Boolean(link) && !asTask;

  async function discard() {
    await caches.delete(shareCache);
    setShared(null);
  }

  return (
    <Page title="Save what you shared" variant="panel">
      <form
        className="mt-8 grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const target = event.currentTarget;
          const values = new FormData(target);
          const taskTitle = String(values.get('title') ?? '').trim();
          const length = atMost(200, 'Use at most 200 characters.');
          const spaceId = String(values.get('spaceId'));
          if (asBookmark) {
            void saving.run(async () => {
              const { bookmark, fetchError } = await saveBookmark(auth.request, spaceId, link);
              await caches.delete(shareCache);
              navigate(`/bookmarks/${bookmark.id}`);
              return fetchError ? `Added ${bookmark.title}, but the page couldn’t be read: ${fetchError}` : `Added ${bookmark.title} to read later.`;
            }, 'Could not save the link');
            return;
          }
          if (!form.check(target, { title: shared.files.length ? [length] : [required('Enter a title for the task.'), length] })) return;
          void saving.run(async () => {
            const task = taskTitle ? await auth.request<{ id: string }>(`/spaces/${spaceId}/tasks`, { method: 'POST', body: JSON.stringify({ title: taskTitle }) }) : null;
            const uploaded = shared.files.length ? await uploadFiles(auth.request, spaceId, shared.files) : '';
            await caches.delete(shareCache);
            navigate(shared.files.length || !task ? '/files' : `/tasks?task=${task.id}`);
            return [task && `Added ${taskTitle}.`, uploaded].filter(Boolean).join(' ');
          }, 'Could not save what you shared');
        }}
      >
        {editable.length === 0 ? (
          <Banner tone="danger">You can only view your spaces, so there is nowhere to save this.</Banner>
        ) : (
          <input name="spaceId" type="hidden" value={editable[0]!.id} />
        )}
        {link && (
          <Fieldset legend="Save as">
            <Radio checked={!asTask} label="Bookmark to read later" name="saveAs" onChange={() => setAsTask(false)} />
            <Radio checked={asTask} label="Task" name="saveAs" onChange={() => setAsTask(true)} />
          </Fieldset>
        )}
        {link && !asTask && <p className="m-0 truncate text-small text-muted">{link}</p>}
        {!asBookmark && (title || shared.files.length === 0) && (
          <TextField defaultValue={title} label={shared.files.length ? 'Also add a task (optional)' : 'Task'} maxLength={200} {...form.field('title')} />
        )}
        {shared.files.length > 0 && (
          <div className="grid gap-2">
            <p className="m-0 text-small text-muted">Files</p>
            <ul className="panel-rows">
              {shared.files.map((file, index) => (
                <ListRow key={index} meta={fileSize(file.size)} title={file.name} />
              ))}
            </ul>
          </div>
        )}
        <DialogActions>
          <Button disabled={saving.busy} label="Discard" large onClick={() => void discard()} />
          <Button disabled={saving.busy || editable.length === 0} label={saving.busy ? 'Saving…' : 'Save'} large primary submit />
        </DialogActions>
      </form>
    </Page>
  );
}
