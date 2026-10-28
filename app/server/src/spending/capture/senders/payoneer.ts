import { amount, anyCurrency, card, currency, Institution, merchant, on, shape } from './template';

const ending = String.raw`card ending (?:with |in )?${card}`;

export const payoneer: Institution = {
  institution: 'Payoneer',
  senderPatterns: [/payoneer/i],
  templates: [
    {
      id: 'payoneer-payment-received',
      pattern: shape(String.raw`you have received a payment of ${currency} ${amount} from ${merchant}`),
      kind: 'income',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'payoneer-paid-you',
      pattern: shape(String.raw`(?:^|[:.!] )(?<merchant>[^:.!]+?) has paid you ${currency} ${amount}`),
      kind: 'income',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'payoneer-balance-received',
      pattern: shape(String.raw`${currency} ${amount} has been received in your ${anyCurrency} balance from ${merchant}`),
      kind: 'income',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'payoneer-received',
      pattern: shape(String.raw`you have received ${currency} ${amount} from ${merchant}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'payoneer-sent',
      pattern: shape(String.raw`you have sent ${currency} ${amount} to ${merchant}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'payoneer-withdrawal',
      pattern: shape(String.raw`withdrawal of ${currency} ${amount} to your bank account ending (?:in )?${card} has been processed`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'payoneer-card-purchase',
      pattern: shape(String.raw`${ending} was charged ${currency} ${amount} at ${merchant}${on}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'payoneer-atm',
      pattern: shape(String.raw`${ending} was used to withdraw ${currency} ${amount} at ${merchant}${on}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'payoneer-fee',
      pattern: shape(String.raw`fee of ${currency} ${amount} has been charged`),
      kind: 'fee',
      direction: 'spent',
      confidence: 0.9,
    },
  ],
};
