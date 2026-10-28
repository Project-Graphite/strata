import { amount, anyCurrency, arabicMerchant, balance, card, currency, dated, Institution, merchant, on, shape } from './template';

const available = String.raw`(?:\. Avail(?:able)?\.? Bal(?:ance)?\.?:? ${anyCurrency} ${balance})?`;
const arabicAvailable = String.raw`(?: الرصيد المتاح ${balance} ${anyCurrency})?`;

export const banqueMisr: Institution = {
  institution: 'Banque Misr',
  senderPatterns: [/banque ?misr/i, /^b\.?m\.?$/i, /bmisr/i, /بنك مصر/],
  templates: [
    {
      id: 'bm-atm-en',
      pattern: shape(String.raw`${currency} ${amount} has been withdrawn from your (?:account|card) ${card} at ${merchant}${on}${available}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'bm-purchase-en',
      pattern: shape(String.raw`${currency} ${amount} has been deducted from your card ${card} for (?:pos |online )?purchase at ${merchant}${on}${available}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'bm-salary-en',
      pattern: shape(String.raw`salary of ${currency} ${amount} has been credited to your account ${card}${on}${available}`),
      kind: 'salary',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'bm-transfer-in-en',
      pattern: shape(String.raw`${currency} ${amount} has been credited to your account ${card} from ${merchant}${on}${available}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'bm-card-payment-en',
      pattern: shape(String.raw`payment of ${currency} ${amount} to your credit card ${card} has been received${on}(?:\. Available limit:? ${anyCurrency} ${balance})?`),
      kind: 'card_payment',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'bm-purchase-ar',
      pattern: shape(String.raw`تم خصم (?:مبلغ )?${amount} ${currency} من بطاقتك (?:رقم )?${card} (?:لصالح|لدى) ${arabicMerchant}${dated}${arabicAvailable}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'bm-atm-ar',
      pattern: shape(String.raw`تم سحب (?:مبلغ )?${amount} ${currency} (?:نقدا |نقداً )?من ماكينة ${arabicMerchant} بالبطاقة رقم ${card}${dated}${arabicAvailable}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'bm-transfer-out-ar',
      pattern: shape(String.raw`تم تحويل (?:مبلغ )?${amount} ${currency} من حسابك (?:رقم )?${card} (?:إلى|الى|لصالح) (?:حساب )?${arabicMerchant}${dated}${arabicAvailable}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'bm-deposit-ar',
      pattern: shape(String.raw`تم (?:إيداع|ايداع|إضافة|اضافة) (?:مبلغ )?${amount} ${currency} (?:بحسابك|في حسابك|إلى حسابك|الى حسابك|لحسابك) (?:رقم )?${card}${dated}${arabicAvailable}`),
      kind: 'income',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'bm-bill-ar',
      pattern: shape(String.raw`تم سداد فاتورة (?<merchant>.+?) بمبلغ ${amount} ${currency} من حسابك (?:رقم )?${card}${dated}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
  ],
};
