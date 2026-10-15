import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from '@project-graphite/ui';

export function IconButton({ disabled, icon, label, onClick }: { disabled?: boolean; icon: IconName; label: string; onClick: () => void }) {
  return (
    <button aria-label={label} className="icon-button" disabled={disabled} onClick={onClick} title={label} type="button">
      <Icon name={icon} size={18} />
    </button>
  );
}

export function IconLink({ children, icon, label, to }: { children?: ReactNode; icon: IconName; label: string; to: string }) {
  return (
    <Link aria-label={label} className="icon-button" title={label} to={to}>
      <Icon name={icon} size={18} />
      {children}
    </Link>
  );
}
