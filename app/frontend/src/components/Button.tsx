import MuiIconButton from '@mui/material/IconButton';
import type { ReactNode } from 'react';
import { Icon, Button as UiButton, IconButton as UiIconButton, type IconName } from '@project-graphite/ui';

export const buttonClass = (primary = false) => `${primary ? 'primary-button' : 'secondary-button'} w-fit shrink-0 px-3 py-2 text-sm`;

const look = (large: boolean, primary: boolean) => ({ size: large ? 'medium' : 'small', variant: primary ? 'primary' : 'secondary' }) as const;

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
    <UiButton
      {...look(large, primary)}
      aria-pressed={pressed}
      className="shrink-0"
      disabled={disabled}
      icon={icon}
      onClick={onClick}
      type={submit ? 'submit' : 'button'}
    >
      {label}
    </UiButton>
  );
}

export function ButtonLink({ icon, label, large = false, primary = false, state, to }: { icon?: IconName; label: string; large?: boolean; primary?: boolean; state?: unknown; to: string }) {
  return (
    <UiButton {...look(large, primary)} {...{ state }} className="shrink-0" href={to} icon={icon}>
      {label}
    </UiButton>
  );
}

export function ButtonAnchor({ href, label, large = false, primary = false }: { href: string; label: string; large?: boolean; primary?: boolean }) {
  return (
    <UiButton {...look(large, primary)} {...{ rel: 'noopener noreferrer', target: '_blank' }} className="shrink-0" href={href} LinkComponent="a">
      {label}
    </UiButton>
  );
}

export function IconButton({ disabled, icon, label, onClick }: { disabled?: boolean; icon: IconName; label: string; onClick: () => void }) {
  return <UiIconButton disabled={disabled} icon={icon} label={label} onClick={onClick} />;
}

export function IconLink({ children, icon, label, to }: { children?: ReactNode; icon: IconName; label: string; to: string }) {
  return (
    <MuiIconButton aria-label={label} href={to} title={label}>
      <Icon name={icon} size={18} />
      {children}
    </MuiIconButton>
  );
}

export function TextButton({
  danger = false,
  disabled,
  icon,
  label,
  onClick,
}: {
  danger?: boolean;
  disabled?: boolean;
  icon?: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <UiButton className={danger ? 'text-danger' : undefined} disabled={disabled} icon={icon} onClick={onClick} size="small" variant="text">
      {label}
    </UiButton>
  );
}
