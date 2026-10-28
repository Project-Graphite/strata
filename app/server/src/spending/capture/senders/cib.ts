import { amount, anyCurrency, arabicMerchant, balance, card, currency, dated, Institution, merchant, on, shape } from './template';

const ending = String.raw`(?:ending (?:with |in )?)?${card}`;
const available = String.raw`(?:\. Available (?:limit|balance):? ${anyCurrency} ${balance})?`;
const arabicAvailable = String.raw`(?: (?:الحد المتاح|الرصيد المتاح|المتاح) ${balance} ${anyCurrency})?`;

export const cib: Institution = {
  institution: 'CIB',
  senderPatterns: [/^cib/i, /\bcib\b/i],
  templates: [
    {
      id: 'cib-card-charged',
      pattern: shape(String.raw`card ${ending} was charged for ${currency} ${amount} at ${merchant}${on}${available}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'cib-atm',
      pattern: shape(String.raw`cash withdrawal of ${currency} ${amount} from your card ${ending} at ${merchant}${on}${available}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'cib-salary',
      pattern: shape(String.raw`account ${card} has been credited with salary of ${currency} ${amount}${on}${available}`),
      kind: 'salary',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'cib-transfer-in',
      pattern: shape(String.raw`account ${card} has been credited with ${currency} ${amount} (?:transfer )?from ${merchant}${on}${available}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'cib-card-payment',
      pattern: shape(String.raw`payment of ${currency} ${amount} has been received for your credit card ${ending}${on}${available}`),
      kind: 'card_payment',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'cib-refund',
      pattern: shape(String.raw`refund of ${currency} ${amount} to your card ${ending} from ${merchant}${on}`),
      kind: 'refund',
      direction: 'refund',
      confidence: 0.9,
    },
    {
      id: 'cib-bill',
      pattern: shape(String.raw`bill payment for (?<merchant>.+?) of ${currency} ${amount} (?:was|has been) debited from your account ${card}${on}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'cib-transfer-out-ar',
      pattern: shape(String.raw`تم تنفيذ تحويل(?: لحظي)? بمبلغ ${amount} ${currency} من حسابك (?:المنتهي ب ?)?${card}(?: (?:إلى|الى|لصالح) ${arabicMerchant})?${dated}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'cib-purchase-ar',
      pattern: shape(String.raw`تم خصم ${amount} ${currency} من بطاقتك(?: الائتمانية| الخصم المباشر)? (?:المنتهية ب ?)?${card} لدى ${arabicMerchant}${dated}${arabicAvailable}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'cib-deposit-ar',
      pattern: shape(String.raw`تم (?:إيداع|ايداع|إضافة|اضافة) ${amount} ${currency} (?:في|إلى|الى) حسابك (?:المنتهي ب ?)?${card}${dated}${arabicAvailable}`),
      kind: 'income',
      direction: 'received',
      confidence: 0.9,
    },
  ],
};
