import type { ComponentProps } from 'react';
import { IconButton as UiIconButton } from '@project-graphite/ui';
import { Tip } from './Tip';

export function IconButton({ disabled, label, ...props }: ComponentProps<typeof UiIconButton>) {
  const button = <UiIconButton disabled={disabled} label={label} {...props} title={undefined} />;
  return <Tip title={label}>{disabled ? <span className="inline-flex">{button}</span> : button}</Tip>;
}
