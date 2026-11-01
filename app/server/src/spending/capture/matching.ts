export const autoRecordConfidence = 0.85;
export const matchWindowMs = 10 * 60 * 1000;
export const payoffWindowMs = 6 * 60 * 60 * 1000;

export interface Movement {
  id?: string;
  senders: string[];
  reference: string | null;
  accountId: string | null;
  amountMinor: bigint | number;
  currency: string;
  direction: string;
  occurredAt: Date | null;
  text: string;
}

export interface AccountRule {
  pattern: string;
  accountId: string | null;
  toAccountId: string | null;
  ignore: boolean;
  cardDigits: string | null;
  card: { last4: string; accountId: string } | null;
}

export interface TransferPair {
  expenseId: string;
  fromAccountId: string;
  toAccountId: string;
  confirmed: boolean;
}

export const senderKey = (sender: string) => sender.trim().toLowerCase();

export const autoRecordable = (suggestion: { confidence?: number; accountId: string | null; direction: string | null; amountMinor: number | null; currency: string | null }) =>
  (suggestion.confidence ?? 0) >= autoRecordConfidence && !!suggestion.accountId && !!suggestion.direction && !!suggestion.amountMinor && !!suggestion.currency;

export const withinWindow = (a: Date | null, b: Date | null) => !!a && !!b && Math.abs(a.getTime() - b.getTime()) <= matchWindowMs;

const sameAmount = (a: Movement, b: Movement) => BigInt(a.amountMinor) === BigInt(b.amountMinor) && a.currency === b.currency;

export function sameMovement(message: Movement, other: Movement) {
  if (message.direction !== other.direction) return false;
  if (message.reference && other.reference) return message.reference === other.reference;
  const senders = new Set(message.senders.map(senderKey));
  return (
    !other.senders.some((sender) => senders.has(senderKey(sender))) &&
    !!message.accountId &&
    message.accountId === other.accountId &&
    sameAmount(message, other) &&
    withinWindow(message.occurredAt, other.occurredAt)
  );
}

export function ruledAccount(rules: AccountRule[], sender: string, cardDigits: string | null) {
  const matching = rules.filter((rule) => !rule.ignore && !rule.toAccountId && rule.pattern === senderKey(sender));
  const rule = matching.find((candidate) => candidate.card && candidate.card.last4 === cardDigits) ?? matching.find((candidate) => !candidate.card && candidate.accountId);
  return rule ? (rule.card?.accountId ?? rule.accountId) : null;
}

export function accountFor<T extends { id: string; name: string; senders: string[]; cards: { last4: string }[] }>(
  accounts: T[],
  rules: AccountRule[],
  sender: string,
  cardDigits: string | null,
  paymentLabel: string | null = null,
  chat: string | null = null,
) {
  const byCard = cardDigits ? accounts.filter((account) => account.cards.some((card) => card.last4 === cardDigits)) : [];
  if (byCard.length === 1) return byCard[0]!;
  const ruled = accounts.find((account) => account.id === ruledAccount(rules, sender, cardDigits));
  if (ruled) return ruled;
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

export const ignoredSender = (rules: AccountRule[], sender: string, cardDigits: string | null) =>
  rules.some((rule) => rule.ignore && rule.pattern === senderKey(sender) && (!rule.cardDigits || rule.cardDigits === cardDigits));

const mentions = (text: string, handle: string | null | undefined) => !!handle && handle.trim().length >= 4 && text.toLowerCase().includes(handle.trim().toLowerCase());

export function pairFor(message: Movement, candidates: Movement[], handles: Map<string, string | null>, confirmedPairs: AccountRule[]): TransferPair | null {
  const opposite = message.direction === 'spent' ? 'received' : message.direction === 'received' ? 'spent' : null;
  if (!opposite || !message.accountId) return null;
  const other = candidates
    .filter((candidate) => candidate.id && candidate.direction === opposite && candidate.accountId && candidate.accountId !== message.accountId && sameAmount(message, candidate) && withinWindow(message.occurredAt, candidate.occurredAt))
    .sort((a, b) => Math.abs(a.occurredAt!.getTime() - message.occurredAt!.getTime()) - Math.abs(b.occurredAt!.getTime() - message.occurredAt!.getTime()))[0];
  if (!other) return null;
  const [fromAccountId, toAccountId] = message.direction === 'spent' ? [message.accountId, other.accountId!] : [other.accountId!, message.accountId];
  const hinted =
    (!!message.reference && message.reference === other.reference) ||
    mentions(message.text, handles.get(other.accountId!)) ||
    mentions(other.text, handles.get(message.accountId));
  const ruled = confirmedPairs.some((rule) => rule.accountId === fromAccountId && rule.toAccountId === toAccountId);
  return { expenseId: other.id!, fromAccountId, toAccountId, confirmed: hinted || ruled };
}

export interface PayoffSide {
  id: string;
  accountId: string;
  amountMinor: bigint | number;
  currency: string;
  occurredAt: Date;
}

export const paysCard = (suggestion: { movement?: string | null; direction: string | null }) => suggestion.movement === 'card_payment' && suggestion.direction === 'received';
export const leavesAccount = (suggestion: { movement?: string | null; direction: string | null }) => suggestion.movement === 'transfer' && suggestion.direction === 'spent';

export function payoffMatch<T extends PayoffSide>(own: Omit<PayoffSide, 'id'>, candidates: T[]) {
  const distance = (other: PayoffSide) => Math.abs(other.occurredAt.getTime() - own.occurredAt.getTime());
  const near = candidates.filter((candidate) => candidate.accountId !== own.accountId).sort((a, b) => distance(a) - distance(b));
  return (
    near.find((candidate) => candidate.currency === own.currency && BigInt(candidate.amountMinor) === BigInt(own.amountMinor) && distance(candidate) <= payoffWindowMs) ??
    near.find((candidate) => candidate.currency !== own.currency && distance(candidate) <= matchWindowMs) ??
    null
  );
}

export function transferCounterpart(own: string | null, fromAccountId: string, toAccountId: string, message: Movement, candidates: Movement[]) {
  const ends = [
    ...(own === 'received' ? [] : [{ accountId: toAccountId, direction: 'received' }]),
    ...(own === 'spent' ? [] : [{ accountId: fromAccountId, direction: 'spent' }]),
  ];
  return (
    candidates.find(
      (candidate) =>
        ends.some((end) => end.accountId === candidate.accountId && end.direction === candidate.direction) && sameAmount(message, candidate) && withinWindow(message.occurredAt, candidate.occurredAt),
    )?.id ?? null
  );
}
