import type { ReactNode } from 'react';
import { Dialog, Button as UiButton } from '@project-graphite/ui';
import { Button } from './Button';
import { DialogActions } from './DialogActions';

export function FormDialog({
  busy,
  busyLabel,
  children,
  danger = false,
  onClose,
  onSubmit,
  start,
  submitDisabled = false,
  submitLabel,
  title,
}: {
  busy: boolean;
  busyLabel: string;
  children: ReactNode;
  danger?: boolean;
  onClose: () => void;
  onSubmit: (form: HTMLFormElement) => void;
  start?: ReactNode;
  submitDisabled?: boolean;
  submitLabel: string;
  title: string;
}) {
  return (
    <Dialog onClose={onClose} title={title}>
      <form
        className="mt-5 grid min-w-0 grid-cols-1 gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(event.currentTarget);
        }}
      >
        {children}
        <DialogActions start={start}>
          <Button disabled={busy} label="Cancel" large onClick={onClose} />
          {danger ? (
            <UiButton disabled={busy || submitDisabled} type="submit" variant="danger">
              {busy ? busyLabel : submitLabel}
            </UiButton>
          ) : (
            <Button disabled={busy || submitDisabled} label={busy ? busyLabel : submitLabel} large primary submit />
          )}
        </DialogActions>
      </form>
    </Dialog>
  );
}
