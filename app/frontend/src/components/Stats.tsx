import { Banner } from '@project-graphite/ui';

export function MissingRates({ currencies }: { currencies: string[] }) {
  return currencies.length > 0 ? <Banner>There is no exchange rate for {currencies.join(', ')} yet, so those amounts are left out of the totals.</Banner> : null;
}
