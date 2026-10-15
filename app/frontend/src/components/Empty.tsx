import type { ReactNode } from 'react';
import { EmptyState } from '@project-graphite/ui';

export function Empty({ children, title }: { children?: ReactNode; title: string }) {
  return <EmptyState title={title}>{children && <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">{children}</p>}</EmptyState>;
}

export function NotFoundState({ thing }: { thing: string }) {
  return <Empty title={`${thing} not found`}>It may have been deleted, or you are not a member of its space.</Empty>;
}
