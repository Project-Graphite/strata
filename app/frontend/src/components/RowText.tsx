import type { ReactNode } from 'react';

export function RowText({ children, detail, title }: { children?: ReactNode; detail?: ReactNode; title: ReactNode }) {
  return (
    <span className="grid min-w-0 flex-1 basis-40 gap-0.5">
      <span className="truncate text-ink">{title}</span>{' '}
      {detail && <span className="text-small text-muted">{detail}</span>}
      {children}
    </span>
  );
}
