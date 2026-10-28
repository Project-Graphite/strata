import { amountOf, currencyOf, dateIn, MessageDirection, normalise, ReadMessage, readMessage, referenceIn, trimMerchant } from './bank-messages';
import { institutions } from './senders';
import { MovementKind } from './senders/template';

export const parserVersion = 1;

export type ParsedTransaction =
  | Extract<ReadMessage, { kind: 'ignored' }>
  | {
      kind: 'movement';
      direction: MessageDirection | null;
      movement: MovementKind | null;
      amount: number | null;
      currency: string | null;
      cardDigits: string | null;
      merchant: string | null;
      available: number | null;
      occurredOn: string | null;
      reference: string | null;
      institution: string | null;
      templateId: string | null;
      confidence: number;
    };

const movementHints: [MovementKind, RegExp][] = [
  ['card_payment', /credit card (?:bill )?payment|payment (?:has been |was )?received for your credit card|سداد (?:مستحقات )?بطاقة الائتمان|لبطاقة الائتمان/i],
  ['atm', /\batm\b|cash withdrawal|سحب نقد|ماكينة الصراف|الصراف الآلي/i],
];

export function parseMessage(sender: string, raw: string, app?: string | null): ParsedTransaction {
  const text = normalise(raw);
  const known = institutions.filter(({ senderPatterns }) => senderPatterns.some((pattern) => pattern.test(sender) || (!!app && pattern.test(app))));
  for (const { institution, templates } of known) {
    for (const template of templates) {
      const groups = text.match(template.pattern)?.groups;
      if (!groups) continue;
      return {
        kind: 'movement',
        direction: template.direction,
        movement: template.kind,
        amount: amountOf(groups.amount!),
        currency: currencyOf(groups.currency ?? ''),
        cardDigits: groups.card ?? null,
        merchant: groups.merchant ? trimMerchant(groups.merchant) : null,
        available: groups.balance ? amountOf(groups.balance) : null,
        occurredOn: dateIn(groups.date ?? text),
        reference: groups.ref ?? referenceIn(text),
        institution,
        templateId: template.id,
        confidence: template.confidence,
      };
    }
  }
  const read = readMessage(raw);
  if (read.kind === 'ignored') return read;
  return {
    ...read,
    movement: movementHints.find(([, pattern]) => pattern.test(text))?.[0] ?? null,
    occurredOn: dateIn(text),
    reference: referenceIn(text),
    institution: known[0]?.institution ?? null,
    templateId: null,
    confidence: read.direction && read.currency ? 0.6 : 0.4,
  };
}
