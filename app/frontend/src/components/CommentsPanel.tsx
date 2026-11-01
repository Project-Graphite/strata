import type { ReactNode, Ref } from 'react';
import { IconButton } from '@project-graphite/ui';

export function CommentsPanel({ children, className = '', onClose, open, ref }: { children: ReactNode; className?: string; onClose: () => void; open: boolean; ref?: Ref<HTMLElement> }) {
  return (
    <aside aria-label="Comments" className={`comments-panel ${className}`} data-open={open} inert={!open} ref={ref}>
      <div className="comments-panel-head">
        <h2 className="m-0 text-h3">Comments</h2>
        <IconButton icon="x" label="Close comments" onClick={onClose} />
      </div>
      {children}
    </aside>
  );
}

export function CommentsButton({ count, onClick, open }: { count?: number; onClick: () => void; open: boolean }) {
  return (
    <span className="comments-button">
      <IconButton aria-pressed={open} icon="quote" label={count ? `Comments, ${count}` : 'Comments'} onClick={onClick} />
      {Boolean(count) && <span aria-hidden="true" className="comments-count">{count}</span>}
    </span>
  );
}
