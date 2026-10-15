import { useState } from 'react';
import { Button } from './Button';

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[var(--radius-field)] border border-line bg-surface py-1.5 pr-1.5 pl-3">
      <code className="mono-sm min-w-0 flex-1 truncate text-ink select-all" title={link}>
        {link}
      </code>
      <Button
        icon={copied ? 'check-mark' : 'link'}
        label={copied ? 'Copied' : 'Copy link'}
        onClick={() =>
          void navigator.clipboard.writeText(link).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          })
        }
      />
    </div>
  );
}
