import { amount, anyCurrency, arabicMerchant, balance, card, currency, dated, Institution, merchant, on, shape } from './template';

const available = String.raw`(?:\. Avl\.? Bal\.?:? ${anyCurrency} ${balance})?`;
const arabicAvailable = String.raw`(?: الرصيد المتاح ${balance} ${anyCurrency})?`;

export const aaib: Institution = {
  institution: 'AAIB',
  senderPatterns: [/^aaib/i, /البنك العربي الأفريقي/],
  templates: [
    {
      id: 'aaib-atm',
      pattern: shape(String.raw`card ${card} was debited with ${currency} ${amount} for atm withdrawal at ${merchant}${on}${available}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'aaib-purchase',
      pattern: shape(String.raw`card ${card} was debited with ${currency} ${amount} at ${merchant}${on}${available}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'aaib-salary',
      pattern: shape(String.raw`account ${card} was credited with salary ${currency} ${amount}${on}${available}`),
      kind: 'salary',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'aaib-transfer-in',
      pattern: shape(String.raw`account ${card} was credited with ${currency} ${amount} from ${merchant}${on}${available}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'aaib-transfer-out',
      pattern: shape(String.raw`${currency} ${amount} was transferred from your account ${card} to ${merchant}${on}${available}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'aaib-card-payment',
      pattern: shape(String.raw`credit card ${card} payment of ${currency} ${amount} has been received${on}`),
      kind: 'card_payment',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'aaib-purchase-ar',
      pattern: shape(String.raw`تم خصم ${amount} ${currency} من بطاقتك ${card} لدى ${arabicMerchant}${dated}${arabicAvailable}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'aaib-transfer-in-ar',
      pattern: shape(String.raw`تم (?:إيداع|ايداع) ${amount} ${currency} في حسابك ${card} من ${arabicMerchant}${dated}${arabicAvailable}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'aaib-bill-ar',
      pattern: shape(String.raw`تم سداد فاتورة (?<merchant>.+?) بمبلغ ${amount} ${currency} من حسابك ${card}${dated}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
  ],
};
