import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { EmptyState, FormPanelSkeleton, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { fileSize, uploadFiles } from '../files';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { atMost, required, useFormErrors } from '../validation';

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

  useEffect(() => {
    void readShare().then(setShared);
  }, []);

  if (shared === undefined || !spaces.data) return <FormPanelSkeleton label="Opening what you shared" />;
  if (!shared) {
    return (
      <EmptyState title="Nothing to save">
        <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">
          Share a link, some text or files to Strata from another app on this device, and they appear here.
        </p>
      </EmptyState>
    );
  }
  const editable = spaces.data.filter((space) => space.role !== 'viewer');
  const title = suggestedTitle(shared);

  async function discard() {
    await caches.delete(shareCache);
    setShared(null);
  }

  return (
    <section className="form-panel page-enter">
      <h1 className="page-heading">Save what you shared</h1>
      <form
        className="mt-8 grid gap-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const target = event.currentTarget;
          const values = new FormData(target);
          const taskTitle = String(values.get('title') ?? '').trim();
          const length = atMost(200, 'Use at most 200 characters.');
          if (!form.check(target, { title: shared.files.length ? [length] : [required('Enter a title for the task.'), length] })) return;
          const spaceId = String(values.get('spaceId'));
          void saving.run(async () => {
            if (taskTitle) {
              await auth.request(`/spaces/${spaceId}/tasks`, { method: 'POST', body: JSON.stringify({ title: taskTitle }) });
            }
            const uploaded = shared.files.length ? await uploadFiles(auth.request, spaceId, shared.files) : '';
            await caches.delete(shareCache);
            navigate(shared.files.length ? `/spaces/${spaceId}` : `/spaces/${spaceId}/tasks`);
            return uploaded;
          }, 'Could not save what you shared');
        }}
      >
        {editable.length === 0 ? (
          <p className="error-message m-0">You can only view your spaces, so there is nowhere to save this.</p>
        ) : (
          <label className="field-label">
            Space
            <select defaultValue={editable[0]!.id} name="spaceId">
              {editable.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {(title || shared.files.length === 0) && (
          <TextField defaultValue={title} label={shared.files.length ? 'Also add a task (optional)' : 'Task'} maxLength={200} {...form.field('title')} />
        )}
        {shared.files.length > 0 && (
          <div>
            <p className="field-label m-0">Files</p>
            <ul className="mt-2 grid list-none gap-0 p-0">
              {shared.files.map((file) => (
                <li className="flex justify-between gap-4 border-b border-line-soft py-2" key={file.name}>
                  <span className="min-w-0 truncate text-ink">{file.name}</span>
                  <span className="mono-sm shrink-0 text-faint">{fileSize(file.size)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <button className="primary-button" disabled={saving.busy || editable.length === 0} type="submit">
            {saving.busy ? 'Saving…' : 'Save'}
          </button>
          <button className="secondary-button" disabled={saving.busy} onClick={() => void discard()} type="button">
            Discard
          </button>
        </div>
      </form>
    </section>
  );
}
