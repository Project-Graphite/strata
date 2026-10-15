import type { ReactNode } from 'react';
import { PageHeader } from '@project-graphite/ui';

export function Page({
  actions,
  children,
  description,
  eyebrow,
  title,
  titleHidden = false,
}: {
  actions?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  titleHidden?: boolean;
}) {
  return (
    <section className="page-enter grid content-start gap-8">
      {titleHidden ? (
        <h1 className="sr-only">{title}</h1>
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
