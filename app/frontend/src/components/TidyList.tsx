import type { ReactNode } from 'react';

export function Choice({ checked, detail, label, onToggle }: { checked: boolean; detail: string; label: string; onToggle: () => void }) {
  return (
    <li className="border-b border-line-soft">
      <label className="flex cursor-pointer items-center gap-3 py-3">
        <input checked={checked} onChange={onToggle} type="checkbox" />
        <span className="min-w-0 flex-1 truncate text-ink">{label || 'Untitled'}</span>
        <span className="mono-sm shrink-0 text-faint">{detail}</span>
      </label>
    </li>
  );
}

export function Suggestion({ action, children, hint, title }: { action?: ReactNode; children: ReactNode; hint: string; title: string }) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 text-xl font-medium">{title}</h2>
        {action}
      </div>
      <p className="mt-2 mb-0 text-sm text-muted">{hint}</p>
      {children}
    </section>
  );
}
