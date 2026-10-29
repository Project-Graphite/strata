import type { ReactNode } from 'react';
import { EmptyState } from '@project-graphite/ui';

function TextSkeleton({ children }: { children: ReactNode }) {
  return <span className="skeleton inline rounded-mark text-transparent box-decoration-clone">{children}</span>;
}

export function Empty({
  children,
  level,
  loading = false,
  title,
  variant = 'section',
}: {
  children?: ReactNode;
  level?: 3;
  loading?: boolean;
  title: string;
  variant?: 'filtered' | 'page' | 'section';
}) {
  if (loading) {
    return (
      <div aria-hidden="true" className="empty-state" data-variant={variant}>
        <p className="m-0 text-h2">
          <TextSkeleton>{title}</TextSkeleton>
        </p>
        {children && (
          <p className="empty-state-body m-0">
            <TextSkeleton>{children}</TextSkeleton>
          </p>
        )}
      </div>
    );
  }
  return <EmptyState level={level} title={title} variant={variant}>{children}</EmptyState>;
}
