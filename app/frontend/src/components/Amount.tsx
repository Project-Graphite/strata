import type { ReactNode } from 'react';
import type { ExpenseDirection } from '../spending';
import { money } from '../subscriptions';

export function Amount({ children, currency, danger, direction, minor }: { children?: ReactNode; currency: string; danger?: boolean; direction?: ExpenseDirection | null; minor: number }) {
  const incoming = direction === 'received' || direction === 'refund';
  return (
    <span className={`shrink-0 tabular-nums ${danger ? 'text-danger' : incoming ? 'text-live' : 'text-ink'}`}>
      {incoming && '+'}
      {money(minor, currency)}
      {children}
    </span>
  );
}
