import { amount, anyCurrency, arabicMerchant, balance, card, currency, dated, Institution, merchant, on, ref, shape } from './template';

const adibCard = String.raw`your (?:adib )?(?:covered |debit |credit )?card ${card}`;
const available = String.raw`(?:\. Available balance:? ${anyCurrency} ${balance})?`;
const arabicAvailable = String.raw`(?: الرصيد المتاح ${balance} ${anyCurrency})?`;

export const adib: Institution = {
  institution: 'ADIB',
  senderPatterns: [/^adib/i, /مصرف أبوظبي الإسلامي/],
  templates: [
    {
      id: 'adib-purchase',
      pattern: shape(String.raw`purchase of ${currency} ${amount} on ${adibCard} at ${merchant}${on}${available}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'adib-atm',
      pattern: shape(String.raw`atm withdrawal of ${currency} ${amount} on ${adibCard} at ${merchant}${on}${available}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'adib-transfer-in',
      pattern: shape(String.raw`incoming transfer of ${currency} ${amount} to your account ${card} from ${merchant}${on}${available}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'adib-transfer-out',
      pattern: shape(String.raw`outgoing transfer of ${currency} ${amount} from your account ${card} to ${merchant}${on}(?:\. Ref:? ${ref})?`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'adib-salary',
      pattern: shape(String.raw`salary of ${currency} ${amount} (?:has been )?credited to your account ${card}${on}${available}`),
      kind: 'salary',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'adib-card-payment',
      pattern: shape(String.raw`payment of ${currency} ${amount} (?:has been )?received for ${adibCard}${on}`),
      kind: 'card_payment',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'adib-purchase-ar',
      pattern: shape(String.raw`تم خصم ${amount} ${currency} من بطاقتك (?:رقم )?${card} لدى ${arabicMerchant}${dated}${arabicAvailable}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'adib-bill-ar',
      pattern: shape(String.raw`تم سداد فاتورة (?<merchant>.+?) بمبلغ ${amount} ${currency} من حسابك (?:رقم )?${card}${dated}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'adib-transfer-in-ar',
      pattern: shape(String.raw`تم (?:إضافة|اضافة) ${amount} ${currency} (?:إلى|الى) حسابك (?:رقم )?${card} من ${arabicMerchant}${dated}${arabicAvailable}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
  ],
};
