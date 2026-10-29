import { describe, expect, it } from 'vitest';
import { guessColumns, parseCsv, readCharges, readEntries, tableOf, withoutPreamble } from '../../frontend/src/statement';

describe('statement import', () => {
  it('maps separate debit, credit and reference columns and keeps credits as income', () => {
    const rows = withoutPreamble(
      parseCsv(
        [
          'CIB account statement,,,,',
          'Booking date,Reference,Details,Debit,Credit',
          '14/10/2026,FT2610,SALARY OCTOBER,,"45,000.00"',
          '15/10/2026,POS7781,CARREFOUR MAADI,"1,250.50",',
          '16/10/2026,,UBER TRIP,85.00,',
        ].join('\n'),
      ),
    );
    const columns = guessColumns(rows);
    expect(columns).toEqual({ date: 0, description: 2, amount: 3, credit: 4, reference: 1 });
    expect(readEntries(rows, columns, 'dmy')).toEqual([
      { date: '2026-10-14', description: 'SALARY OCTOBER', amount: 45_000, reference: 'FT2610' },
      { date: '2026-10-15', description: 'CARREFOUR MAADI', amount: -1250.5, reference: 'POS7781' },
      { date: '2026-10-16', description: 'UBER TRIP', amount: -85, reference: null },
    ]);
    expect(readCharges(rows, columns, 'dmy').map((charge) => charge.amount)).toEqual([1250.5, 85]);
  });

  it('reads a signed amount column, and treats an unsigned one as spending', () => {
    const signed = parseCsv('Date,Description,Amount\n2026-10-01,Refund NOON,200\n2026-10-02,Talabat,-150');
    const columns = guessColumns(signed);
    expect(columns).toMatchObject({ credit: null, reference: null });
    expect(readEntries(signed, columns, 'ymd').map((entry) => entry.amount)).toEqual([200, -150]);
    expect(readCharges(signed, columns, 'ymd')).toEqual([{ date: '2026-10-02', description: 'Talabat', amount: 150 }]);
    const unsigned = parseCsv('Date,Description,Amount\n2026-10-01,Netflix,15.49\n2026-10-02,Spotify,5.99');
    expect(readEntries(unsigned, guessColumns(unsigned), 'ymd').map((entry) => entry.amount)).toEqual([-15.49, -5.99]);
  });

  it('lines PDF text up under the header columns by position', () => {
    const at = (text: string, x: number, width = 40) => ({ text, x, width });
    expect(
      tableOf([
        [at('Statement for Amr', 40, 120)],
        [at('Date', 40), at('Description', 120, 80), at('Amount', 400)],
        [at('14/10/2026', 40, 50), at('CARREFOUR', 120, 60), at('MAADI', 185, 35), at('1,250.50', 395, 45)],
        [at('15/10/2026', 40, 50), at('Uber', 120, 25), at('85.00', 410, 30)],
      ]),
    ).toEqual([
      ['Date', 'Description', 'Amount'],
      ['14/10/2026', 'CARREFOUR MAADI', '1,250.50'],
      ['15/10/2026', 'Uber', '85.00'],
    ]);
    expect(tableOf([[at('a', 0), at('b', 100)]])).toEqual([['a', 'b']]);
  });
});
