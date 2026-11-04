import { useState } from 'react';
import { Placeholder, Select, TextAreaField } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { Button } from '../../components/Button';
import { IconPicker } from '../../components/IconPicker';
import { LoadError } from '../../components/LoadError';
import { Section } from '../../components/Page';
import { ButtonSkeleton, FieldSkeleton } from '../../components/Skeletons';
import { Toggle } from '../../components/Toggle';
import { priorityNames } from '../../quick-add';
import { NameAndColorFields, nameAndColorFrom, spaceNameChecks, useAllSpaces, type Space } from '../../spaces';
import { builtInTaskTypes, taskTypeLabel } from '../../tasks';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, useFormErrors } from '../../validation';
import { useSpace } from './SpaceLayout';

interface SpaceSettingsData {
  name: string;
  color: Space['color'];
  description: string;
  defaults: {
    page: { icon: string | null; narrow: boolean };
    board: { icon: string | null };
    task: { type: string; priority: number; assignee: 'creator' | 'none' };
  };
}

export function SpaceSettings() {
  const auth = useAuth();
  const space = useSpace();
  const spaces = useAllSpaces();
  const settings = useResource<SpaceSettingsData>(`/spaces/${space.id}/settings`, true);
  const saving = useAction();
  const form = useFormErrors();
  const [edits, setEdits] = useState<{ pageIcon?: string | null; boardIcon?: string | null; narrow?: boolean }>({});

  if (settings.error) return <LoadError error={settings.error} onRetry={settings.reload} />;
  if (!settings.data) {
    return (
      <Placeholder className="grid gap-8" label="Loading the space settings">
        <Section title="Space">
          <div className="grid gap-4">
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
        </Section>
        <ButtonSkeleton large width="w-32" />
      </Placeholder>
    );
  }
  const current = settings.data;
  const pageIcon = edits.pageIcon === undefined ? current.defaults.page.icon : edits.pageIcon;
  const boardIcon = edits.boardIcon === undefined ? current.defaults.board.icon : edits.boardIcon;
  const narrow = edits.narrow ?? current.defaults.page.narrow;
  const taskTypes = [...new Set([...builtInTaskTypes, current.defaults.task.type])];

  return (
    <form
      className="grid gap-8"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const target = event.currentTarget;
        if (!form.check(target, { name: spaceNameChecks, description: [atMost(280, 'Use at most 280 characters.')] })) return;
        const values = new FormData(target);
        void saving.run(async () => {
          const next = await auth.request<SpaceSettingsData & Space>(`/spaces/${space.id}/settings`, {
            method: 'PATCH',
            body: JSON.stringify({
              ...nameAndColorFrom(target),
              description: String(values.get('description')).trim(),
              defaults: {
                page: { icon: pageIcon, narrow },
                board: { icon: boardIcon },
                task: { type: String(values.get('taskType')), priority: Number(values.get('taskPriority')), assignee: String(values.get('taskAssignee')) },
              },
            }),
          });
          settings.mutate(() => next);
          spaces.mutate((list) => list.map((shown) => (shown.id === space.id ? { ...shown, name: next.name, color: next.color, description: next.description } : shown)));
          setEdits({});
          return 'Saved the space settings.';
        }, 'Could not save the space settings');
      }}
    >
      <Section title="Space">
        <div className="grid gap-4">
          <NameAndColorFields color={current.color} field={form.field('name')} maxLength={60} name={current.name} />
          <TextAreaField defaultValue={current.description} label="Description" maxLength={280} rows={3} {...form.field('description')} />
        </div>
      </Section>
      <Section title="New pages">
        <div className="grid gap-4">
          <div className="flex items-center gap-3">
            <IconPicker icon={pageIcon} onPick={(icon) => setEdits((shown) => ({ ...shown, pageIcon: icon }))} />
            <span className="text-small text-muted">Icon for new pages</span>
          </div>
          <div className="panel-rows">
            <Toggle checked={narrow} description="New pages start in the narrow reading width." label="Narrow width" onChange={(checked) => setEdits((shown) => ({ ...shown, narrow: checked }))} />
          </div>
        </div>
      </Section>
      <Section title="New boards">
        <div className="flex items-center gap-3">
          <IconPicker icon={boardIcon} onPick={(icon) => setEdits((shown) => ({ ...shown, boardIcon: icon }))} />
          <span className="text-small text-muted">Icon for new boards</span>
        </div>
      </Section>
      <Section title="New tasks">
        <div className="grid gap-4">
          <Select defaultValue={current.defaults.task.type} label="Type" name="taskType" options={taskTypes.map((type) => ({ value: type, label: taskTypeLabel(type) }))} />
          <Select defaultValue={String(current.defaults.task.priority)} label="Priority" name="taskPriority" options={priorityNames.map((label, priority) => ({ value: String(priority), label }))} />
          <Select defaultValue={current.defaults.task.assignee} label="Assigned to" name="taskAssignee" options={[{ value: 'creator', label: 'Whoever adds the task' }, { value: 'none', label: 'Nobody' }]} />
        </div>
      </Section>
      <div>
        <Button disabled={saving.busy} label={saving.busy ? 'Saving…' : 'Save changes'} large primary submit />
      </div>
    </form>
  );
}
