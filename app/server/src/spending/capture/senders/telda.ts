import { amount, arabicMerchant, card, currency, Institution, merchant, on, shape } from './template';

const using = String.raw`(?: using (?:your )?card ending (?:in )?${card})?`;

export const telda: Institution = {
  institution: 'Telda',
  senderPatterns: [/telda/i, /تيلدا/],
  templates: [
    {
      id: 'telda-spent',
      pattern: shape(String.raw`you spent ${currency} ${amount} at ${merchant}${using}${on}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'telda-atm',
      pattern: shape(String.raw`you withdrew ${currency} ${amount} from ${merchant}${using}${on}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'telda-sent-you',
      pattern: shape(String.raw`(?:^|[:.!] )(?<merchant>[^:.!]+?) sent you ${currency} ${amount}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'telda-sent',
      pattern: shape(String.raw`you sent ${currency} ${amount} to ${merchant}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'telda-top-up',
      pattern: shape(String.raw`you topped up ${currency} ${amount} from your (?:bank )?card ending (?:in )?${card}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'telda-refund',
      pattern: shape(String.raw`refund of ${currency} ${amount} from ${merchant}`),
      kind: 'refund',
      direction: 'refund',
      confidence: 0.9,
    },
    {
      id: 'telda-spent-ar',
      pattern: shape(String.raw`دفعت ${amount} ${currency} (?:في|لدى) ${arabicMerchant}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'telda-received-ar',
      pattern: shape(String.raw`(?:وصلك|استلمت) ${amount} ${currency} من ${arabicMerchant}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
  ],
};
