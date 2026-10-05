import type { ReactNode } from 'react';
import { Dialog } from '@project-graphite/ui';

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
        <div className="mt-1 flex justify-end gap-3">
          <button className="secondary-button" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? busyLabel : submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
