import type { ReactNode } from 'react';
import { EmptyState } from '@project-graphite/ui';
import { useDocumentTitle } from './Page';

export function Empty({ children, level, title }: { children?: ReactNode; level?: 3; title: string }) {
  return <EmptyState level={level} title={title}>{children && <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">{children}</p>}</EmptyState>;
}

export function NotFoundState({ thing }: { thing: string }) {
  useDocumentTitle(`${thing} not found`);
  return <Empty title={`${thing} not found`}>It may have been deleted, or you are not a member of its space.</Empty>;
}
