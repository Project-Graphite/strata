import { useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '@project-graphite/ui';
import { useAction } from '../useAction';
import { Button } from './Button';

export const same = (first: unknown, second: unknown) => JSON.stringify(first) === JSON.stringify(second);

export function SavedForm<T>({
  children,
  className = 'settings-form',
  initial,
  invalid = false,
  label,
  onSave,
  values,
}: {
  children: ReactNode;
  className?: string;
  initial: T;
  invalid?: boolean;
  label: string;
  onSave: () => Promise<unknown>;
  values: T;
}) {
  const saving = useAction();
  const [saved, setSaved] = useState(false);
  const dirty = !same(initial, values);
  return (
    <form
      aria-label={label}
      className={className}
      noValidate
      onChange={() => setSaved(false)}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (!dirty || invalid) return;
        void saving.run(async () => {
          await onSave();
          setSaved(true);
          return '';
        }, `Could not save ${label.toLowerCase()}`);
      }}
    >
      {children}
      <div className="save-bar" data-dirty={dirty || undefined}>
        <span aria-live="polite" className="text-small text-muted">
          {dirty ? 'Unsaved changes' : saved ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="check" size={14} /> Saved
            </span>
          ) : null}
        </span>
        <span aria-hidden={!dirty || undefined} className="save-bar-button">
          <Button disabled={!dirty || invalid || saving.busy} label={saving.busy ? 'Saving…' : 'Save changes'} primary submit />
        </span>
      </div>
    </form>
  );
}
