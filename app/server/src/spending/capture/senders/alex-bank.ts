import { amount, anyCurrency, arabicMerchant, balance, card, currency, dated, Institution, merchant, on, ref, shape } from './template';

const available = String.raw`(?:\. Available:? ${anyCurrency} ${balance})?`;
const arabicAvailable = String.raw`(?: الرصيد المتاح ${balance} ${anyCurrency})?`;

export const alexBank: Institution = {
  institution: 'Alex Bank',
  senderPatterns: [/alex ?bank/i, /بنك الإسكندرية|بنك الاسكندرية/],
  templates: [
    {
      id: 'alex-purchase',
      pattern: shape(String.raw`card ${card} purchase ${currency} ${amount} at ${merchant}${on}${available}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'alex-atm',
      pattern: shape(String.raw`card ${card} atm withdrawal ${currency} ${amount} at ${merchant}${on}${available}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'alex-salary',
      pattern: shape(String.raw`account ${card} credited ${currency} ${amount} salary${on}${available}`),
      kind: 'salary',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'alex-transfer-in',
      pattern: shape(String.raw`account ${card} credited ${currency} ${amount} from ${merchant}${on}${available}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'alex-transfer-out',
      pattern: shape(String.raw`account ${card} debited ${currency} ${amount} transfer to ${merchant}${on}(?:\. Ref:? ${ref})?`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'alex-card-payment',
      pattern: shape(String.raw`credit card ${card} payment ${currency} ${amount} received${on}${available}`),
      kind: 'card_payment',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'alex-purchase-ar',
      pattern: shape(String.raw`تم خصم ${amount} ${currency} من بطاقتك (?:رقم )?${card} لدى ${arabicMerchant}${dated}${arabicAvailable}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'alex-bill-ar',
      pattern: shape(String.raw`تم سداد فاتورة (?<merchant>.+?) بمبلغ ${amount} ${currency} من حسابك (?:رقم )?${card}${dated}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
  ],
};
