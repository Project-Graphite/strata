import { describe, expect, it } from 'vitest';
import { convertMinor, parseRates } from '../src/exchange-rates/exchange-rates.service';

const xml = `<gesmes:Envelope><Cube><Cube time='2026-10-05'>
  <Cube currency='USD' rate='1.1204'/><Cube currency='JPY' rate='177.28'/><Cube currency='GBP' rate='0.84720'/>
</Cube></Cube></gesmes:Envelope>`;

describe('ECB reference rates', () => {
  it('reads the date and every rate, and adds the euro', () => {
    expect(parseRates(xml)).toEqual({
      publishedOn: '2026-10-05',
      rates: [
        { currency: 'USD', perEuro: 1.1204 },
        { currency: 'JPY', perEuro: 177.28 },
        { currency: 'GBP', perEuro: 0.8472 },
        { currency: 'EUR', perEuro: 1 },
      ],
    });
    expect(() => parseRates('<html>maintenance</html>')).toThrow('no rates');
  });

  it('converts between currencies with different minor units', () => {
    const rates = new Map(parseRates(xml).rates.map(({ currency, perEuro }) => [currency, perEuro]));
    expect(convertMinor(1000, 'EUR', 'GBP', rates)).toBe(847);
    expect(convertMinor(11_204, 'USD', 'EUR', rates)).toBe(10_000);
    expect(convertMinor(1000, 'GBP', 'JPY', rates)).toBe(2093);
    expect(convertMinor(17_728, 'JPY', 'EUR', rates)).toBe(10_000);
    expect(convertMinor(1000, 'CHF', 'EUR', rates)).toBeNull();
  });
});
