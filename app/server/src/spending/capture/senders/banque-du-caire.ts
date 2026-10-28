import { amount, anyCurrency, arabicMerchant, balance, card, currency, dated, Institution, merchant, on, shape } from './template';

const byCard = String.raw`ببطاقتك (?:رقم )?${card}`;
const account = String.raw`حسابك (?:رقم )?${card}`;
const available = String.raw`(?:\. Available balance:? ${anyCurrency} ${balance})?`;
const arabicAvailable = String.raw`(?: الرصيد المتاح ${balance} ${anyCurrency})?`;

export const banqueDuCaire: Institution = {
  institution: 'Banque du Caire',
  senderPatterns: [/banque ?du ?caire/i, /^bdc$/i, /بنك القاهرة/],
  templates: [
    {
      id: 'bdc-purchase-ar',
      pattern: shape(String.raw`عملية شراء بمبلغ ${amount} ${currency} ${byCard} لدى ${arabicMerchant}${dated}${arabicAvailable}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'bdc-atm-ar',
      pattern: shape(String.raw`عملية سحب نقدي بمبلغ ${amount} ${currency} ${byCard} من ماكينة ${arabicMerchant}${dated}${arabicAvailable}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'bdc-transfer-in-ar',
      pattern: shape(String.raw`تم (?:إضافة|اضافة) حوالة بمبلغ ${amount} ${currency} (?:إلى|الى) ${account} من ${arabicMerchant}${dated}${arabicAvailable}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'bdc-transfer-out-ar',
      pattern: shape(String.raw`تم تحويل (?:مبلغ )?${amount} ${currency} من ${account} (?:إلى|الى|لصالح) ${arabicMerchant}${dated}${arabicAvailable}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'bdc-salary-ar',
      pattern: shape(String.raw`تم (?:إيداع|ايداع) (?:الراتب|راتب) بمبلغ ${amount} ${currency} في ${account}${dated}${arabicAvailable}`),
      kind: 'salary',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'bdc-bill-ar',
      pattern: shape(String.raw`تم سداد فاتورة (?<merchant>.+?) بمبلغ ${amount} ${currency} من ${account}${dated}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'bdc-purchase-en',
      pattern: shape(String.raw`purchase of ${currency} ${amount} with card ${card} at ${merchant}${on}${available}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'bdc-card-payment-en',
      pattern: shape(String.raw`payment of ${currency} ${amount} received for credit card ${card}${on}`),
      kind: 'card_payment',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'bdc-refund-en',
      pattern: shape(String.raw`refund of ${currency} ${amount} from (?<merchant>.+?) to card ${card}${on}`),
      kind: 'refund',
      direction: 'refund',
      confidence: 0.9,
    },
  ],
};
