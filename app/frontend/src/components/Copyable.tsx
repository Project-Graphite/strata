import { useState } from 'react';
import { Dialog } from '@project-graphite/ui';
import { Button } from './Button';
import { DialogActions } from './DialogActions';
import { Hint } from './Hint';

export function Copyable({ label, value }: { label?: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1">
      {label && <span className="text-sm text-muted">{label}</span>}
      <div className="flex items-start gap-2">
        <code className="mono-sm block min-w-0 flex-1 break-all rounded-lg border border-line p-3 text-ink select-all">{value}</code>
        <Button
          icon={copied ? 'check-mark' : undefined}
          label={copied ? 'Copied' : 'Copy'}
          onClick={() =>
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            })
          }
        />
      </div>
    </div>
  );
}

export function SecretDialog({ hint, onClose, title, value }: { hint: string; onClose: () => void; title: string; value: string }) {
  return (
    <Dialog onClose={onClose} title={title}>
      <div className="mt-5 grid gap-4">
        <Hint>{hint}</Hint>
        <Copyable value={value} />
        <DialogActions>
          <Button label="Done" large onClick={onClose} primary />
        </DialogActions>
      </div>
    </Dialog>
  );
}
