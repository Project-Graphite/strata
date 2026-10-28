import { amount, anyCurrency, arabicMerchant, balance, card, currency, dated, Institution, merchant, on, ref, shape } from './template';

const ending = String.raw`ending (?:with |in )?${card}`;
const available = String.raw`(?:\. Available (?:limit|balance):? ${anyCurrency} ${balance})?`;
const arabicAvailable = String.raw`(?: (?:الحد المتاح|الرصيد المتاح) ${balance} ${anyCurrency})?`;

export const qnb: Institution = {
  institution: 'QNB Alahli',
  senderPatterns: [/^qnb/i, /كيو ?إن ?بي/],
  templates: [
    {
      id: 'qnb-purchase',
      pattern: shape(String.raw`card ${ending} was used for ${currency} ${amount} at ${merchant}${on}${available}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'qnb-atm',
      pattern: shape(String.raw`cash withdrawal of ${currency} ${amount} from your (?:qnb )?card ${ending} at ${merchant}${on}${available}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'qnb-salary',
      pattern: shape(String.raw`salary of ${currency} ${amount} has been credited to your account ${ending}${on}${available}`),
      kind: 'salary',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'qnb-transfer-in',
      pattern: shape(String.raw`account ${ending} has been credited with ${currency} ${amount} from ${merchant}${on}${available}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'qnb-transfer-out',
      pattern: shape(String.raw`${currency} ${amount} has been transferred from your account ${ending} to ${merchant}${on}(?:\. Ref:? ${ref})?`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'qnb-card-payment',
      pattern: shape(String.raw`received your credit card payment of ${currency} ${amount} for card ${ending}${on}`),
      kind: 'card_payment',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'qnb-bill',
      pattern: shape(String.raw`bill payment of ${currency} ${amount} for (?<merchant>.+?) has been debited from your account ${ending}${on}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'qnb-purchase-ar',
      pattern: shape(String.raw`تم خصم ${amount} ${currency} من بطاقتك (?:المنتهية ب ?)?${card} لدى ${arabicMerchant}${dated}${arabicAvailable}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'qnb-transfer-in-ar',
      pattern: shape(String.raw`تم (?:إيداع|ايداع) ${amount} ${currency} في حسابك (?:المنتهي ب ?)?${card} من ${arabicMerchant}${dated}${arabicAvailable}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
  ],
};
