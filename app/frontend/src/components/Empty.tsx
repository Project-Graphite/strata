import type { ReactNode } from 'react';
import { EmptyState } from '@project-graphite/ui';

function TextSkeleton({ children }: { children: ReactNode }) {
  return <span className="skeleton inline rounded-md text-transparent box-decoration-clone">{children}</span>;
}

export function Empty({ children, level, loading = false, title }: { children?: ReactNode; level?: 3; loading?: boolean; title: string }) {
  if (loading) {
    return (
      <div aria-hidden="true" className="rounded-xl border border-dashed border-line p-8 text-center">
        <p className="m-0 text-xl font-medium">
          <TextSkeleton>{title}</TextSkeleton>
        </p>
        {children && (
          <p className="mx-auto mt-3 mb-0 max-w-md text-sm">
            <TextSkeleton>{children}</TextSkeleton>
          </p>
        )}
      </div>
    );
  }
  return <EmptyState level={level} title={title}>{children && <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">{children}</p>}</EmptyState>;
}
