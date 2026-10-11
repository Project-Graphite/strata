import { useState } from 'react';
import { ConfirmDialog, Icon, ListSkeleton, Menu, Select, TagChip, TextField } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { batchSummary, TidyPreview, type TidyRequest } from '../../components/TidyPreview';
import { fileTypeNames } from '../../files';
import type { Tag } from '../../spaces';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, required, useFormErrors } from '../../validation';
import { useSpace } from './SpaceLayout';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { HeaderButton, Section } from '../../components/Page';

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
  const [adding, setAdding] = useState(false);
  const editable = space.role !== 'viewer';

  function findMatches(rule: Rule) {
    void changing.run(async () => {
      const matches = await auth.request<{ total: number; results: { id: string }[] }>(`/tidy-rules/${rule.id}/matches`);
      if (matches.total === 0) return 'No existing items match this rule.';
      setRequest({ action: 'tag', tagId: rule.tag.id, itemIds: matches.results.map((item) => item.id) });
      return matches.total > matches.results.length ? `${matches.total} items match. Showing the newest ${matches.results.length}.` : '';
    }, 'Could not find matching items');
  }

  function toggle(rule: Rule) {
    void changing.run(async () => {
      const updated = await auth.request<Rule>(`/tidy-rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !rule.enabled }) });
      rules.mutate((current) => current.map((shown) => (shown.id === updated.id ? updated : shown)));
      return updated.enabled ? 'The rule is on again. It tags items created from now on.' : 'The rule is paused.';
    }, 'Could not change the rule');
  }

  return (
    <Section
      action={editable && tags.length > 0 && <HeaderButton icon="plus" label="New rule" onClick={() => setAdding(true)} />}
      description="Tag new items in this space by words in their title, by file type, or both."
      title="Tagging rules"
    >
      {rules.error ? (
        <LoadError error={rules.error} onRetry={rules.reload} />
      ) : !rules.data ? (
        <ListSkeleton label="Loading the tagging rules" rows={2} />
      ) : rules.data.length === 0 ? (
        <p className="m-0 text-sm text-muted">{editable && tags.length === 0 ? 'Add a tag first, then make a rule for it.' : 'No rules yet.'}</p>
      ) : (
        <ul className="panel-rows">
          {rules.data.map((rule) => (
            <li className="panel-row flex flex-wrap items-center justify-between gap-x-4 gap-y-3" key={rule.id}>
              <div className="min-w-0">
                <p className="m-0 flex flex-wrap items-center gap-2 text-ink">
                  {ruleText(rule)} → <TagChip color={rule.tag.color} label={rule.tag.name} />
                </p>
                <p className="m-0 mt-0.5 text-sm text-muted">{rule.enabled ? 'On' : 'Paused'}</p>
              </div>
              {editable && (
                <div className="flex shrink-0 items-center gap-2">
                  <button className="secondary-button px-3 py-2 text-sm" disabled={changing.busy} onClick={() => findMatches(rule)} type="button">
                    Tag existing items
                  </button>
                  <Menu
                    items={[
                      { label: rule.enabled ? 'Pause' : 'Resume', onSelect: () => toggle(rule) },
                      { label: 'Delete', onSelect: () => setDeleting(rule), separated: true },
                    ]}
                    label="Rule actions"
                    trigger={<Icon name="more" size={18} />}
                    triggerClassName="icon-button"
                    triggerLabel={`Actions for ${ruleText(rule)}`}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <FormDialog
          busy={creating.busy}
          busyLabel="Adding…"
          onClose={() => setAdding(false)}
          onSubmit={(target) => {
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
              .then((added) => added && setAdding(false));
          }}
          submitLabel="Add rule"
          title="New rule"
        >
          <TextField autoFocus label="Title contains" maxLength={100} {...form.field('titleContains')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select defaultValue="" label="File type" name="fileType" options={[{ value: '', label: 'Any' }, ...Object.entries(fileTypeNames).map(([value, label]) => ({ value, label }))]} />
            <Select
              defaultValue=""
              label="Kind of item"
              name="kind"
              options={[{ value: '', label: 'Any kind' }, ...Object.entries(kindNames).map(([value, label]) => ({ value, label: label.charAt(0).toUpperCase() + label.slice(1) }))]}
            />
          </div>
          <Select
            defaultValue={tags[0]?.id}
            label="Add the tag"
            name="tagId"
            options={tags.map((tag) => ({ value: tag.id, label: tag.name, leading: <span aria-hidden="true" className={`swatch-dot tag-${tag.color}`} /> }))}
          />
        </FormDialog>
      )}

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
    </Section>
  );
}
