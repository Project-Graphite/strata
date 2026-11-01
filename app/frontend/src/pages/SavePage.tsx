import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Banner, ListRow, Placeholder, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { fetchArticle, firstLink, quickBookmark, siteLabel, type Bookmark } from '../bookmarks';
import { isNativeAndroid, StrataCapture } from '../native-capture';
import { fileSize, uploadFiles } from '../files';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { atMost, required, useFormErrors } from '../validation';
import { Button } from '../components/Button';
import { DialogActions } from '../components/DialogActions';
import { Empty } from '../components/Empty';
import { Page } from '../components/Page';
import { LoadError } from '../components/LoadError';
import { ButtonSkeleton, FieldSkeleton } from '../components/Skeletons';

interface Shared {
  title: string;
  text: string;
  url: string;
  files: File[];
}

const shareCache = 'strata-share';

async function readNativeShare(): Promise<Shared | null> {
  const shared = await StrataCapture.takeShare();
  if (shared.text === undefined && !shared.files?.length) return null;
  const files = (shared.files ?? []).map((file) => new File([Uint8Array.from(atob(file.data), (character) => character.charCodeAt(0))], file.name, { type: file.type }));
  return { title: shared.title ?? '', text: shared.text ?? '', url: shared.url ?? '', files };
}

async function readShare(): Promise<Shared | null> {
  if (isNativeAndroid()) return readNativeShare();
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

function linkTitle(shared: Shared, link: string) {
  return ([shared.title, shared.text].map((part) => part.replace(link, '').trim()).find(Boolean) ?? '').slice(0, 200);
}

export function SavePage() {
  return <SaveShared key={useLocation().key} />;
}

function SaveShared() {
  const auth = useAuth();
  const spaces = useSpaces();
  const navigate = useNavigate();
  const saving = useAction();
  const form = useFormErrors();
  const [shared, setShared] = useState<Shared | null>();
  const [saved, setSaved] = useState<{ bookmark: Bookmark; created: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const editable = spaces.data?.filter((space) => space.role !== 'viewer') ?? [];
  const spaceId = editable[0]?.id;
  const link = shared && !shared.files.length ? firstLink(shared.url, shared.text, shared.title) : '';

  function save(shared: Shared, spaceId: string) {
    setFailed(false);
    void saving
      .run(async () => {
        const title = linkTitle(shared, link);
        const quick = await quickBookmark(auth.request, spaceId, link, title);
        setSaved(quick);
        void caches.delete(shareCache);
        if (quick.created) {
          void fetchArticle(auth.request, quick.bookmark, title).then(
            (bookmark) => setSaved({ ...quick, bookmark }),
            () => undefined,
          );
        }
        return '';
      }, 'Could not save the link')
      .then((done) => setFailed(!done));
  }

  useEffect(() => {
    void readShare().then(setShared);
  }, []);

  useEffect(() => {
    if (!shared || !link || !spaceId || started.current) return;
    started.current = true;
    save(shared, spaceId);
  });

  if (shared === undefined || !spaces.data) {
    return (
      <Page title="Save what you shared" variant="panel">
        <div className="mt-8">
          {spaces.error ? (
            <LoadError error={spaces.error} onRetry={spaces.reload} />
          ) : (
            <Placeholder className="grid gap-4" label="Opening what you shared">
              <FieldSkeleton />
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
  const title = suggestedTitle(shared);
  const noSpace = editable.length === 0 && <Banner tone="danger">You can only view your spaces, so there is nowhere to save this.</Banner>;

  if (link) {
    return (
      <Page title={saved ? (saved.created ? 'Saved to bookmarks' : 'Already in bookmarks') : 'Saving to bookmarks'} variant="panel">
        <div className="mt-8 grid gap-4">
          {noSpace}
          <ul className="panel-rows">
            <ListRow meta={saved ? siteLabel(saved.bookmark) : link} title={saved?.bookmark.title ?? (linkTitle(shared, link) || link)} />
          </ul>
          <DialogActions>
            <Button
              disabled={!saved || saving.busy}
              label="Make it a task"
              large
              onClick={() => {
                if (!saved) return;
                void saving.run(async () => {
                  const task = await auth.request<{ id: string }>(`/spaces/${saved.bookmark.spaceId}/tasks`, { method: 'POST', body: JSON.stringify({ title }) });
                  if (saved.created) await auth.request(`/items/${saved.bookmark.id}/trash`, { method: 'POST' });
                  navigate(`/tasks?task=${task.id}`);
                  return `Added ${title}.`;
                }, 'Could not make it a task');
              }}
            />
            {saved ? (
              <Button label="Open" large primary onClick={() => navigate(`/bookmarks/${saved.bookmark.id}`)} />
            ) : (
              <Button
                disabled={!failed || saving.busy || !spaceId}
                label={failed && !saving.busy ? 'Try again' : 'Saving…'}
                large
                onClick={() => spaceId && save(shared, spaceId)}
                primary
              />
            )}
          </DialogActions>
        </div>
      </Page>
    );
  }

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
        {noSpace || <input name="spaceId" type="hidden" value={spaceId} />}
        {(title || shared.files.length === 0) && (
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
