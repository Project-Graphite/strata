import { amount, anyCurrency, card, currency, Institution, merchant, shape } from './template';

const code = String.raw`(?: ${anyCurrency})?`;

export const paypal: Institution = {
  institution: 'PayPal',
  senderPatterns: [/paypal/i],
  templates: [
    {
      id: 'paypal-refund',
      pattern: shape(String.raw`you received a refund of ${currency} ${amount}${code} from ${merchant}`),
      kind: 'refund',
      direction: 'refund',
      confidence: 0.9,
    },
    {
      id: 'paypal-received',
      pattern: shape(String.raw`you received ${currency} ${amount}${code} from ${merchant}`),
      kind: 'income',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'paypal-sent-you',
      pattern: shape(String.raw`(?:^|[:.!] )(?<merchant>[^:.!]+?) sent you ${currency} ${amount}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'paypal-automatic-payment',
      pattern: shape(String.raw`you sent an automatic payment of ${currency} ${amount}${code} to ${merchant}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'paypal-payment',
      pattern: shape(String.raw`you (?:sent a payment of|paid) ${currency} ${amount}${code} to ${merchant}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'paypal-sent',
      pattern: shape(String.raw`you sent ${currency} ${amount}${code} to ${merchant}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'paypal-withdrawal',
      pattern: shape(String.raw`transfer of ${currency} ${amount}${code} to your bank account ending (?:in )?${card} is complete`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
  ],
};
