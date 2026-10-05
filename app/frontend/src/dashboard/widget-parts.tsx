import type { ReactNode } from 'react';

export interface WidgetProps {
  settings: Record<string, unknown>;
}

export interface SettingsProps extends WidgetProps {
  onChange: (settings: Record<string, unknown>) => void;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="m-0 text-sm text-muted">{children}</p>;
}
