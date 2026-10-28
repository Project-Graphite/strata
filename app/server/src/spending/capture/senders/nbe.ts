import { amount, anyCurrency, arabicMerchant, balance, card, currency, dated, Institution, merchant, on, ref, shape } from './template';

const from = String.raw`من (?:بطاقة|بطاقتك|حسابك|حساب)[^\d*]*?${card}`;
const available = String.raw`(?:\. Available balance:? ${anyCurrency} ${balance})?`;
const arabicAvailable = String.raw`(?: (?:الحد المتاح|الرصيد المتاح|المتاح) ${balance} ${anyCurrency})?`;

export const nbe: Institution = {
  institution: 'National Bank of Egypt',
  senderPatterns: [/^nbe/i, /ahly/i, /البنك الأهلي/],
  templates: [
    {
      id: 'nbe-purchase-ar',
      pattern: shape(String.raw`تم خصم ${amount} ${currency} ${from} لدى ${arabicMerchant}${dated}${arabicAvailable}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'nbe-fee-ar',
      pattern: shape(String.raw`تم خصم ${amount} ${currency} (?:قيمة )?(?:رسوم|مصاريف|عمولة)[^\d*]*? ${from}${dated}`),
      kind: 'fee',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'nbe-atm-ar',
      pattern: shape(String.raw`تم سحب ${amount} ${currency} ${from} (?:من|عبر) ماكينة (?:الصراف(?: الآلي)? )?${arabicMerchant}${dated}${arabicAvailable}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'nbe-transfer-in-ar',
      pattern: shape(String.raw`تم (?:إضافة|اضافة) تحويل(?: لحظي)? بمبلغ ${amount} ${currency} (?:إلى|الى) حسابك رقم ${card} من ${arabicMerchant}(?: برقم مرجعي ${ref})?`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'nbe-transfer-out-ar',
      pattern: shape(String.raw`تم تنفيذ تحويل(?: لحظي)? بمبلغ ${amount} ${currency} من حسابك (?:المنتهي ب ?|رقم )?${card}(?: (?:إلى|الى|لصالح) ${arabicMerchant})?${dated}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'nbe-salary-ar',
      pattern: shape(String.raw`تم (?:إيداع|ايداع) (?:راتب|الراتب|مرتب) بمبلغ ${amount} ${currency} (?:في|إلى|الى) حسابك رقم ${card}${dated}${arabicAvailable}`),
      kind: 'salary',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'nbe-card-payment-ar',
      pattern: shape(String.raw`تم استلام (?:سداد|دفعة) بمبلغ ${amount} ${currency} (?:لبطاقة|على بطاقة) الائتمان رقم ${card}${dated}${arabicAvailable}`),
      kind: 'card_payment',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'nbe-bill-ar',
      pattern: shape(String.raw`تم سداد فاتورة (?<merchant>.+?) بمبلغ ${amount} ${currency} ${from}${dated}`),
      kind: 'bill',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'nbe-purchase-en',
      pattern: shape(String.raw`card ${card} (?:was|has been) used for (?:a )?purchase of ${currency} ${amount} at ${merchant}${on}${available}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'nbe-transfer-out-en',
      pattern: shape(String.raw`${currency} ${amount} has been transferred from your account ${card} to ${merchant}${on}(?:\. Ref:? ${ref})?`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'nbe-credit-en',
      pattern: shape(String.raw`account ${card} has been credited with ${currency} ${amount}${on}${available}`),
      kind: 'income',
      direction: 'received',
      confidence: 0.85,
    },
  ],
};
