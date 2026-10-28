import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { CapturedMessage, Prisma } from '@prisma/client';
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
import { CaptureMessageDto, IgnoreCaptureDto, RecordCaptureDto } from '../dto/capture.dto';
import { CategoriesService, merchantFor, renameOf } from '../categories.service';
import { CreateExpenseDto } from '../dto/spending.dto';
import { SpendingService } from '../spending.service';
import { chatAllowed, DigitalPaymentApp, MessageDirection, normalise, paymentLabelOf } from './bank-messages';
import { accountFor, autoRecordable, ignoredSender, matchWindowMs, Movement, pairFor, sameMovement, transferCounterpart } from './matching';
import { CorrectedFields, fixturesOf, ParsedFields, reportOf } from './parser-reports';
import { SenderRulesService } from './sender-rules.service';
import { MovementKind } from './senders/template';
import { parserVersion, parseMessage } from './sms-parser';

const keepTextForMs = 90 * 24 * 60 * 60 * 1000;

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
  title?: string;
  category?: string | null;
  transfer?: { expenseId: string; fromAccountId: string; toAccountId: string } | null;
}

const movementFields = {
  itemId: true,
  accountId: true,
  amountMinor: true,
  currency: true,
  direction: true,
  reference: true,
  occurredAt: true,
  merchant: true,
  paymentLabel: true,
  cardDigits: true,
  item: { select: { captures: { select: { sender: true, textSealed: true } } } },
} satisfies Prisma.ExpenseSelect;

type MovementRow = Prisma.ExpenseGetPayload<{ select: typeof movementFields }>;

const toMinor = (amount: number, currency: string) => Math.round(amount * 10 ** fractionDigits(currency));
const toMajor = (minor: number | null, currency: string | null) => (minor === null || !currency ? null : minor / 10 ** fractionDigits(currency));

@Injectable()
export class CaptureService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly box: SecretBox,
    private readonly spending: SpendingService,
    private readonly categories: CategoriesService,
    private readonly senderRules: SenderRulesService,
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

    const [user, accounts, merchants, rules] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } }),
      this.prisma.moneyAccount.findMany({ where: { spaceId }, include: { cards: { select: { last4: true } } } }),
      this.prisma.merchant.findMany({ where: { spaceId } }),
      this.senderRules.rulesOf(spaceId),
    ]);
    if (ignoredSender(rules, sender)) return { status: 'ignored', reason: 'rule' };
    const known = read.merchant ? merchantFor(merchants, read.merchant) : null;
    if (known?.ignore) return { status: 'ignored', reason: 'rule' };
    const account = accountFor(accounts, rules, sender, read.cardDigits, paymentLabel, input.chat ?? null);
    const currency = read.currency ?? account?.currency ?? null;
    const receivedAt = input.receivedStamp ? new Date(Number(input.receivedStamp)) : new Date();
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
      title: (known && renameOf(known)) ?? read.merchant ?? paymentLabel ?? sender,
      category: read.direction === 'received' ? 'other' : (known?.category ?? (read.merchant ? await this.knownCategory(spaceId, read.merchant) : null)),
    };
    const ready = autoRecordable(suggestion);
    const own: Movement = {
      senders: [sender],
      reference: read.reference,
      accountId: suggestion.accountId,
      amountMinor: suggestion.amountMinor ?? 0,
      currency: currency ?? '',
      direction: read.direction ?? '',
      occurredAt: receivedAt,
      text: normalise(input.text),
    };
    const duplicate = ready && !!(await this.duplicateRow(spaceId, own));
    const pair = ready && !duplicate ? pairFor(own, await this.nearby(spaceId, own), new Map(accounts.map((listed) => [listed.id, listed.handle])), rules) : null;
    if (pair && !pair.confirmed) suggestion.transfer = { expenseId: pair.expenseId, fromAccountId: pair.fromAccountId, toAccountId: pair.toAccountId };
    const message = await this.prisma.capturedMessage
      .create({ data: { spaceId, userId, sender, textSealed: this.box.seal(input.text), hash, receivedAt, suggestion: { ...suggestion }, parserVersion, templateId: read.templateId, confidence: read.confidence } })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
        throw error;
      });
    if (!message) return { status: 'review', expenseId: null };
    this.changes.notify('spending', { spaceId });

    if (!ready || (!duplicate && (pair ? !pair.confirmed : !suggestion.category))) return { status: 'review', expenseId: null };
    const draft: CreateExpenseDto = {
      title: suggestion.title!,
      amountMinor: suggestion.amountMinor!,
      currency: currency!,
      spentOn: read.occurredOn ?? localDate(user.timeZone, receivedAt),
      category: suggestion.category ?? 'other',
      direction: read.direction!,
      accountId: suggestion.accountId,
      merchant: read.merchant,
      cardDigits: read.cardDigits,
      ...(paymentLabel ? { paymentLabel } : {}),
    };
    const expenseId = await this.record(
      userId,
      message,
      pair ? { ...draft, title: 'Transfer', direction: 'transfer', accountId: pair.fromAccountId, toAccountId: pair.toAccountId } : draft,
    );
    return { status: 'recorded', expenseId };
  }

  async pending(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const rows = await this.prisma.capturedMessage.findMany({ where: { spaceId, status: 'review', textSealed: { not: null } }, orderBy: { receivedAt: 'desc' }, take: 100 });
    return rows.map((row) => ({ id: row.id, sender: row.sender, text: this.box.open(row.textSealed!), receivedAt: row.receivedAt, suggestion: row.suggestion as unknown as Suggestion }));
  }

  async recordReviewed(userId: string, id: string, { remember, report, ...input }: RecordCaptureDto) {
    const message = await this.waiting(userId, id);
    const expenseId = await this.record(userId, message, input);
    if (remember) await this.learn(userId, message, input);
    if (report) await this.report(userId, message, input, expenseId);
    return this.spending.get(userId, expenseId);
  }

  async ignore(userId: string, id: string, input: IgnoreCaptureDto) {
    const message = await this.waiting(userId, id);
    const { merchant } = message.suggestion as unknown as Suggestion;
    if (input.always === 'merchant' && !merchant) throw new BadRequestException('This message names no merchant to ignore');
    if (input.always === 'sender') await this.senderRules.ignore(message.spaceId, message.sender);
    if (input.always === 'merchant') await this.categories.saveRule(userId, message.spaceId, { match: merchant!.toLowerCase(), ignore: true });
    await this.prisma.capturedMessage.update({ where: { id: message.id }, data: { status: 'ignored' } });
    this.changes.notify('spending', { spaceId: message.spaceId });
  }

  async reports() {
    const rows = await this.prisma.parserReport.findMany({ orderBy: { createdAt: 'asc' } });
    return fixturesOf(rows.map((row) => ({ sender: row.sender, institution: row.institution, text: row.text, parsed: row.parsed as unknown as ParsedFields, corrected: row.corrected as unknown as CorrectedFields })));
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
      ...(input.kind === undefined && movement && (input.direction === direction || (input.direction === 'transfer' && movement === 'card_payment')) ? { kind: movement } : {}),
    };
    const own: Movement = {
      senders: [message.sender],
      reference: reference ?? null,
      accountId: enriched.accountId ?? null,
      amountMinor: enriched.amountMinor,
      currency: enriched.currency,
      direction: enriched.direction ?? 'spent',
      occurredAt: message.receivedAt,
      text: '',
    };
    const expenseId =
      (await this.joinDuplicate(userId, message.spaceId, own, enriched)) ??
      (await this.joinTransfer(userId, message.spaceId, direction, own, enriched)) ??
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

  private movementOf(row: MovementRow): Movement {
    const captures = row.item.captures;
    return {
      id: row.itemId,
      senders: captures.map((capture) => capture.sender),
      reference: row.reference,
      accountId: row.accountId,
      amountMinor: row.amountMinor,
      currency: row.currency,
      direction: row.direction,
      occurredAt: row.occurredAt,
      text: normalise([row.merchant ?? '', ...captures.map((capture) => (capture.textSealed ? this.box.open(capture.textSealed) : ''))].join(' ')),
    };
  }

  private window(own: Movement) {
    const at = own.occurredAt!.getTime();
    return { gte: new Date(at - matchWindowMs), lte: new Date(at + matchWindowMs) };
  }

  private async duplicateRow(spaceId: string, own: Movement) {
    if (!own.direction || own.direction === 'transfer' || !own.currency) return null;
    const rows = await this.prisma.expense.findMany({
      where: {
        source: 'sms',
        direction: own.direction,
        item: { spaceId, trashedAt: null },
        OR: [...(own.reference ? [{ reference: own.reference }] : []), { amountMinor: own.amountMinor, currency: own.currency, occurredAt: this.window(own) }],
      },
      orderBy: { occurredAt: 'desc' },
      select: movementFields,
    });
    return rows.find((row) => sameMovement(own, this.movementOf(row))) ?? null;
  }

  private async joinDuplicate(userId: string, spaceId: string, own: Movement, input: CreateExpenseDto) {
    const duplicate = await this.duplicateRow(spaceId, own);
    if (!duplicate) return null;
    const updates: Partial<CreateExpenseDto> = {};
    if (input.paymentLabel && !duplicate.paymentLabel) updates.paymentLabel = input.paymentLabel;
    if (input.cardDigits && !duplicate.cardDigits) updates.cardDigits = input.cardDigits;
    if (Object.keys(updates).length > 0) await this.spending.update(userId, duplicate.itemId, updates);
    return duplicate.itemId;
  }

  private async nearby(spaceId: string, own: Movement) {
    const rows = await this.prisma.expense.findMany({
      where: { source: 'sms', direction: { in: ['spent', 'received'] }, amountMinor: own.amountMinor, currency: own.currency, occurredAt: this.window(own), item: { spaceId, trashedAt: null } },
      select: movementFields,
    });
    return rows.map((row) => this.movementOf(row));
  }

  private async joinTransfer(userId: string, spaceId: string, side: MessageDirection | null, own: Movement, input: CreateExpenseDto) {
    if (input.direction !== 'transfer' || !input.accountId || !input.toAccountId) return null;
    const counterpart = transferCounterpart(side, input.accountId, input.toAccountId, own, await this.nearby(spaceId, own));
    if (!counterpart) return null;
    await this.spending.update(userId, counterpart, { title: input.title, direction: 'transfer', accountId: input.accountId, toAccountId: input.toAccountId, ...(input.kind ? { kind: input.kind } : {}) });
    return counterpart;
  }

  private async learn(userId: string, message: CapturedMessage, input: CreateExpenseDto) {
    const suggestion = message.suggestion as unknown as Suggestion;
    if (input.direction === 'transfer') {
      if (input.accountId && input.toAccountId) await this.senderRules.learnTransfer(message.spaceId, message.sender, input.accountId, input.toAccountId);
      return;
    }
    if (suggestion.merchant) {
      await this.categories.saveRule(userId, message.spaceId, { match: suggestion.merchant.toLowerCase(), rename: input.title, category: input.direction === 'received' ? null : (input.category ?? null) });
    }
    if (input.accountId && input.accountId !== suggestion.accountId) await this.senderRules.learnAccount(message.spaceId, message.sender, input.accountId, input.cardDigits);
  }

  private async report(userId: string, message: CapturedMessage, input: CreateExpenseDto, expenseId: string) {
    const suggestion = message.suggestion as unknown as Suggestion;
    const { kind } = await this.prisma.expense.findUniqueOrThrow({ where: { itemId: expenseId }, select: { kind: true } });
    const stored = reportOf(
      message.sender,
      this.box.open(message.textSealed!),
      {
        direction: suggestion.direction,
        movement: suggestion.movement ?? null,
        amount: toMajor(suggestion.amountMinor, suggestion.currency),
        currency: suggestion.currency,
        cardDigits: suggestion.cardDigits,
        merchant: suggestion.merchant,
        available: toMajor(suggestion.availableMinor, suggestion.currency),
        occurredOn: suggestion.occurredOn ?? null,
      },
      {
        direction: input.direction ?? 'spent',
        movement: kind,
        amount: toMajor(input.amountMinor, input.currency)!,
        currency: input.currency,
        cardDigits: input.cardDigits ?? null,
        category: input.category ?? null,
      },
      [input.title, input.merchant],
    );
    const data = { ...stored, parsed: { ...stored.parsed }, corrected: { ...stored.corrected }, parserVersion: message.parserVersion, templateId: message.templateId };
    await this.prisma.parserReport.upsert({ where: { captureId: message.id }, create: { userId, captureId: message.id, ...data }, update: data });
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
