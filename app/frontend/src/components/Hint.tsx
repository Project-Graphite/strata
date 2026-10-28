import type { ReactNode } from 'react';

export function Hint({ children }: { children: ReactNode }) {
  return <p className="m-0 text-small text-muted">{children}</p>;
}
