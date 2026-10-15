import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from '@project-graphite/ui';

export const buttonClass = (primary = false) => `${primary ? 'primary-button' : 'secondary-button'} w-fit shrink-0 px-3 py-2 text-sm`;

export function Button({
  disabled,
  icon,
  label,
  large = false,
  onClick,
  pressed,
  primary = pressed ?? false,
  submit = false,
}: {
  disabled?: boolean;
  icon?: IconName;
  label: string;
  large?: boolean;
  onClick?: () => void;
  pressed?: boolean;
  primary?: boolean;
  submit?: boolean;
}) {
  return (
    <button
      aria-pressed={pressed}
      className={large ? (primary ? 'primary-button' : 'secondary-button') : buttonClass(primary)}
      disabled={disabled}
      onClick={onClick}
      type={submit ? 'submit' : 'button'}
    >
      {icon && <Icon name={icon} size={16} />}
      {label}
    </button>
  );
}

const linkClass = (large: boolean, primary: boolean) => `${large ? `${primary ? 'primary-button' : 'secondary-button'} w-fit` : buttonClass(primary)} no-underline`;

export function ButtonLink({ icon, label, large = false, primary = false, state, to }: { icon?: IconName; label: string; large?: boolean; primary?: boolean; state?: unknown; to: string }) {
  return (
    <Link className={linkClass(large, primary)} state={state} to={to}>
      {icon && <Icon name={icon} size={16} />}
      {label}
    </Link>
  );
}

export function ButtonAnchor({ href, label, large = false, primary = false }: { href: string; label: string; large?: boolean; primary?: boolean }) {
  return (
    <a className={linkClass(large, primary)} href={href} rel="noopener noreferrer" target="_blank">
      {label}
    </a>
  );
}

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
