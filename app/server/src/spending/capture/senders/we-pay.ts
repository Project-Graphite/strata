import { amount, anyCurrency, arabicMerchant, balance, currency, Institution, merchant, phone, shape } from './template';

const arabicBalance = String.raw`(?:.*?رصيدك(?: الحالي)? ${balance} ${anyCurrency})?`;
const balanceAfter = String.raw`(?:.*?balance is ${anyCurrency} ${balance})?`;

export const wePay: Institution = {
  institution: 'WE Pay',
  senderPatterns: [/^we ?pay/i, /وي ?باي/],
  templates: [
    {
      id: 'wepay-receive-ar',
      pattern: shape(String.raw`(?:وصلك|تم استلام) ${amount} ${currency} من (?:رقم )?${phone}${arabicBalance}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'wepay-send-ar',
      pattern: shape(String.raw`تم (?:إرسال|ارسال|تحويل) ${amount} ${currency} (?:إلى|الى) (?:رقم )?${phone}${arabicBalance}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'wepay-pay-ar',
      pattern: shape(String.raw`تم دفع ${amount} ${currency} (?:لـ|لدى|إلى|الى) ${arabicMerchant}${arabicBalance}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'wepay-bill-ar',
      pattern: shape(String.raw`تم سداد فاتورة (?<merchant>.+?) بمبلغ ${amount} ${currency}${arabicBalance}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'wepay-recharge-ar',
      pattern: shape(String.raw`تم شحن ${amount} ${currency} (?:للخط|للرقم) ${phone}${arabicBalance}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'wepay-cash-out-ar',
      pattern: shape(String.raw`تم سحب ${amount} ${currency} من ماكينة ${arabicMerchant}${arabicBalance}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'wepay-receive-en',
      pattern: shape(String.raw`you have received ${currency} ${amount} from ${phone}${balanceAfter}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'wepay-send-en',
      pattern: shape(String.raw`you have sent ${currency} ${amount} to ${phone}${balanceAfter}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'wepay-pay-en',
      pattern: shape(String.raw`you have paid ${currency} ${amount} to ${merchant}${balanceAfter}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.9,
    },
  ],
};
