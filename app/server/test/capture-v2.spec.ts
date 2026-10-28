import { describe, expect, it } from 'vitest';
import { anonymise } from '../src/spending/capture/anonymise';
import { accountFor, AccountRule, autoRecordable, ignoredSender, Movement, pairFor, sameMovement, transferCounterpart } from '../src/spending/capture/matching';
import { fixturesOf, reportOf } from '../src/spending/capture/parser-reports';
import { parseMessage } from '../src/spending/capture/sms-parser';

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 14, 10, minutes));
const movement = (overrides: Partial<Movement>): Movement => ({
  id: 'expense',
  senders: ['CIB'],
  reference: null,
  accountId: 'cib',
  amountMinor: 50_000n,
  currency: 'EGP',
  direction: 'spent',
  occurredAt: at(0),
  text: '',
  ...overrides,
});
const rule = (overrides: Partial<AccountRule>): AccountRule => ({ pattern: 'cib', accountId: null, toAccountId: null, ignore: false, card: null, ...overrides });

describe('Capture v2', () => {
  it('auto-records only at 0.85 confidence or more with a matched account', () => {
    const suggestion = { confidence: 0.85, accountId: 'cib', direction: 'spent', amountMinor: 1000, currency: 'EGP' };
    expect(autoRecordable(suggestion)).toBe(true);
    expect(autoRecordable({ ...suggestion, confidence: 0.84 })).toBe(false);
    expect(autoRecordable({ ...suggestion, confidence: 0.95, accountId: null })).toBe(false);
    expect(autoRecordable({ ...suggestion, amountMinor: null })).toBe(false);
    expect(autoRecordable({ ...suggestion, confidence: undefined })).toBe(false);
  });

  it('treats a shared reference as the same movement, otherwise the account, amount, currency, direction and ten minutes', () => {
    const recorded = movement({ senders: ['InstaPay'] });
    expect(sameMovement(movement({ reference: 'FT123', amountMinor: 1n }), movement({ senders: ['CIB'], reference: 'FT123' }))).toBe(true);
    expect(sameMovement(movement({ reference: 'FT123' }), movement({ senders: ['InstaPay'], reference: 'FT999' }))).toBe(false);
    expect(sameMovement(movement({ reference: 'FT123', direction: 'refund' }), movement({ reference: 'FT123' }))).toBe(false);
    expect(sameMovement(movement({ occurredAt: at(10) }), recorded)).toBe(true);
    expect(sameMovement(movement({ occurredAt: at(11) }), recorded)).toBe(false);
    expect(sameMovement(movement({}), movement({ senders: ['cib'] }))).toBe(false);
    expect(sameMovement(movement({ accountId: 'nbe' }), recorded)).toBe(false);
    expect(sameMovement(movement({ currency: 'USD' }), recorded)).toBe(false);
    expect(sameMovement(movement({ direction: 'received' }), recorded)).toBe(false);
    expect(sameMovement(movement({ reference: 'FT123' }), recorded)).toBe(true);
  });

  it('matches the account by card, then by learned sender rules, then by account senders', () => {
    const accounts = [
      { id: 'cib', name: 'CIB', senders: ['CIB'], cards: [{ last4: '1111' }] },
      { id: 'cib-credit', name: 'CIB credit', senders: [], cards: [] },
      { id: 'nbe', name: 'NBE', senders: ['NBE'], cards: [{ last4: '2222' }] },
    ];
    const rules = [rule({ accountId: 'cib-credit', card: { last4: '3333', accountId: 'cib-credit' } }), rule({ pattern: 'nbe', accountId: 'cib-credit' })];
    expect(accountFor(accounts, rules, 'NBE', '1111')?.id).toBe('cib');
    expect(accountFor(accounts, rules, 'CIB', '3333')?.id).toBe('cib-credit');
    expect(accountFor(accounts, rules, 'CIB', '4444')?.id).toBe('cib');
    expect(accountFor(accounts, rules, 'NBE', null)?.id).toBe('cib-credit');
    expect(accountFor(accounts, [], 'NBE', null)?.id).toBe('nbe');
    expect(accountFor(accounts, [rule({ pattern: 'nbe', accountId: 'cib', toAccountId: 'nbe' })], 'NBE', null)?.id).toBe('nbe');
    expect(ignoredSender([rule({ pattern: 'promo-bank', ignore: true })], ' Promo-Bank ')).toBe(true);
    expect(ignoredSender([rule({ pattern: 'promo-bank' })], 'Promo-Bank')).toBe(false);
  });

  it('pairs a transfer only with a counterparty hint or a confirmed account pair', () => {
    const wallet = movement({ id: 'wallet-in', senders: ['VF-Cash'], accountId: 'wallet', direction: 'received', occurredAt: at(3), text: 'received 500 from 01012345678' });
    const bankOut = movement({ accountId: 'bank', text: 'transfer of 500 from your account' });
    const handles = new Map<string, string | null>([['wallet', '01099999999'], ['bank', null]]);
    expect(pairFor(bankOut, [wallet], handles, [])).toEqual({ expenseId: 'wallet-in', fromAccountId: 'bank', toAccountId: 'wallet', confirmed: false });
    expect(pairFor({ ...bankOut, reference: 'IPN77' }, [{ ...wallet, reference: 'IPN77' }], handles, [])?.confirmed).toBe(true);
    expect(pairFor({ ...bankOut, text: 'transferred 500 to 01099999999' }, [wallet], handles, [])?.confirmed).toBe(true);
    expect(pairFor(bankOut, [wallet], handles, [rule({ accountId: 'bank', toAccountId: 'wallet' })])?.confirmed).toBe(true);
    expect(pairFor(bankOut, [wallet], handles, [rule({ accountId: 'wallet', toAccountId: 'bank' })])?.confirmed).toBe(false);
    expect(pairFor(bankOut, [{ ...wallet, occurredAt: at(11) }], handles, [])).toBeNull();
    expect(pairFor(bankOut, [{ ...wallet, accountId: 'bank' }], handles, [])).toBeNull();
    expect(pairFor(bankOut, [{ ...wallet, direction: 'spent' }], handles, [])).toBeNull();
    expect(pairFor(bankOut, [{ ...wallet, amountMinor: 49_999n }], handles, [])).toBeNull();
    expect(pairFor({ ...bankOut, direction: 'refund' }, [wallet], handles, [])).toBeNull();
    expect(pairFor({ ...wallet, id: undefined, occurredAt: at(0) }, [{ ...bankOut, id: 'bank-out' }], handles, [])).toMatchObject({ expenseId: 'bank-out', fromAccountId: 'bank', toAccountId: 'wallet' });
  });

  it('joins a confirmed transfer with the other end only', () => {
    const own = movement({ accountId: 'bank', direction: 'transfer' });
    const candidates = [movement({ id: 'bank-out', accountId: 'bank' }), movement({ id: 'wallet-in', accountId: 'wallet', direction: 'received' })];
    expect(transferCounterpart('spent', 'bank', 'wallet', own, candidates)).toBe('wallet-in');
    expect(transferCounterpart('received', 'bank', 'wallet', own, candidates)).toBe('bank-out');
    expect(transferCounterpart('spent', 'bank', 'card', own, candidates)).toBeNull();
    expect(transferCounterpart('spent', 'bank', 'wallet', { ...own, occurredAt: at(30) }, candidates)).toBeNull();
  });

  it('replaces amounts, card digits, names, handles, phone and account numbers but keeps dates', () => {
    expect(
      anonymise('تم خصم ١٬٢٥٠٫٥٠ جم من بطاقة ****4821 لدى CARREFOUR MAADI في 14/10/2026 13:45 المتاح 9,750.00 جم', { amounts: [1250.5, 9750], cardDigits: ['4821'], names: ['carrefour maadi'] }).text,
    ).toBe('تم خصم 1,000.00 جم من بطاقة ****1234 لدى SAMPLE A في 14/10/2026 13:45 المتاح 2,000.00 جم');
    expect(anonymise('MOHAMED ALI sent you EGP 600 via InstaPay. Call 01012345678 or +201112345678, account 123456789012, card ending 9876', { amounts: [600], names: ['MOHAMED ALI'] }).text).toBe(
      'SAMPLE A sent you EGP 100 via InstaPay. Call 01000000000 or 01000000000, account 000000000000, card ending 1234',
    );
    expect(anonymise('تم تحويل 450 جنيه إلى ahmed@instapay من محمد علي', { amounts: [450], names: ['محمد علي'] }).text).toBe('تم تحويل 100 جنيه إلى sample@instapay من مثال أ');
    const hidden = anonymise('EGP 25 and EGP 26', { amounts: [25, 26] });
    expect([hidden.text, hidden.amount(25), hidden.amount(26), hidden.amount(null), hidden.card('5555'), hidden.name(null)]).toEqual(['EGP 10 and EGP 20', 10, 20, null, '1234', null]);
  });

  it('stores reported messages without private values and exports them as parseable fixtures', () => {
    const text = 'Your credit card ending with 4821 was charged for EGP 1,250.50 at CARREFOUR MAADI on 14/10/26 13:45. Available limit EGP 48,749.50';
    const parsed = parseMessage('CIB', text);
    if (parsed.kind !== 'movement') throw new Error('expected a movement');
    const report = reportOf(
      'CIB',
      text,
      { direction: parsed.direction, movement: parsed.movement, amount: parsed.amount, currency: parsed.currency, cardDigits: parsed.cardDigits, merchant: parsed.merchant, available: parsed.available, occurredOn: parsed.occurredOn },
      { direction: 'spent', movement: 'purchase', amount: 1250.5, currency: 'EGP', cardDigits: '4821', category: 'groceries' },
      ['Carrefour'],
    );
    expect(JSON.stringify(report)).not.toMatch(/4821|1,250|1250|48,749|CARREFOUR|Carrefour/);
    const [fixture] = fixturesOf([report, { ...report, institution: null, sender: 'Unknown' }]);
    expect(fixture).toMatchObject({ institution: 'CIB', messages: [{ sender: 'CIB' }] });
    const [sample] = fixture!.messages;
    expect(sample!.expect).toEqual({ direction: 'spent', amount: 1000, currency: 'EGP', cardDigits: '1234', merchant: 'SAMPLE A', available: 10000, movement: 'purchase', occurredOn: '2026-10-14' });
    expect(parseMessage(sample!.sender, sample!.text)).toMatchObject(sample!.expect);
    expect(fixturesOf([{ ...report, institution: null }]).map((group) => group.institution)).toEqual(['Unknown']);
    expect(reportOf('+201012345678', 'You paid EGP 30', { ...report.parsed, amount: 30 }, { ...report.corrected, amount: 30 }).sender).toBe('01000000000');
  });
});
