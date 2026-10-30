import type { ReactNode } from 'react';
import { EmptyState, type IconName } from '@project-graphite/ui';

function TextSkeleton({ children }: { children: ReactNode }) {
  return <span className="skeleton inline rounded-mark text-transparent box-decoration-clone">{children}</span>;
}

export function Empty({
  action,
  children,
  icon,
  level,
  loading = false,
  title,
  variant = 'section',
}: {
  action?: ReactNode;
  children?: ReactNode;
  icon?: IconName;
  level?: 3;
  loading?: boolean;
  title: string;
  variant?: 'filtered' | 'page' | 'section';
}) {
  if (loading) {
    return (
      <div aria-hidden="true" className="empty-state" data-variant={variant}>
        {icon && <span className="empty-state-icon" />}
        <p className={`m-0 ${variant === 'page' ? 'text-title' : 'text-h2'}`}>
          <TextSkeleton>{title}</TextSkeleton>
        </p>
        {children && (
          <p className="empty-state-body m-0">
            <TextSkeleton>{children}</TextSkeleton>
          </p>
        )}
        {action && <div className="empty-state-action invisible">{action}</div>}
      </div>
    );
  }
  return (
    <EmptyState action={action} icon={icon} level={level} title={title} variant={variant}>
      {children}
    </EmptyState>
  );
}
