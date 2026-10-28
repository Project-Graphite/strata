import type { ReactNode } from 'react';
import { Banner } from '@project-graphite/ui';

export function Stats({ children }: { children: ReactNode }) {
  return <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">{children}</dl>;
}

export function Stat({ children, detail, label, value }: { children?: ReactNode; detail?: ReactNode; label: ReactNode; value: ReactNode }) {
  return (
    <div className="grid content-start gap-2 rounded-panel border border-line bg-surface p-4">
      <dt className="text-small text-muted">{label}</dt>
      <dd className="m-0 grid gap-2 text-lg text-ink">
        {value}
        {children}
      </dd>
      {detail && <dd className="mono-sm m-0 text-faint">{detail}</dd>}
    </div>
  );
}

export function MissingRates({ currencies }: { currencies: string[] }) {
  return currencies.length > 0 ? <Banner>There is no exchange rate for {currencies.join(', ')} yet, so those amounts are left out of the totals.</Banner> : null;
}
