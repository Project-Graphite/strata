import { anonymise } from './anonymise';
import { MessageDirection } from './bank-messages';
import { institutions } from './senders';

export interface ParsedFields {
  direction: MessageDirection | null;
  movement: string | null;
  amount: number | null;
  currency: string | null;
  cardDigits: string | null;
  merchant: string | null;
  available: number | null;
  occurredOn: string | null;
}

export interface CorrectedFields {
  direction: string;
  movement: string;
  amount: number;
  currency: string;
  cardDigits: string | null;
  category: string | null;
}

export interface StoredReport {
  sender: string;
  institution: string | null;
  text: string;
  parsed: ParsedFields;
  corrected: CorrectedFields;
}

export const institutionOf = (sender: string) => institutions.find(({ senderPatterns }) => senderPatterns.some((pattern) => pattern.test(sender)))?.institution ?? null;

export function reportOf(sender: string, text: string, parsed: ParsedFields, corrected: CorrectedFields, names: (string | null | undefined)[] = []): StoredReport {
  const hidden = anonymise(text, { amounts: [parsed.amount, parsed.available, corrected.amount], cardDigits: [parsed.cardDigits, corrected.cardDigits], names: [parsed.merchant, ...names] });
  return {
    sender: anonymise(sender).text,
    institution: institutionOf(sender),
    text: hidden.text,
    parsed: { ...parsed, amount: hidden.amount(parsed.amount), available: hidden.amount(parsed.available), cardDigits: hidden.card(parsed.cardDigits), merchant: hidden.name(parsed.merchant) },
    corrected: { ...corrected, amount: hidden.amount(corrected.amount) ?? 0, cardDigits: hidden.card(corrected.cardDigits) },
  };
}

export function fixturesOf(reports: StoredReport[]) {
  const groups = new Map<string, StoredReport[]>();
  for (const report of reports) groups.set(report.institution ?? 'Unknown', [...(groups.get(report.institution ?? 'Unknown') ?? []), report]);
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([institution, rows]) => ({
      source: 'reported: anonymised real messages from Report parsing',
      institution,
      messages: rows.map(({ sender, text, parsed, corrected }) => ({
        sender,
        text,
        expect: {
          direction: corrected.direction === 'transfer' ? parsed.direction : corrected.direction,
          amount: corrected.amount,
          currency: corrected.currency,
          cardDigits: corrected.cardDigits ?? parsed.cardDigits,
          merchant: parsed.merchant,
          available: parsed.available,
          movement: corrected.movement,
          occurredOn: parsed.occurredOn,
        },
      })),
    }));
}
