import { amount, anyCurrency, arabicMerchant, balance, currency, Institution, merchant, phone, shape } from './template';

const number = String.raw`(?:الرقم |رقم )?${phone}`;
const arabicBalance = String.raw`(?:.*?رصيدك(?: الحالي)? ${balance} ${anyCurrency})?`;
const balanceAfter = String.raw`(?:.*?balance:? ${balance} ${anyCurrency})?`;

export const orangeCash: Institution = {
  institution: 'Orange Cash',
  senderPatterns: [/orange ?(?:cash|money)/i, /أورنج كاش|اورنج كاش|أورانج كاش|اورانج كاش/],
  templates: [
    {
      id: 'orange-receive-ar',
      pattern: shape(String.raw`تم (?:إضافة|اضافة) ${amount} ${currency} (?:لمحفظتك|إلى محفظتك|الى محفظتك) من ${number}${arabicBalance}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'orange-send-ar',
      pattern: shape(String.raw`تم تحويل ${amount} ${currency} من محفظتك (?:إلى|الى) ${number}${arabicBalance}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'orange-pay-ar',
      pattern: shape(String.raw`تم دفع ${amount} ${currency} (?:لدى|لـ|إلى|الى) ${arabicMerchant}${arabicBalance}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'orange-bill-ar',
      pattern: shape(String.raw`تم سداد فاتورة (?<merchant>.+?) بمبلغ ${amount} ${currency}${arabicBalance}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'orange-recharge-ar',
      pattern: shape(String.raw`تم شحن ${amount} ${currency} (?:للرقم|لرقم) ${phone}${arabicBalance}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'orange-cash-out-ar',
      pattern: shape(String.raw`تم سحب ${amount} ${currency} (?:نقدا |نقداً )?من ماكينة ${arabicMerchant}${arabicBalance}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'orange-receive-en',
      pattern: shape(String.raw`you received ${amount} ${currency} from ${phone}${balanceAfter}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'orange-send-en',
      pattern: shape(String.raw`you sent ${amount} ${currency} to ${phone}${balanceAfter}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'orange-pay-en',
      pattern: shape(String.raw`you paid ${amount} ${currency} to ${merchant}${balanceAfter}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.9,
    },
  ],
};
