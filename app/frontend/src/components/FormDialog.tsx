import type { ReactNode } from 'react';
import { Dialog } from '@project-graphite/ui';
import { Button } from './Button';
import { DialogActions } from './DialogActions';

export function FormDialog({
  busy,
  busyLabel,
  children,
  onClose,
  onSubmit,
  submitLabel,
  title,
}: {
  busy: boolean;
  busyLabel: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: (form: HTMLFormElement) => void;
  submitLabel: string;
  title: string;
}) {
  return (
    <Dialog onClose={onClose} title={title}>
      <form
        className="mt-5 grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(event.currentTarget);
        }}
      >
        {children}
        <DialogActions>
          <Button label="Cancel" large onClick={onClose} />
          <Button disabled={busy} label={busy ? busyLabel : submitLabel} large primary submit />
        </DialogActions>
      </form>
    </Dialog>
  );
}
