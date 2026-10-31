import { Icon, Button as UiButton, IconButton, type IconName } from '@project-graphite/ui';

const look = (large: boolean, primary: boolean) => ({ size: large ? 'medium' : 'small', variant: primary ? 'primary' : 'secondary' }) as const;

export function AddButton({ disabled, label, large = false, onClick, primary = false }: { disabled?: boolean; label: string; large?: boolean; onClick?: () => void; primary?: boolean }) {
  return (
    <UiButton {...look(large, primary)} aria-label={label} className="add-button" disabled={disabled} onClick={onClick} title={label} type="button">
      <Icon name="plus" size={18} />
    </UiButton>
  );
}

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
      className="w-fit shrink-0"
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
    <UiButton {...look(large, primary)} {...{ state }} className="w-fit shrink-0" href={to} icon={icon}>
      {label}
    </UiButton>
  );
}

export function ButtonAnchor({ href, label, large = false, primary = false }: { href: string; label: string; large?: boolean; primary?: boolean }) {
  return (
    <UiButton {...look(large, primary)} {...{ rel: 'noopener noreferrer', target: '_blank' }} className="w-fit shrink-0" href={href} LinkComponent="a">
      {label}
    </UiButton>
  );
}

export function IconLink({ badge, icon, label, to }: { badge?: number; icon: IconName; label: string; to: string }) {
  return <IconButton badge={badge} href={to} icon={icon} label={label} />;
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
    <UiButton className={`w-fit ${danger ? 'text-danger' : ''}`} disabled={disabled} icon={icon} onClick={onClick} size="small" variant="text">
      {label}
    </UiButton>
  );
}
