import { amount, anyCurrency, arabicMerchant, balance, currency, Institution, phone, ref, shape } from './template';

const operation = String.raw`(?:.*?رقم العملية ${ref})?`;
const reference = String.raw`(?:.*?ref(?:erence)?:? ${ref})?`;
const arabicBalance = String.raw`(?:.*?رصيدك(?: الحالي)? ${balance} ${anyCurrency})?`;

export const aman: Institution = {
  institution: 'Aman',
  senderPatterns: [/\baman\b/i, /^أمان$/],
  templates: [
    {
      id: 'aman-bill-ar',
      pattern: shape(String.raw`تم سداد فاتورة (?<merchant>.+?) بمبلغ ${amount} ${currency}${operation}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'aman-installment-ar',
      pattern: shape(String.raw`تم سداد (?:القسط|قسط)(?: الشهري)? بمبلغ ${amount} ${currency}${operation}`),
      kind: 'installment',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'aman-recharge-ar',
      pattern: shape(String.raw`تم شحن ${amount} ${currency} (?:للرقم|لرقم) ${phone}${operation}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'aman-wallet-in-ar',
      pattern: shape(String.raw`تم (?:إضافة|اضافة) ${amount} ${currency} (?:إلى|الى) محفظة أمان من ${phone}${arabicBalance}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'aman-wallet-out-ar',
      pattern: shape(String.raw`تم تحويل ${amount} ${currency} من محفظة أمان (?:إلى|الى) ${phone}${arabicBalance}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'aman-pay-ar',
      pattern: shape(String.raw`تم دفع ${amount} ${currency} لدى ${arabicMerchant}${arabicBalance}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'aman-bill-en',
      pattern: shape(String.raw`payment of ${currency} ${amount} for (?<merchant>.+?) was successful${reference}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'aman-wallet-in-en',
      pattern: shape(String.raw`${currency} ${amount} has been added to your aman wallet from ${phone}(?:.*?balance:? ${anyCurrency} ${balance})?`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'aman-installment-en',
      pattern: shape(String.raw`instal?lment of ${currency} ${amount} for contract \d+ has been paid${reference}`),
      kind: 'installment',
      direction: 'spent',
      confidence: 0.9,
    },
  ],
};
