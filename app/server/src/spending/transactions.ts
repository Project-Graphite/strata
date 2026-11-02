import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { dateValue } from '../recurrence/dates';
import { flowSign } from './accounts.service';
import type { TransactionsDto } from './dto/spending.dto';

export interface TransactionKey {
  spentOn: string;
  createdAt: Date;
  id: string;
}

export const cursorOf = ({ spentOn, createdAt, id }: TransactionKey) => Buffer.from(JSON.stringify([spentOn, createdAt.toISOString(), id])).toString('base64url');

export function readCursor(cursor: string): TransactionKey {
  try {
    const [spentOn, createdAt, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as unknown[];
    if (typeof spentOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(spentOn) && typeof createdAt === 'string' && !Number.isNaN(Date.parse(createdAt)) && typeof id === 'string') {
      return { spentOn, createdAt: new Date(createdAt), id };
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  throw new BadRequestException('That page of transactions no longer exists. Reload the list.');
}

export const transactionOrder: Prisma.ExpenseOrderByWithRelationInput[] = [{ spentOn: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];

export function transactionsWhere(userId: string, query: Omit<TransactionsDto, 'cursor' | 'limit'>): Prisma.ExpenseWhereInput {
  const search = query.q?.trim();
  return {
    userId,
    trashedAt: null,
    ...(query.account ? { OR: [{ accountId: query.account }, { toAccountId: query.account }] } : {}),
    ...(query.card ? { cardDigits: query.card } : {}),
    ...(query.category ? { category: query.category, direction: { in: ['spent', 'refund'] } } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.direction ? { direction: query.direction } : {}),
    ...(query.min !== undefined || query.max !== undefined ? { amountMinor: { gte: query.min, lte: query.max } } : {}),
    ...(search
      ? {
          AND: [
            {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { merchant: { contains: search, mode: 'insensitive' } },
                { note: { contains: search, mode: 'insensitive' } },
              ],
            },
          ],
        }
      : {}),
  };
}

export function after(key: TransactionKey): Prisma.ExpenseWhereInput {
  const spentOn = dateValue(key.spentOn);
  return {
    OR: [{ spentOn: { lt: spentOn } }, { spentOn, createdAt: { lt: key.createdAt } }, { spentOn, createdAt: key.createdAt, id: { lt: key.id } }],
  };
}

export interface Flow {
  id: string;
  amountMinor: number;
  currency: string;
  direction: string;
  accountId: string | null;
  toAccountId: string | null;
}

export function runningBalances(accountId: string, currentMinor: number, newestFirst: Flow[], convert: (amountMinor: number, currency: string) => number | null) {
  const balances = new Map<string, number>();
  let balance = currentMinor;
  for (const flow of newestFirst) {
    balances.set(flow.id, balance);
    balance -= flowSign(accountId, flow) * (convert(flow.amountMinor, flow.currency) ?? 0);
  }
  return balances;
}
