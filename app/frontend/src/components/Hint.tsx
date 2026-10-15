import type { ReactNode } from 'react';

export function Hint({ children }: { children: ReactNode }) {
  return <p className="m-0 text-sm text-muted">{children}</p>;
}
