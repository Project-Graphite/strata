import { amount, anyCurrency, balance, card, currency, Institution, merchant, on, shape } from './template';

const ending = String.raw`ending (?:with |in )?${card}`;
const balanceAfter = String.raw`(?:.*?balance is ${anyCurrency} ${balance})?`;

export const nsave: Institution = {
  institution: 'nSave',
  senderPatterns: [/nsave/i],
  templates: [
    {
      id: 'nsave-card-purchase',
      pattern: shape(String.raw`card ${ending} was charged ${currency} ${amount} at ${merchant}${on}${balanceAfter}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'nsave-atm',
      pattern: shape(String.raw`card ${ending} was used to withdraw ${currency} ${amount} at ${merchant}${on}${balanceAfter}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'nsave-received',
      pattern: shape(String.raw`you received ${currency} ${amount} from ${merchant}${on}${balanceAfter}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'nsave-sent',
      pattern: shape(String.raw`you sent ${currency} ${amount} to ${merchant}${on}${balanceAfter}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'nsave-withdrawal',
      pattern: shape(String.raw`withdrawal of ${currency} ${amount} to your bank account ${ending} is complete`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'nsave-deposit',
      pattern: shape(String.raw`deposit of ${currency} ${amount} has arrived${balanceAfter}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'nsave-refund',
      pattern: shape(String.raw`refund of ${currency} ${amount} from ${merchant} to your card ${ending}`),
      kind: 'refund',
      direction: 'refund',
      confidence: 0.9,
    },
    {
      id: 'nsave-fee',
      pattern: shape(String.raw`fee of ${currency} ${amount} was charged to your account`),
      kind: 'fee',
      direction: 'spent',
      confidence: 0.9,
    },
  ],
};
