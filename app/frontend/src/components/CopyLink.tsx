import { useState } from 'react';
import { Icon } from '@project-graphite/ui';

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[var(--radius-field)] border border-line bg-surface py-1.5 pr-1.5 pl-3">
      <code className="mono-sm min-w-0 flex-1 truncate text-ink select-all" title={link}>
        {link}
      </code>
      <button
        className="secondary-button shrink-0 px-3 py-1.5 text-sm"
        onClick={() =>
          void navigator.clipboard.writeText(link).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          })
        }
        type="button"
      >
        <Icon name={copied ? 'check-mark' : 'link'} size={16} />
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}
