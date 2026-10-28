import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { balanceOf, cardKindOf } from '../src/spending/accounts.service';
import { merchantFor, renameOf } from '../src/spending/categories.service';
import { CreateAccountDto } from '../src/spending/dto/accounts.dto';
import { CreateExpenseDto } from '../src/spending/dto/spending.dto';
import { AddToGoalDto, CreateAssetDto } from '../src/spending/dto/wealth.dto';
import { kindOf } from '../src/spending/spending.service';
import { CreateSubscriptionDto } from '../src/subscriptions/dto/subscriptions.dto';
import { UpdateProfileDto } from '../src/users/dto/users.dto';

const problems = async (type: new () => object, value: object, property: string) =>
  (await validate(plainToInstance(type, value))).filter((error) => error.property === property).flatMap((error) => Object.values(error.constraints ?? {}));

const expense = { title: 'Villa', currency: 'EGP', spentOn: '2026-10-10' };

describe('Money model', () => {
  it('accepts amounts up to 10^13 minor units for spending and keeps subscriptions at their old cap', async () => {
    expect(await problems(CreateExpenseDto, { ...expense, amountMinor: 10_000_000_000_000 }, 'amountMinor')).toEqual([]);
    expect(await problems(CreateExpenseDto, { ...expense, amountMinor: 10_000_000_000_001 }, 'amountMinor')).toEqual(['That price is too large.']);
    expect(await problems(CreateAssetDto, { name: 'Land', currency: 'EGP', valueMinor: 9_000_000_000_000 }, 'valueMinor')).toEqual([]);
    expect(await problems(AddToGoalDto, { amountMinor: -10_000_000_000_000 }, 'amountMinor')).toEqual([]);
    expect(await problems(AddToGoalDto, { amountMinor: -10_000_000_000_001 }, 'amountMinor')).not.toEqual([]);
    expect(await problems(CreateSubscriptionDto, { amountMinor: 100_000_001 }, 'amountMinor')).toEqual(['That price is too large.']);
  });

  it('allows large negative balances and only the new account kinds', async () => {
    expect(await problems(CreateAccountDto, { name: 'Mortgage', currency: 'EGP', kind: 'loan', balanceMinor: -10_000_000_000_000 }, 'balanceMinor')).toEqual([]);
    expect(await problems(CreateAccountDto, { name: 'Mortgage', currency: 'EGP', balanceMinor: -10_000_000_000_001 }, 'balanceMinor')).toHaveLength(1);
    expect(await problems(CreateAccountDto, { name: 'Mortgage', currency: 'EGP', balanceMinor: 10_000_000_000_001 }, 'balanceMinor')).toEqual(['That balance is too large.']);
    expect(await problems(CreateAccountDto, { name: 'CIB', currency: 'EGP', kind: 'bank' }, 'kind')).toEqual(['Choose an account type from the list.']);
    expect(await problems(CreateAccountDto, { name: 'valU', currency: 'EGP', kind: 'bnpl' }, 'kind')).toEqual([]);
  });

  it('keeps the month start between the 1st and the 28th', async () => {
    expect(await problems(UpdateProfileDto, { monthStartDay: 25 }, 'monthStartDay')).toEqual([]);
    expect(await problems(UpdateProfileDto, { monthStartDay: 29 }, 'monthStartDay')).toEqual(['Months start on day 1 to 28.']);
  });

  it('derives the transaction kind from its direction', () => {
    expect(['spent', 'received', 'refund', 'transfer'].map(kindOf)).toEqual(['purchase', 'income', 'refund', 'transfer']);
    expect(['credit_card', 'prepaid', 'bank_current', 'wallet'].map(cardKindOf)).toEqual(['credit', 'prepaid', 'debit', 'debit']);
  });

  it('matches the merchant with the longest alias and renames only when the name differs from its aliases', () => {
    const merchants = [
      { id: 'uber', name: 'Uber', aliases: ['uber'] },
      { id: 'eats', name: 'Uber Eats', aliases: ['uber eats', 'ubereats'] },
      { id: 'store', name: 'cashback store', aliases: ['cashback store'] },
    ];
    expect(merchantFor(merchants, 'UBER EATS CAIRO')?.id).toBe('eats');
    expect(merchantFor(merchants, 'UBER *TRIP')?.id).toBe('uber');
    expect(merchantFor(merchants, 'Carrefour')).toBeNull();
    expect(renameOf(merchants[1]!)).toBe('Uber Eats');
    expect(renameOf(merchants[2]!)).toBeNull();
  });

  it('adds flows after the anchor to a balance held as BigInt', () => {
    const account = { id: 'bank', currency: 'EGP', balanceMinor: 9_000_000_000_000n, balanceAt: new Date('2026-10-01T00:00:00Z') };
    const flow = (amountMinor: bigint, direction: string, at: string) => ({ amountMinor, currency: 'EGP', direction, accountId: 'bank', toAccountId: null, item: { createdAt: new Date(at) } });
    expect(
      balanceOf(account, [flow(500n, 'spent', '2026-09-30T00:00:00Z'), flow(2_000_000_000_000n, 'received', '2026-10-02T00:00:00Z'), flow(1000n, 'spent', '2026-10-03T00:00:00Z')], new Map()),
    ).toEqual({ balanceMinor: 10_999_999_999_000, missing: [] });
  });
});
