import { amount, arabicMerchant, currency, Institution, merchant, phone, shape } from './template';

export const khazna: Institution = {
  institution: 'Khazna',
  senderPatterns: [/khazna/i, /خزنة/],
  templates: [
    {
      id: 'khazna-advance',
      pattern: shape(String.raw`salary advance of ${currency} ${amount} has been sent to your (?:wallet|account)`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'khazna-bill',
      pattern: shape(String.raw`you paid ${currency} ${amount} for (?<merchant>.+?) bill`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'khazna-purchase',
      pattern: shape(String.raw`you paid ${currency} ${amount} at ${merchant}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'khazna-settlement',
      pattern: shape(String.raw`${currency} ${amount} has been settled from your salary`),
      kind: 'installment',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'khazna-recharge',
      pattern: shape(String.raw`recharge of ${currency} ${amount} for ${phone} was successful`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'khazna-advance-ar',
      pattern: shape(String.raw`تم تحويل سلفة بمبلغ ${amount} ${currency} (?:إلى|الى) (?:محفظتك|حسابك)`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'khazna-bill-ar',
      pattern: shape(String.raw`تم سداد فاتورة (?<merchant>.+?) بمبلغ ${amount} ${currency}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'khazna-purchase-ar',
      pattern: shape(String.raw`تم دفع ${amount} ${currency} لدى ${arabicMerchant}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'khazna-settlement-ar',
      pattern: shape(String.raw`تم خصم ${amount} ${currency} من راتبك`),
      kind: 'installment',
      direction: 'spent',
      confidence: 0.9,
    },
  ],
};
