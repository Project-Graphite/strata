import { describe, expect, it } from 'vitest';
import { dateOrder, guessColumns, merchantKey, parseAmount, parseCsv, parseDate, readCharges, statementCurrency, suggestRecurring, withoutPreamble } from '../src/statement';

describe('bank statements', () => {
  it('reads quoted cells, either delimiter and both line endings', () => {
    expect(parseCsv('Date;Payee;Amount\r\n01/02/2026;"Shop; Co ""Ltd""";-1,50\r\n\r\n')).toEqual([
      ['Date', 'Payee', 'Amount'],
      ['01/02/2026', 'Shop; Co "Ltd"', '-1,50'],
    ]);
    expect(parseCsv('a,b\n1,"two\nlines"')).toEqual([
      ['a', 'b'],
      ['1', 'two\nlines'],
    ]);
  });

  it('reads dates in the order the statement uses and amounts in either decimal style', () => {
    expect(dateOrder(['2026-01-31'])).toBe('ymd');
    expect(dateOrder(['01/31/2026', '02/01/2026'])).toBe('mdy');
    expect(dateOrder(['31/01/2026'])).toBe('dmy');
    expect(parseDate('31.01.26', 'dmy')).toBe('2026-01-31');
    expect(parseDate('02/30/2026', 'mdy')).toBeNull();
    expect(parseAmount('-1.234,56 €')).toBe(-1234.56);
    expect(parseAmount('$1,234.56')).toBe(1234.56);
    expect(parseAmount('(12.99)')).toBe(-12.99);
    expect(parseAmount('12,99')).toBe(12.99);
    expect(parseAmount('n/a')).toBeNull();
    expect(parseDate('Tue Oct 13 2026', 'dmy')).toBe('2026-10-13');
    expect(parseDate('13-OCT-26', 'mdy')).toBe('2026-10-13');
    expect(parseDate('13 Oct 2026', 'ymd')).toBe('2026-10-13');
    expect(parseDate('Sept 3, 2026', 'dmy')).toBe('2026-09-03');
    expect(parseDate('31 Feb 2026', 'dmy')).toBeNull();
    expect(parseDate('Pending', 'dmy')).toBeNull();
  });

  it('reads an Egyptian card export with a title line, written-out dates and EGP amounts', () => {
    const rows = withoutPreamble(
      parseCsv(
        [
          '﻿Cards Transaction List,,',
          'Date,Description,Amount',
          'Thu Oct 08 2026,Google One 6502530000,-120.50 EGP',
          'Mon Oct 05 2026,Google YouTube Mountain View,-99.99 EGP',
          'Mon Oct 05 2026,FOREIGN EXCHANGE FEES,-3.10 EGP',
          'Sat Oct 03 2026,Delivery          Maadi      EGY,-410.25 EGP',
          'Tue Sep 15 2026,PAYMENT RECEIVED INTERNET,5000 EGP',
          'Tue Sep 08 2026,Google One 6502530000,-120.50 EGP',
          'Sat Sep 05 2026,Google YouTube Mountain View,-99.99 EGP',
          'Sat Sep 05 2026,FOREIGN EXCHANGE FEES,-2.75 EGP',
          'Fri Sep 04 2026,Delivery Maadi,-88.00 EGP',
          'Sat Oct 03 2026,MICROSOFT PC GAME PASS MSBILL.INFO,-190 EGP',
          'Thu Sep 03 2026,MICROSOFT PC GAME PASS MSBILL.INFO,-190 EGP',
        ].join('\r\n'),
      ),
    );
    const columns = guessColumns(rows);
    const charges = readCharges(rows, columns, dateOrder(rows.slice(1).map((row) => row[columns.date]!)));

    expect(rows[0]).toEqual(['Date', 'Description', 'Amount']);
    expect(statementCurrency(rows, columns.amount)).toBe('EGP');
    expect(charges).toHaveLength(10);
    expect(charges[3]).toEqual({ date: '2026-10-03', description: 'Delivery Maadi EGY', amount: 410.25 });
    expect(suggestRecurring(charges).map(({ name, amount, repeatRule, count, category }) => ({ name, amount, repeatRule, count, category }))).toEqual([
      { name: 'Microsoft Pc', amount: 190, repeatRule: 'FREQ=MONTHLY', count: 2, category: 'other' },
      { name: 'Google One', amount: 120.5, repeatRule: 'FREQ=MONTHLY', count: 2, category: 'cloud' },
      { name: 'Google Youtube', amount: 99.99, repeatRule: 'FREQ=MONTHLY', count: 2, category: 'other' },
    ]);
  });

  it('reads an Arabic statement with Arabic digits, headers and merchant names', () => {
    const rows = withoutPreamble(
      parseCsv(
        [
          'كشف حساب,,,',
          'رقم الحساب,١٢٣٤٥,,',
          'التاريخ,البيان,مدين,دائن',
          '٠٥/٠٨/٢٠٢٦,شراء فودافون مصر,"١٬٢٥٠٫٠٠",',
          '٠٥/٠٩/٢٠٢٦,شراء فودافون مصر,"١٬٢٥٠٫٠٠",',
          '٠٥/١٠/٢٠٢٦,شراء فودافون مصر,"١٬٢٥٠٫٠٠",',
          '١٠/١٠/٢٠٢٦,تحويل وارد,,"٩٠٠٠٫٠٠"',
        ].join('\n'),
      ),
    );
    const columns = guessColumns(rows);

    expect(columns).toEqual({ date: 0, description: 1, amount: 2 });
    const charges = readCharges(rows, columns, 'dmy');
    expect(charges).toEqual([
      { date: '2026-08-05', description: 'شراء فودافون مصر', amount: 1250 },
      { date: '2026-09-05', description: 'شراء فودافون مصر', amount: 1250 },
      { date: '2026-10-05', description: 'شراء فودافون مصر', amount: 1250 },
    ]);
    expect(merchantKey('شراء فودافون مصر')).toBe('فودافون مصر');
    expect(suggestRecurring(charges)).toMatchObject([{ name: 'فودافون مصر', amount: 1250, repeatRule: 'FREQ=MONTHLY', count: 3 }]);
  });

  it('finds the columns by name, or by what they hold', () => {
    expect(guessColumns([['Value date', 'Details', 'Amount', 'Balance']])).toEqual({ date: 0, description: 1, amount: 2 });
    expect(guessColumns([['a', 'b', 'c'], ['2026-01-01', '-9.99', 'Spotify'], ['2026-02-01', '-9.99', 'Spotify']])).toEqual({ date: 0, description: 2, amount: 1 });
  });

  it('suggests charges that repeat at a steady rhythm and price', () => {
    const rows = parseCsv(
      [
        'Date,Description,Amount',
        '2026-01-03,NETFLIX.COM 866-579,-15.49',
        '2026-02-03,NETFLIX.COM 866-579,-15.49',
        '2026-03-03,NETFLIX.COM 866-579,-17.99',
        '2026-01-05,Gym Club Downtown,-30.00',
        '2026-01-12,Gym Club Downtown,-30.00',
        '2026-01-19,Gym Club Downtown,-30.00',
        '2026-01-10,Corner Bakery,-4.10',
        '2026-01-11,Corner Bakery,-12.80',
        '2026-02-28,Corner Bakery,-3.00',
        '2026-01-20,Salary,2500.00',
        '2026-02-20,Salary,2500.00',
        '2026-03-20,Salary,2500.00',
        '2025-03-01,Maxwell Cafe,-3.00',
        '2026-03-01,Maxwell Cafe,-3.00',
      ].join('\n'),
    );
    const charges = readCharges(rows, guessColumns(rows), 'ymd');
    expect(charges.every((charge) => charge.amount > 0)).toBe(true);
    expect(charges.some((charge) => charge.description === 'Salary')).toBe(false);
    expect(merchantKey('NETFLIX.COM 866-579')).toBe('netflix');
    expect(suggestRecurring(charges)).toEqual([
      { key: 'gym club', name: 'Gym Club', amount: 30, repeatRule: 'FREQ=WEEKLY', lastDate: '2026-01-19', count: 3, category: 'other', cancelUrl: null },
      {
        key: 'netflix',
        name: 'Netflix',
        amount: 17.99,
        repeatRule: 'FREQ=MONTHLY',
        lastDate: '2026-03-03',
        count: 3,
        category: 'streaming',
        cancelUrl: 'https://www.netflix.com/cancelplan',
      },
      { key: 'maxwell cafe', name: 'Maxwell Cafe', amount: 3, repeatRule: 'FREQ=YEARLY', lastDate: '2026-03-01', count: 2, category: 'other', cancelUrl: null },
    ]);
  });
});
