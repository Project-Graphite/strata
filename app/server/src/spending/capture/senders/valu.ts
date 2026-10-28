import { amount, currency, Institution, shape } from './template';

export const valu: Institution = {
  institution: 'valU',
  senderPatterns: [/\bvalu\b/i, /فاليو/],
  templates: [
    {
      id: 'valu-purchase',
      pattern: shape(String.raw`purchase of ${currency} ${amount} at (?<merchant>.+?) has been confirmed`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'valu-installment',
      pattern: shape(String.raw`instal?lment of ${currency} ${amount} has been paid`),
      kind: 'installment',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'valu-payment-received',
      pattern: shape(String.raw`received your payment of ${currency} ${amount}`),
      kind: 'installment',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'valu-refund',
      pattern: shape(String.raw`refund of ${currency} ${amount} from (?<merchant>.+?) has been processed`),
      kind: 'refund',
      direction: 'refund',
      confidence: 0.9,
    },
    {
      id: 'valu-purchase-ar',
      pattern: shape(String.raw`تم تأكيد عملية شراء بقيمة ${amount} ${currency} من (?<merchant>.+?) على \d+ (?:شهر|شهور|أشهر)`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'valu-installment-ar',
      pattern: shape(String.raw`تم سداد (?:القسط|قسط) بقيمة ${amount} ${currency}`),
      kind: 'installment',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'valu-payment-received-ar',
      pattern: shape(String.raw`تم استلام دفعتك بقيمة ${amount} ${currency}`),
      kind: 'installment',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'valu-refund-ar',
      pattern: shape(String.raw`تم استرداد ${amount} ${currency} من (?<merchant>.+?) (?:إلى|الى) حسابك`),
      kind: 'refund',
      direction: 'refund',
      confidence: 0.9,
    },
  ],
};
