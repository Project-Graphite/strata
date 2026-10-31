import { amount, anyCurrency, arabicMerchant, balance, card, currency, dated, Institution, merchant, on, shape } from './template';

const ending = String.raw`(?:ending(?: with| in)? ?)?${card}`;
const available = String.raw`(?:\.? (?:card )?available (?:limit|balance)(?: is)?:? (?:${anyCurrency} )?${balance})?`;
const arabicEnding = String.raw`المنتهي(?:ة)? بـ? ?${card}`;
const arabicAvailable = String.raw`(?: ?[،,.]? ?(?:الحد المتاح|الرصيد المتاح|المتاح) (?:${anyCurrency} )?${balance}(?: ${anyCurrency})?)?`;
const reference = String.raw`(?: برقم مرجعي (?<ref>[A-Za-z0-9]+(?: [A-Za-z0-9]+)*))?`;
const arabicParty = String.raw`(?<merchant>.+?)(?= برقم| بتاريخ| في \d|$)`;

export const cib: Institution = {
  institution: 'CIB',
  senderPatterns: [/^cib/i, /\bcib\b/i],
  notices: [/تم تقسيط مبلغ/, /كشف حساب/, /تم استلام الطلب لرد مبلغ/, /شهادة الدهب/, /CIB Plus/i, /جاري طباعة بطاقة/],
  templates: [
    {
      id: 'cib-card-charged',
      pattern: shape(String.raw`card ${ending} was charged for ${currency} ${amount} at ${merchant}${on}${available}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'cib-card-reversed',
      pattern: shape(String.raw`transaction on your (?:credit |debit )?card ?${card} from (?<merchant>.+?) with ${currency} ${amount}${on} has been refunded`),
      kind: 'refund',
      direction: 'refund',
      confidence: 0.9,
    },
    {
      id: 'cib-account-debited',
      pattern: shape(String.raw`account ${ending} is debited with amount ${currency} ${amount}(?: DR)?(?: on \d{1,2} [a-z]{3} \d{4})? with transfer to another account`),
      kind: 'transfer',
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
      id: 'cib-card-payment-ar',
      pattern: shape(String.raw`تم سداد مبلغ ${amount} ${currency} (?:فى|في) بطاقتكم الائتمانية ${arabicEnding}${dated}`),
      kind: 'card_payment',
      direction: 'received',
      confidence: 0.95,
    },
    {
      id: 'cib-refund-ar',
      pattern: shape(String.raw`تم رد ${currency} ${amount} على بطاقتكم(?: الائتمانية)? ${arabicEnding} من (?<merchant>[^>]+?) ?>`),
      kind: 'refund',
      direction: 'refund',
      confidence: 0.9,
    },
    {
      id: 'cib-debit-card-reversed-ar',
      pattern: shape(String.raw`تم (?:اضافة|إضافة) المعاملة من (?<merchant>.+?) بقيمة ${amount} ${currency} (?:إلى|الى) بطاقتك ${arabicEnding}${arabicAvailable}`),
      kind: 'refund',
      direction: 'refund',
      confidence: 0.9,
    },
    {
      id: 'cib-transfer-out-ar',
      pattern: shape(String.raw`تم تنفيذ تحويل(?: لحظي)? بمبلغ ${amount} ${currency} من حسابك ${arabicEnding}(?: (?:إلى|الى|لصالح) ${arabicMerchant})?${reference}${dated}`),
      kind: 'transfer',
      direction: 'spent',
      confidence: 0.9,
    },
    {
      id: 'cib-transfer-in-ar',
      pattern: shape(String.raw`تم تنفيذ تحويل(?: لحظي)? بمبلغ ${amount} ${currency} (?:إلى|الى) حسابك ${arabicEnding} من ${arabicParty}${reference}${dated}`),
      kind: 'transfer',
      direction: 'received',
      confidence: 0.9,
    },
    {
      id: 'cib-account-purchase-ar',
      pattern: shape(String.raw`تم تنفيذ عملية شراء(?: لحظي)? من حسابك ${arabicEnding} بمبلغ ${amount} ${currency} من ${arabicParty}${reference}${dated}${arabicAvailable}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'cib-debit-card-ar',
      pattern: shape(String.raw`تم خصم مبلغ ${currency} ${amount} من بطاقة (?:الخصم المباشر|الائتمان) ${arabicEnding} عند ${arabicParty}${dated}${arabicAvailable}`),
      kind: 'purchase',
      direction: 'spent',
      confidence: 0.95,
    },
    {
      id: 'cib-atm-ar',
      pattern: shape(String.raw`تم سحب مبلغ ${currency} ${amount} من بطاقة الخصم المباشر ${arabicEnding} من ${arabicParty}${dated}${arabicAvailable}`),
      kind: 'atm',
      direction: 'spent',
      confidence: 0.95,
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
