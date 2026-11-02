import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { TransactionsDto, UpdateExpensesDto } from '../src/spending/dto/spending.dto';
import { after, cursorOf, readCursor, runningBalances, transactionsWhere } from '../src/spending/transactions';

const problems = async (type: new () => object, value: object) =>
  (await validate(plainToInstance(type, value))).flatMap((error) => Object.values(error.constraints ?? {}));

describe('Transactions list', () => {
  it('round-trips the cursor and refuses a tampered one', () => {
    const key = { spentOn: '2026-10-27', createdAt: new Date('2026-10-27T08:30:00.000Z'), id: '5d1f3c8e-2f1a-4c55-9b61-0d6f5a6c2e11' };
    expect(readCursor(cursorOf(key))).toEqual(key);
    expect(() => readCursor('not-a-cursor')).toThrow(BadRequestException);
    expect(() => readCursor(Buffer.from(JSON.stringify(['27/10/2026', 'x', 1])).toString('base64url'))).toThrow(BadRequestException);
  });

  it('continues strictly after the cursor in date, then creation, then id order', () => {
    const createdAt = new Date('2026-10-27T08:30:00.000Z');
    expect(after({ spentOn: '2026-10-27', createdAt, id: 'b' })).toEqual({
      OR: [
        { spentOn: { lt: new Date('2026-10-27T00:00:00.000Z') } },
        { spentOn: new Date('2026-10-27T00:00:00.000Z'), createdAt: { lt: createdAt } },
        { spentOn: new Date('2026-10-27T00:00:00.000Z'), createdAt, id: { lt: 'b' } },
      ],
    });
  });

  it('turns filters into one query and searches title, merchant and note', () => {
    expect(transactionsWhere('user', {})).toEqual({ userId: 'user', trashedAt: null });
    const where = transactionsWhere('user', { q: ' uber ', account: 'cib', card: '4512', category: 'transport', min: 1000, max: 5000 });
    expect(where).toEqual({
      userId: 'user',
      trashedAt: null,
      OR: [{ accountId: 'cib' }, { toAccountId: 'cib' }],
      cardDigits: '4512',
      category: 'transport',
      direction: { in: ['spent', 'refund'] },
      amountMinor: { gte: 1000, lte: 5000 },
      AND: [
        {
          OR: [
            { title: { contains: 'uber', mode: 'insensitive' } },
            { merchant: { contains: 'uber', mode: 'insensitive' } },
            { note: { contains: 'uber', mode: 'insensitive' } },
          ],
        },
      ],
    });
    expect(transactionsWhere('user', { direction: 'received', kind: 'salary' })).toEqual({ userId: 'user', trashedAt: null, direction: 'received', kind: 'salary' });
  });

  it('walks the balance back from the current one, newest first', () => {
    const flows = [
      { id: 'coffee', amountMinor: 5000, currency: 'EGP', direction: 'spent', accountId: 'cib', toAccountId: null },
      { id: 'salary', amountMinor: 100_000, currency: 'EGP', direction: 'received', accountId: 'cib', toAccountId: null },
      { id: 'top-up', amountMinor: 20_000, currency: 'EGP', direction: 'transfer', accountId: 'wallet', toAccountId: 'cib' },
      { id: 'netflix', amountMinor: 1000, currency: 'USD', direction: 'spent', accountId: 'cib', toAccountId: null },
      { id: 'rent', amountMinor: 50_000, currency: 'EGP', direction: 'spent', accountId: 'cib', toAccountId: null },
    ];
    const balances = runningBalances('cib', 200_000, flows, (amount, currency) => (currency === 'USD' ? amount * 50 : amount));
    expect(Object.fromEntries(balances)).toEqual({ coffee: 200_000, salary: 205_000, 'top-up': 105_000, netflix: 85_000, rent: 135_000 });
  });

  it('validates the query and the bulk change', async () => {
    expect(await problems(TransactionsDto, { limit: '50', min: '100', max: '20000', card: '4512' })).toEqual([]);
    expect(await problems(TransactionsDto, { limit: '500' })).toEqual(['Load at most 200 transactions at a time.']);
    expect(await problems(TransactionsDto, { card: '45' })).toEqual(['A card ending is its last 4 digits.']);
    expect(await problems(TransactionsDto, { kind: 'gift' })).toEqual(['Choose a kind of transaction from the list.']);
    expect(await problems(UpdateExpensesDto, { ids: [], category: 'groceries' })).toEqual(['Choose at least one transaction.']);
    expect(await problems(UpdateExpensesDto, { ids: ['nope'], accountId: null })).toEqual(['Choose transactions from the list.']);
    expect(await problems(UpdateExpensesDto, { ids: ['5d1f3c8e-2f1a-4c55-9b61-0d6f5a6c2e11'], accountId: null })).toEqual([]);
  });
});
