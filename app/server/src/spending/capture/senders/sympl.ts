import { amount, arabicMerchant, currency, Institution, merchant, shape } from './template';

export const sympl: Institution = {
  institution: 'Sympl',
  senderPatterns: [/sympl/i, /سيمبل/],
  templates: [
    {
      id: 'sympl-order',
      pattern: shape(String.raw`order of ${currency} ${amount} at (?<merchant>.+?) is confirmed`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'sympl-installment',
      pattern: shape(String.raw`instal?lment \d+ of \d+ of ${currency} ${amount} for (?<merchant>.+?) has been paid`),
      kind: 'installment',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'sympl-payment-received',
      pattern: shape(String.raw`received your payment of ${currency} ${amount}(?: for ${merchant})?`),
      kind: 'installment',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'sympl-refund',
      pattern: shape(String.raw`refund of ${currency} ${amount} from (?<merchant>.+?) has been processed`),
      kind: 'refund',
      direction: 'refund',
      confidence: 0.9,
    },
    {
      id: 'sympl-order-ar',
      pattern: shape(String.raw`تم تأكيد طلبك بقيمة ${amount} ${currency} من (?<merchant>.+?) على \d+ أقساط`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'sympl-installment-ar',
      pattern: shape(String.raw`تم سداد (?:القسط|قسط)(?: \d+)? بقيمة ${amount} ${currency}(?: لطلب ${arabicMerchant})?`),
      kind: 'installment',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'sympl-payment-received-ar',
      pattern: shape(String.raw`تم استلام دفعتك بقيمة ${amount} ${currency}`),
      kind: 'installment',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'sympl-refund-ar',
      pattern: shape(String.raw`تم استرداد ${amount} ${currency} من ${arabicMerchant}`),
      kind: 'refund',
      direction: 'refund',
      confidence: 0.9,
    },
  ],
};
