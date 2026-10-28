import { amount, anyCurrency, balance, card, currency, Institution, merchant, on, ref, shape } from './template';

const enbdCard = String.raw`your (?:emirates nbd )?(?:credit |debit )?card ending (?:with |in )?${card}`;
const enbdAccount = String.raw`your (?:emirates nbd )?account ending (?:with |in )?${card}`;
const available = String.raw`(?:\. Available (?:limit|balance):? ${anyCurrency} ${balance})?`;

export const emiratesNbd: Institution = {
  institution: 'Emirates NBD',
  senderPatterns: [/emirates ?nbd/i, /^enbd/i, /الإمارات دبي الوطني/],
  templates: [
    {
      id: 'enbd-purchase',
      pattern: shape(String.raw`purchase of ${currency} ${amount} (?:made )?on ${enbdCard} at ${merchant}${on}${available}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'enbd-atm',
      pattern: shape(String.raw`cash withdrawal of ${currency} ${amount} (?:made )?on ${enbdCard} at ${merchant}${on}${available}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'enbd-salary',
      pattern: shape(String.raw`${enbdAccount} has been credited with salary of ${currency} ${amount}${on}${available}`),
      kind: 'salary',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'enbd-transfer-in',
      pattern: shape(String.raw`${enbdAccount} has been credited with ${currency} ${amount} from ${merchant}${on}${available}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'enbd-transfer-out',
      pattern: shape(String.raw`${enbdAccount} has been debited with ${currency} ${amount} for a transfer to ${merchant}${on}(?:\. Ref:? ${ref})?`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'enbd-card-payment',
      pattern: shape(String.raw`payment of ${currency} ${amount} has been received for ${enbdCard}${on}${available}`),
      kind: 'card_payment',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'enbd-refund',
      pattern: shape(String.raw`refund of ${currency} ${amount} from (?<merchant>.+?) has been credited to ${enbdCard}${on}`),
      kind: 'refund',
      direction: 'refund',
      confidence: 0.9,
    },
    {
      id: 'enbd-bill',
      pattern: shape(String.raw`bill payment of ${currency} ${amount} for (?<merchant>.+?) has been debited from ${enbdAccount}${on}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
  ],
};
