import { amount, anyCurrency, arabicMerchant, balance, currency, Institution, shape } from './template';

const phone = String.raw`01\d ?[\dX]{8}`;
const holder = String.raw`(?: (?:المسجل باسم|باسم) ${arabicMerchant})?`;
const owner = String.raw`(?: \((?<merchant>[^)]+)\))?`;
const arabicBalance = String.raw`(?:.*?رصيدك(?: الحالي)?(?: هو)? ${balance} ${anyCurrency})?`;
const balanceAfter = String.raw`(?:.*?balance is ${balance} ${anyCurrency})?`;

export const vodafoneCash: Institution = {
  institution: 'Vodafone Cash',
  senderPatterns: [/^vf[ -]?cash/i, /vodafone ?cash/i, /^vodafone$/i, /فودافون كاش/],
  templates: [
    {
      id: 'vf-receive-ar',
      pattern: shape(String.raw`تم استلام (?:مبلغ )?${amount} ${currency} من (?:رقم )?${phone}${holder}${arabicBalance}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'vf-send-ar',
      pattern: shape(String.raw`تم تحويل (?:مبلغ )?${amount} ${currency} (?:لرقم|للرقم|إلى رقم|الى رقم|إلى|الى) ${phone}${holder}${arabicBalance}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'vf-pay-ar',
      pattern: shape(String.raw`تم (?:دفع|الدفع) (?:مبلغ )?${amount} ${currency} (?:لـ|لدى|لصالح|إلى|الى) ${arabicMerchant}${arabicBalance}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'vf-recharge-ar',
      pattern: shape(String.raw`تم شحن (?:رصيد |كارت )?(?:بمبلغ )?${amount} ${currency}${arabicBalance}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'vf-cash-out-ar',
      pattern: shape(String.raw`تم سحب (?:مبلغ )?${amount} ${currency} (?:نقدا |نقداً )?من (?:خلال )?ماكينة ${arabicMerchant}${arabicBalance}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'vf-recharge-en',
      pattern: shape(String.raw`recharged ${amount} ${currency}(?: for ${phone})?${balanceAfter}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'vf-receive-en',
      pattern: shape(String.raw`received ${amount} ${currency} from ${phone}${owner}${balanceAfter}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'vf-send-en',
      pattern: shape(String.raw`(?:transfer of|you have (?:transferred|sent)) ${amount} ${currency} to ${phone}${owner}${balanceAfter}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'vf-bill-en',
      pattern: shape(String.raw`paid ${amount} ${currency} for (?<merchant>.+?) bill${balanceAfter}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
  ],
};
