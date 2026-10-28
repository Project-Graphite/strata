import { amount, anyCurrency, arabicMerchant, balance, currency, Institution, merchant, phone, shape } from './template';

const arabicBalance = String.raw`(?:.*?رصيد(?: محفظتك)?(?: الحالي)? ${balance} ${anyCurrency})?`;
const balanceAfter = String.raw`(?:.*?balance is ${anyCurrency} ${balance})?`;

export const etisalatCash: Institution = {
  institution: 'Etisalat Cash',
  senderPatterns: [/etisalat ?cash/i, /^e& ?(?:cash|money)/i, /اتصالات كاش/],
  templates: [
    {
      id: 'etisalat-receive-ar',
      pattern: shape(String.raw`تم استلام (?:مبلغ )?${amount} ${currency} من (?:رقم )?${phone}${arabicBalance}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'etisalat-send-ar',
      pattern: shape(String.raw`تم تحويل (?:مبلغ )?${amount} ${currency} (?:إلى|الى|لرقم|للرقم) ${phone}${arabicBalance}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'etisalat-pay-ar',
      pattern: shape(String.raw`تم دفع (?:مبلغ )?${amount} ${currency} (?:إلى|الى|لدى|لـ) ${arabicMerchant}${arabicBalance}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'etisalat-bill-ar',
      pattern: shape(String.raw`تم سداد فاتورة (?<merchant>.+?) بقيمة ${amount} ${currency}${arabicBalance}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'etisalat-recharge-ar',
      pattern: shape(String.raw`تم شحن (?:رصيد )?(?:بقيمة )?${amount} ${currency}${arabicBalance}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'etisalat-cash-out-ar',
      pattern: shape(String.raw`تم سحب (?:مبلغ )?${amount} ${currency} من ماكينة ${arabicMerchant}${arabicBalance}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'etisalat-receive-en',
      pattern: shape(String.raw`received ${currency} ${amount} from ${phone}${balanceAfter}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'etisalat-send-en',
      pattern: shape(String.raw`sent ${currency} ${amount} to ${phone}${balanceAfter}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'etisalat-pay-en',
      pattern: shape(String.raw`paid ${currency} ${amount} to ${merchant}${balanceAfter}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.9,
    },
  ],
};
