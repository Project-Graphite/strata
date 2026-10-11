import { useState } from 'react';
import { ConfirmDialog, ListSkeleton, TagChip, TextField } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { batchSummary, TidyPreview, type TidyRequest } from '../../components/TidyPreview';
import { fileTypeNames } from '../../files';
import type { Tag } from '../../spaces';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, required, useFormErrors } from '../../validation';
import { useSpace } from './SpaceLayout';
import { LoadError } from '../../components/LoadError';

interface Rule {
  id: string;
  spaceId: string;
  titleContains: string;
  kind: string | null;
  fileType: string | null;
  tag: Tag;
  enabled: boolean;
  createdAt: string;
}

const kindNames: Record<string, string> = {
  note: 'notes',
  task: 'tasks',
  list: 'lists',
  event: 'events',
  subscription: 'subscriptions',
  board: 'boards',
  file: 'files',
  bookmark: 'bookmarks',
};

function ruleText(rule: Rule) {
  const words = rule.titleContains && `“${rule.titleContains}” in the title`;
  if (rule.fileType) return `${fileTypeNames[rule.fileType]}${words ? ` with ${words}` : ''}`;
  return `Title contains “${rule.titleContains}”${rule.kind ? `, ${kindNames[rule.kind]} only` : ''}`;
}

export function TidyRules({ tags }: { tags: Tag[] }) {
  const auth = useAuth();
  const space = useSpace();
  const rules = useResource<Rule[]>(`/spaces/${space.id}/tidy-rules`, true);
  const creating = useAction();
  const changing = useAction();
  const form = useFormErrors();
  const [deleting, setDeleting] = useState<Rule>();
  const [request, setRequest] = useState<TidyRequest>();
  const editable = space.role !== 'viewer';

  return (
    <section className="grid gap-5">
      <div>
        <h2 className="m-0 text-xl font-medium">Tagging rules</h2>
        <p className="mt-2 mb-0 text-sm text-muted">
          Tag new items in this space by words in their title, by file type, or both.
        </p>
      </div>
      {rules.error ? (
        <LoadError error={rules.error} onRetry={rules.reload} />
      ) : !rules.data ? (
        <ListSkeleton label="Loading the tagging rules" rows={2} />
      ) : (
        rules.data.length > 0 && (
          <ul className="m-0 grid list-none gap-0 p-0">
            {rules.data.map((rule) => (
              <li className="flex flex-wrap items-center justify-between gap-4 border-b border-line-soft py-3" key={rule.id}>
                <div className="min-w-0">
                  <p className="m-0 flex flex-wrap items-center gap-2 text-ink">
                    {ruleText(rule)} → <TagChip color={rule.tag.color} label={rule.tag.name} />
                  </p>
                  <p className="mono-sm mt-1 mb-0 text-faint">{rule.enabled ? 'On' : 'Paused'}</p>
                </div>
                {editable && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      className="secondary-button px-3 py-2 text-sm"
                      disabled={changing.busy}
                      onClick={() =>
                        void changing.run(async () => {
                          const matches = await auth.request<{ total: number; results: { id: string }[] }>(`/tidy-rules/${rule.id}/matches`);
                          if (matches.total === 0) return 'No existing items match this rule.';
                          setRequest({ action: 'tag', tagId: rule.tag.id, itemIds: matches.results.map((item) => item.id) });
                          return matches.total > matches.results.length ? `${matches.total} items match. Showing the newest ${matches.results.length}.` : '';
                        }, 'Could not find matching items')
                      }
                      type="button"
                    >
                      Tag existing items
                    </button>
                    <button
                      className="secondary-button px-3 py-2 text-sm"
                      disabled={changing.busy}
                      onClick={() =>
                        void changing.run(async () => {
                          const updated = await auth.request<Rule>(`/tidy-rules/${rule.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ enabled: !rule.enabled }),
                          });
                          rules.mutate((current) => current.map((shown) => (shown.id === updated.id ? updated : shown)));
                          return updated.enabled ? 'The rule is on again. It tags items created from now on.' : 'The rule is paused.';
                        }, 'Could not change the rule')
                      }
                      type="button"
                    >
                      {rule.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button className="secondary-button px-3 py-2 text-sm" onClick={() => setDeleting(rule)} type="button">
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )
      )}

      {editable &&
        (tags.length === 0 ? (
          <p className="m-0 text-sm text-muted">Add a tag first, then make a rule for it.</p>
        ) : (
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const target = event.currentTarget;
              const values = new FormData(target);
              const fileType = values.get('fileType');
              const limit = atMost(100, 'Use at most 100 characters.');
              if (!form.check(target, { titleContains: fileType ? [limit] : [required('Enter words to look for, or choose a file type.'), limit] })) return;
              void creating
                .run(async () => {
                  const created = await auth.request<Rule>(`/spaces/${space.id}/tidy-rules`, {
                    method: 'POST',
                    body: JSON.stringify({
                      titleContains: String(values.get('titleContains')).trim(),
                      tagId: values.get('tagId'),
                      ...(fileType ? { fileType } : values.get('kind') ? { kind: values.get('kind') } : {}),
                    }),
                  });
                  rules.mutate((current) => [...current, created]);
                  const words = created.titleContains && `“${created.titleContains}” in the title`;
                  return created.fileType
                    ? `${fileTypeNames[created.fileType]} uploaded from now on${words ? ` with ${words}` : ''} will be tagged ${created.tag.name}.`
                    : `New items with ${words} will be tagged ${created.tag.name}.`;
                }, 'Could not add the rule')
                .then((added) => added && target.reset());
            }}
          >
            <h3 className="m-0 text-base font-medium">New rule</h3>
            <TextField label="Title contains" maxLength={100} {...form.field('titleContains')} />
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="field-label">
                File type
                <select defaultValue="" name="fileType">
                  <option value="">Any</option>
                  {Object.entries(fileTypeNames).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Kind of item
                <select defaultValue="" name="kind">
                  <option value="">Any kind</option>
                  {Object.entries(kindNames).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Add the tag
                <select defaultValue={tags[0]?.id} name="tagId">
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="primary-button inline-flex w-fit" disabled={creating.busy} type="submit">
              {creating.busy ? 'Adding…' : 'Add rule'}
            </button>
          </form>
        ))}

      {deleting && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete rule"
          errorFallback="Could not delete the rule"
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            await auth.request(`/tidy-rules/${deleting.id}`, { method: 'DELETE' });
            rules.mutate((current) => current.filter((rule) => rule.id !== deleting.id));
          }}
          title="Delete this rule?"
        >
          {ruleText(deleting)}. Items it already tagged keep the tag.
        </ConfirmDialog>
      )}

      {request && (
        <TidyPreview
          onApplied={(batch) => {
            setRequest(undefined);
            void changing.run(
              () => Promise.resolve(batch ? `${batchSummary(batch)}. You can undo it from Tidy.` : 'Nothing needed tagging after all.'),
              '',
            );
          }}
          onClose={() => setRequest(undefined)}
          request={request}
        />
      )}
    </section>
  );
}
