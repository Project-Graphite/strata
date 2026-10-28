import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { CapturedMessage, MoneyAccount, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { AccessService } from '../../access/access.service';
import { tokenPrefix } from '../../access-tokens/scopes';
import { ChangesService } from '../../changes/changes.service';
import { linkTokenHash } from '../../crypto/link-token';
import { SecretBox } from '../../crypto/secret-box.service';
import { fractionDigits } from '../../exchange-rates/exchange-rates.service';
import { MaintenanceScheduler } from '../../jobs/maintenance.scheduler';
import { PrismaService } from '../../prisma/prisma.service';
import { localDate } from '../../recurrence/dates';
import { CaptureMessageDto } from '../dto/capture.dto';
import { merchantFor, renameOf } from '../categories.service';
import { CreateExpenseDto } from '../dto/spending.dto';
import { SpendingService } from '../spending.service';
import { chatAllowed, DigitalPaymentApp, MessageDirection, normalise, paymentLabelOf } from './bank-messages';
import { MovementKind } from './senders/template';
import { parserVersion, parseMessage } from './sms-parser';

const keepTextForMs = 90 * 24 * 60 * 60 * 1000;
const pairWithinMs = 10 * 60 * 1000;

export interface Suggestion {
  direction: MessageDirection | null;
  amountMinor: number | null;
  currency: string | null;
  merchant: string | null;
  cardDigits: string | null;
  accountId: string | null;
  availableMinor: number | null;
  paymentLabel?: DigitalPaymentApp | null;
  movement?: MovementKind | null;
  occurredOn?: string | null;
  reference?: string | null;
  confidence?: number;
  templateId?: string | null;
}

const toMinor = (amount: number, currency: string) => Math.round(amount * 10 ** fractionDigits(currency));

export function accountFor(
  accounts: (MoneyAccount & { cards: { last4: string }[] })[],
  sender: string,
  cardDigits: string | null,
  paymentLabel: string | null = null,
  chat: string | null = null,
) {
  const byCard = cardDigits ? accounts.filter((account) => account.cards.some((card) => card.last4 === cardDigits)) : [];
  if (byCard.length === 1) return byCard[0]!;
  const needles = [sender, chat ?? '', paymentLabel ?? ''].map((value) => value.trim().toLowerCase()).filter(Boolean);
  const bySender = accounts.filter((account) => account.senders.some((known) => needles.includes(known.trim().toLowerCase())));
  const candidates = byCard.length ? byCard.filter((account) => bySender.includes(account)) : bySender;
  if (candidates.length === 1) return candidates[0]!;
  if (paymentLabel) {
    const byName = accounts.filter((account) => account.name.trim().toLowerCase() === paymentLabel.toLowerCase());
    if (byName.length === 1) return byName[0]!;
  }
  return null;
}

@Injectable()
export class CaptureService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly box: SecretBox,
    private readonly spending: SpendingService,
    private readonly maintenance: MaintenanceScheduler,
    private readonly changes: ChangesService,
  ) {}

  onModuleInit() {
    this.maintenance.register(async (now) => {
      const before = new Date(now.getTime() - keepTextForMs);
      await this.prisma.capturedMessage.updateMany({ where: { createdAt: { lt: before }, expenseId: { not: null }, textSealed: { not: null } }, data: { textSealed: null } });
      await this.prisma.capturedMessage.deleteMany({ where: { createdAt: { lt: before }, expenseId: null } });
    });
  }

  async connectDevice(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const name = `Android phone (${spaceId.slice(0, 8)})`;
    await this.prisma.accessToken.updateMany({
      where: { userId, name, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const token = `${tokenPrefix}${randomBytes(32).toString('base64url')}`;
    await this.prisma.accessToken.create({
      data: {
        userId,
        name,
        tokenHash: linkTokenHash(token),
        scopes: ['spending:capture'],
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });
    return { token };
  }

  async receive(userId: string, spaceId: string, input: CaptureMessageDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const sender = input.from.trim();
    if (!chatAllowed(sender, input.allowedChats, input.app, input.text, input.chat)) {
      return { status: 'ignored', reason: 'chat' };
    }
    const read = parseMessage(sender, input.text, input.app);
    if (read.kind === 'ignored') return { status: 'ignored', reason: read.reason };
    const paymentLabel = paymentLabelOf(sender, input.text, input.app);
    const hash = createHash('sha256').update(`${sender.toLowerCase()}\n${normalise(input.text)}`).digest('hex');
    const seen = await this.prisma.capturedMessage.findUnique({ where: { spaceId_hash: { spaceId, hash } }, select: { status: true, expenseId: true } });
    if (seen) return { status: seen.status, expenseId: seen.expenseId };

    const [user, accounts, merchants] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } }),
      this.prisma.moneyAccount.findMany({ where: { spaceId }, include: { cards: { select: { last4: true } } } }),
      this.prisma.merchant.findMany({ where: { spaceId } }),
    ]);
    const known = read.merchant ? merchantFor(merchants, read.merchant) : null;
    if (known?.ignore) return { status: 'ignored', reason: 'rule' };
    const account = accountFor(accounts, sender, read.cardDigits, paymentLabel, input.chat ?? null);
    const currency = read.currency ?? account?.currency ?? null;
    const suggestion: Suggestion = {
      direction: read.direction,
      amountMinor: read.amount !== null && currency ? toMinor(read.amount, currency) : null,
      currency,
      merchant: read.merchant,
      cardDigits: read.cardDigits,
      accountId: account?.id ?? null,
      availableMinor: read.available !== null && account ? toMinor(read.available, account.currency) : null,
      ...(paymentLabel ? { paymentLabel } : {}),
      movement: read.movement,
      occurredOn: read.occurredOn,
      reference: read.reference,
      confidence: read.confidence,
      templateId: read.templateId,
    };
    const receivedAt = input.receivedStamp ? new Date(Number(input.receivedStamp)) : new Date();
    const message = await this.prisma.capturedMessage
      .create({ data: { spaceId, userId, sender, textSealed: this.box.seal(input.text), hash, receivedAt, suggestion: { ...suggestion }, parserVersion, templateId: read.templateId, confidence: read.confidence } })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
        throw error;
      });
    if (!message) return { status: 'review', expenseId: null };
    this.changes.notify('spending', { spaceId });

    const { direction, amountMinor, merchant, cardDigits } = suggestion;
    const category = direction === 'received' ? 'other' : (known?.category ?? (merchant ? await this.knownCategory(spaceId, merchant) : null));
    if (!direction || !amountMinor || !currency || !category || !suggestion.accountId) return { status: 'review', expenseId: null };
    const expenseId = await this.record(userId, message, {
      title: (known && renameOf(known)) ?? merchant ?? paymentLabel ?? sender,
      amountMinor,
      currency,
      spentOn: read.occurredOn ?? localDate(user.timeZone, receivedAt),
      category: category as CreateExpenseDto['category'],
      direction,
      accountId: suggestion.accountId,
      merchant,
      cardDigits,
      ...(paymentLabel ? { paymentLabel } : {}),
    });
    return { status: 'recorded', expenseId };
  }

  async pending(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const rows = await this.prisma.capturedMessage.findMany({ where: { spaceId, status: 'review', textSealed: { not: null } }, orderBy: { receivedAt: 'desc' }, take: 100 });
    return rows.map((row) => ({ id: row.id, sender: row.sender, text: this.box.open(row.textSealed!), receivedAt: row.receivedAt, suggestion: row.suggestion as unknown as Suggestion }));
  }

  async recordReviewed(userId: string, id: string, input: CreateExpenseDto) {
    const message = await this.waiting(userId, id);
    return this.spending.get(userId, await this.record(userId, message, input));
  }

  async ignore(userId: string, id: string) {
    const message = await this.waiting(userId, id);
    await this.prisma.capturedMessage.update({ where: { id: message.id }, data: { status: 'ignored' } });
    this.changes.notify('spending', { spaceId: message.spaceId });
  }

  private async waiting(userId: string, id: string) {
    const message = await this.prisma.capturedMessage.findUnique({ where: { id } });
    if (!message) throw new NotFoundException('Message not found');
    await this.access.assertPersonalSpace(userId, message.spaceId);
    if (message.status !== 'review') throw new BadRequestException('This message has already been handled');
    return message;
  }

  private async record(userId: string, message: CapturedMessage, input: CreateExpenseDto) {
    const { accountId, availableMinor, paymentLabel, movement, direction, reference } = message.suggestion as unknown as Suggestion;
    const enriched: CreateExpenseDto = {
      ...input,
      ...(input.paymentLabel === undefined && paymentLabel ? { paymentLabel } : {}),
      ...(input.kind === undefined && movement && input.direction === direction ? { kind: movement } : {}),
    };
    const expenseId =
      (await this.sameMovement(userId, message, enriched)) ??
      (await this.pairedTransfer(userId, message.spaceId, enriched)) ??
      (await this.spending.capture(userId, message.spaceId, enriched, 'sms'));
    const merchants = enriched.merchant ? await this.prisma.merchant.findMany({ where: { spaceId: message.spaceId } }) : [];
    await this.prisma.$transaction([
      this.prisma.capturedMessage.update({ where: { id: message.id }, data: { status: 'recorded', expenseId } }),
      this.prisma.expense.updateMany({
        where: { itemId: expenseId, captureId: null },
        data: { captureId: message.id, occurredAt: message.receivedAt, reference: reference ?? null, merchantId: merchantFor(merchants, enriched.merchant ?? '')?.id ?? null },
      }),
    ]);
    if (availableMinor !== null && accountId && enriched.accountId === accountId) await this.reportBalance(accountId, availableMinor);
    this.changes.notify('spending', { spaceId: message.spaceId });
    return expenseId;
  }

  private async sameMovement(userId: string, message: CapturedMessage, input: CreateExpenseDto) {
    if (!input.accountId || !input.direction) return null;
    const duplicate = await this.prisma.expense.findFirst({
      where: {
        source: 'sms',
        direction: input.direction,
        amountMinor: input.amountMinor,
        currency: input.currency,
        accountId: input.accountId,
        ...(input.paymentLabel ? {} : { paymentLabel: { not: null } }),
        item: {
          spaceId: message.spaceId,
          trashedAt: null,
          createdAt: { gte: new Date(Date.now() - pairWithinMs) },
          captures: { some: { sender: { not: message.sender, mode: 'insensitive' } } },
        },
      },
      orderBy: { item: { createdAt: 'desc' } },
      select: { itemId: true, paymentLabel: true, cardDigits: true },
    });
    if (!duplicate) return null;
    const updates: Partial<CreateExpenseDto> = {};
    if (input.paymentLabel && !duplicate.paymentLabel) updates.paymentLabel = input.paymentLabel;
    if (input.cardDigits && !duplicate.cardDigits) updates.cardDigits = input.cardDigits;
    if (Object.keys(updates).length > 0) await this.spending.update(userId, duplicate.itemId, updates);
    return duplicate.itemId;
  }

  private async pairedTransfer(userId: string, spaceId: string, input: CreateExpenseDto) {
    if (!input.accountId || (input.direction !== 'spent' && input.direction !== 'received')) return null;
    const counterpart = await this.prisma.expense.findFirst({
      where: {
        source: 'sms',
        direction: input.direction === 'spent' ? 'received' : 'spent',
        amountMinor: input.amountMinor,
        currency: input.currency,
        accountId: { not: input.accountId },
        item: { spaceId, trashedAt: null, createdAt: { gte: new Date(Date.now() - pairWithinMs) } },
      },
      orderBy: { item: { createdAt: 'desc' } },
      select: { itemId: true, accountId: true },
    });
    if (!counterpart) return null;
    const [from, to] = input.direction === 'spent' ? [input.accountId, counterpart.accountId] : [counterpart.accountId, input.accountId];
    await this.spending.update(userId, counterpart.itemId, { title: 'Transfer', direction: 'transfer', accountId: from, toAccountId: to });
    return counterpart.itemId;
  }

  private async reportBalance(accountId: string, availableMinor: number) {
    const account = await this.prisma.moneyAccount.findUniqueOrThrow({ where: { id: accountId } });
    if (account.kind === 'credit_card' && account.creditLimitMinor === null) return;
    const balanceMinor = account.kind === 'credit_card' ? availableMinor - Number(account.creditLimitMinor) : availableMinor;
    await this.prisma.moneyAccount.update({ where: { id: accountId }, data: { balanceMinor, balanceAt: new Date(), balances: { create: { balanceMinor, source: 'sms' } } } });
  }

  private async knownCategory(spaceId: string, merchant: string) {
    const known = await this.prisma.expense.findFirst({
      where: { merchant: { equals: merchant, mode: 'insensitive' }, direction: { in: ['spent', 'refund'] }, item: { spaceId, trashedAt: null } },
      orderBy: { item: { createdAt: 'desc' } },
      select: { category: true },
    });
    return known?.category ?? null;
  }
}
