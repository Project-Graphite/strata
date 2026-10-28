import { amount, anyCurrency, balance, card, currency, Institution, merchant, on, ref, shape } from './template';

const ending = String.raw`ending (?:with |in )?${card}`;
const available = String.raw`(?:\. Available (?:credit|limit|balance):? ${anyCurrency} ${balance})?`;

export const hsbc: Institution = {
  institution: 'HSBC',
  senderPatterns: [/hsbc/i],
  templates: [
    {
      id: 'hsbc-purchase',
      pattern: shape(String.raw`a purchase of ${currency} ${amount} was made on your (?:credit |debit )?card ${ending} at ${merchant}${on}${available}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'hsbc-atm',
      pattern: shape(String.raw`cash withdrawal of ${currency} ${amount} from your (?:credit |debit )?card ${ending} at ${merchant}${on}${available}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'hsbc-salary',
      pattern: shape(String.raw`salary of ${currency} ${amount} has been credited to your account ${ending}${on}${available}`),
      kind: 'salary',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'hsbc-transfer-in',
      pattern: shape(String.raw`account ${ending} has been credited with ${currency} ${amount} from ${merchant}${on}${available}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'hsbc-transfer-out',
      pattern: shape(String.raw`${currency} ${amount} has been debited from your account ${ending} for a transfer to ${merchant}${on}(?:\. Ref:? ${ref})?`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'hsbc-card-payment',
      pattern: shape(String.raw`payment of ${currency} ${amount} to your credit card ${ending} has been received${on}${available}`),
      kind: 'card_payment',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'hsbc-refund',
      pattern: shape(String.raw`refund of ${currency} ${amount} from (?<merchant>.+?) has been credited to your (?:credit |debit )?card ${ending}${on}`),
      kind: 'refund',
      direction: 'refund',
      confidence: 0.9,
    },
    {
      id: 'hsbc-bill',
      pattern: shape(String.raw`bill payment of ${currency} ${amount} to (?<merchant>.+?) has been debited from your account ${ending}${on}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
  ],
};
