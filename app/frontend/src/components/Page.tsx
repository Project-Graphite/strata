import { useEffect, type ReactNode } from 'react';
import { PageHeader } from '@project-graphite/ui';

export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · Strata`;
    return () => {
      document.title = 'Strata';
    };
  }, [title]);
}

export function Page({
  actions,
  beside,
  children,
  description,
  documentTitle,
  eyebrow,
  title,
  titleHidden = false,
}: {
  actions?: ReactNode;
  beside?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  documentTitle?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  titleHidden?: boolean;
}) {
  useDocumentTitle(documentTitle ?? (typeof title === 'string' ? title : undefined));
  return (
    <section className="page-enter grid grid-cols-1 content-start gap-8">
      {titleHidden ? (
        <h1 className="sr-only">{title}</h1>
      ) : beside ? (
        <div className="page-header">
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
            <PageHeader eyebrow={eyebrow} title={title}>
              {description}
            </PageHeader>
            {beside}
          </div>
          {actions && <div className="page-header-actions">{actions}</div>}
        </div>
      ) : (
        <PageHeader actions={actions} eyebrow={eyebrow} title={title}>
          {description}
        </PageHeader>
      )}
      {children}
    </section>
  );
}

export function Toolbar({ actions, children }: { actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Subheading({ children, level = 3 }: { children: ReactNode; level?: 2 | 3 }) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return <Heading className="m-0 text-sm font-medium text-muted">{children}</Heading>;
}

export function Section({ action, children, description, title }: { action?: ReactNode; children: ReactNode; description?: ReactNode; title: string }) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-lg font-medium">{title}</h2>
          {description && <p className="m-0 mt-1 text-sm text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
