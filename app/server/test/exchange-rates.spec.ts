import { describe, expect, it } from 'vitest';
import { convertMinor, parseEgyptRates, parseOpenRates, parseRates, ratesSourcesOf } from '../src/exchange-rates/exchange-rates.service';

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

describe('CBE official rates', () => {
  it('reads the euro row as the Egyptian pound mid rate', () => {
    const html = `<p class="table-desc">CBE Official Exchange rates and prices are expressed in pounds. <br />
      Rates for Date: 14/10/2026</p><table><tbody>
      <tr><td class="table-cell">US Dollar</td><td class="table-cell">53.0417</td><td class="table-cell">53.1817</td></tr>
      <tr><td class="table-cell">
        Euro
      </td><td class="table-cell">
        59.3484
      </td><td class="table-cell">
        59.5103
      </td></tr></tbody></table>`;
    expect(parseEgyptRates(html)).toEqual({ publishedOn: '2026-10-14', rates: [{ currency: 'EGP', perEuro: 59.42935 }] });
    expect(() => parseEgyptRates('The requested URL was rejected.')).toThrow('no euro rate');
  });
});

describe('open.er-api.com fallback for the Egyptian pound', () => {
  it('reads the pound against the euro and dates it from the last update', () => {
    const feed = JSON.stringify({ result: 'success', base_code: 'EUR', time_last_update_unix: 1_791_936_001, rates: { EUR: 1, EGP: 59.71, USD: 1.12 } });
    expect(parseOpenRates(feed)).toEqual({ publishedOn: '2026-10-14', rates: [{ currency: 'EGP', perEuro: 59.71 }] });
    expect(() => parseOpenRates(JSON.stringify({ result: 'error', 'error-type': 'quota-reached' }))).toThrow('no Egyptian pound rate');
    expect(() => parseOpenRates('<html>down</html>')).toThrow();
  });
});

describe('where the rates came from', () => {
  it('names each source once, leaving out the euro base', () => {
    const sources = new Map([['EUR', 'ECB'], ['USD', 'ECB'], ['EGP', 'open.er-api.com']]);
    expect(ratesSourcesOf(sources, ['EGP', 'USD', 'EUR'])).toEqual(['ECB', 'open.er-api.com']);
    expect(ratesSourcesOf(sources, ['EUR'])).toEqual([]);
    expect(ratesSourcesOf(new Map([['EGP', 'CBE']]), ['EGP'])).toEqual(['CBE']);
  });
});
