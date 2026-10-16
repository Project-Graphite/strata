export type MessageDirection = 'spent' | 'received' | 'refund';

export type ReadMessage =
  | { kind: 'ignored'; reason: 'code' | 'declined' | 'notice' | 'promotion' }
  | {
      kind: 'movement';
      direction: MessageDirection | null;
      amount: number | null;
      currency: string | null;
      cardDigits: string | null;
      merchant: string | null;
      available: number | null;
    };

const currencyToken = String.raw`(EGP|USD|EUR|GBP|SAR|AED|KWD|QAR|L\.?E\.?|\$|€|£|ج\.م\.?|جم|جنيه(?:اً|ا|ات)?(?: مصري)?|دولار(?: أمريكي)?|يورو|ريال(?: سعودي)?|درهم(?: إماراتي)?)`;
const number = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const mention = new RegExp(String.raw`${currencyToken}\s?${number}|${number}\s?${currencyToken}`, 'gi');
const bareAmount = new RegExp(String.raw`(?:amount|amt|مبلغ|بمبلغ|بقيمة|قيمة)\s*(?:of\s*)?${number}`, 'i');
const startsWithCurrency = new RegExp(`^${currencyToken}`, 'i');

const currencyCodes: [RegExp, string][] = [
  [/^(egp|l\.?e\.?|ج\.م\.?|جم|جنيه)/i, 'EGP'],
  [/^(usd|\$|دولار)/i, 'USD'],
  [/^(eur|€|يورو)/i, 'EUR'],
  [/^(gbp|£)/i, 'GBP'],
  [/^(sar|ريال)/i, 'SAR'],
  [/^(aed|درهم)/i, 'AED'],
  [/^kwd/i, 'KWD'],
  [/^qar/i, 'QAR'],
];

const codeWords = /\b(otp|one[- ]time|verification|passcode|password|pin|code)\b|رمز|كود|كلمة (?:السر|المرور)|الرقم السري/i;
const codeNearby = /(?:\b(?:otp|code|passcode|pin)\b|رمز|كود)[^\d]{0,20}\d{4,8}(?!\d)|(?<!\d)\d{4,8}[^\d]{0,12}(?:is your|هو رمز|رمز)/i;
const declinedWords = /declined|rejected|unsuccessful|failed|insufficient|not completed|مرفوض|رفض|لم تتم|غير ناجح|فشل/i;
const noticeWords = /log ?in|logged|sign(?:ed)? in|تسجيل الدخول|\brequest\b|طلبك|طلب /i;
const promotionWords = /\boffer|discount|cashback|\bwin\b|\bwon\b|promo|valid (?:till|until)|%|٪|عرض|اربح|استمتع|استفد/i;
const strongWords =
  /debited|charged|deducted|credited|refund|was used|has been used|تم خصم|تم إضافة|تم اضافة|تم إيداع|تم ايداع|تم تحويل|تم استلام|تم سحب|تم شراء|تم سداد|تم دفع|استرداد/i;
const refundWords = /refund|revers|returned|استرداد|مرتجع|إرجاع|ارجاع|رد مبلغ/i;
const receivedWords =
  /credited|received|deposit|salary|incoming|added to|to your (?:account|card|wallet)|تم إضافة|تم اضافة|تم إيداع|تم ايداع|إيداع|ايداع|استلام|استلمت|وارد|راتب|إلى حسابك|الى حسابك|لحسابك|إلى محفظتك|الى محفظتك/i;
const spentWords = /debited|charged|deducted|purchase|paid|payment|spent|withdraw|was used|has been used|sent|transfer|recharge|خصم|شراء|سحب|دفع|سداد|تحويل|حولت|شحن/i;
const balanceBefore =
  /(?:available(?: balance| limit| credit(?: limit)?)?|avail\.?(?: bal\.?)?|(?:current |new |remaining )?balance(?: is)?|bal\.?|المتاح(?: هو)?|متاح|الرصيد(?: المتاح| الحالي)?|رصيدك(?: الحالي| المتاح)?|رصيد)\s*(?:is|:|=|هو|-)?\s*$/i;
const cardDigits = /(?:\*{2,}|x{2,}|#|ending(?: with| in)?|ends with|المنتهي(?:ة)? ب(?:ـ)?|المنتهية|رقم)\s*(\d{4})(?!\d)/i;
const merchantAfter = [
  /(?:لدى|لدي|عند)\s+(.+?)(?=\s+(?:في|بتاريخ|يوم|المتاح|الرصيد|رصيد|رقم|برقم|مرجع)\s|\s+\d{1,2}[/.-]\d|[،,;]|\.\s|\.$|$)/g,
  /\bat\s+(.+?)(?=\s+(?:on|at|from|to|dated|date|for|via|ref|avail|available|balance|with|using|card)\b|\s+\d{1,2}[/.-]\d|[,;]|\.\s|\.$|$)/gi,
  /(?:\bfrom|\bto|من|إلى|الى)\s+(.+?)(?=\s+(?:on|at|from|to|dated|date|for|via|ref|avail|available|balance|في|بتاريخ|يوم|المتاح|الرصيد|رصيد|رقم|برقم|مرجع|من|إلى|الى)(?:\s|$)|\s+\d{1,2}[/.-]\d|[،,;]|\.\s|\.$|$)/gi,
];
const notMerchant = /^(?:(?:your|the|a|an|account|card|wallet)\b|حساب|بطاق|محفظ|رقم|الحساب|البطاقة|المحفظة)/i;

export function normalise(text: string) {
  return text
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/\u066b/g, '.')
    .replace(/\u066c/g, ',')
    .replace(/[\u200e\u200f\u061c]/g, '')
    .replace(/(\d)(?=[A-Za-z\u0600-\u06ff$€£])/g, '$1 ')
    .replace(/([A-Za-z\u0600-\u06ff$€£])(?=\d)/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

const currencyOf = (token: string) => currencyCodes.find(([pattern]) => pattern.test(token))?.[1] ?? null;
const amountOf = (text: string) => Number(text.replace(/,/g, ''));

function merchantIn(text: string) {
  for (const pattern of merchantAfter) {
    for (const match of text.matchAll(pattern)) {
      const found = match[1]!.replace(/[\s.:*-]+$/, '').trim();
      if (/\p{L}/u.test(found) && !notMerchant.test(found) && !startsWithCurrency.test(found)) return found.slice(0, 120);
    }
  }
  return null;
}

export function readMessage(raw: string): ReadMessage {
  const text = normalise(raw);
  const strong = strongWords.test(text);
  if (codeNearby.test(text) || (!strong && codeWords.test(text))) return { kind: 'ignored', reason: 'code' };
  if (declinedWords.test(text)) return { kind: 'ignored', reason: 'declined' };
  if (!strong && noticeWords.test(text)) return { kind: 'ignored', reason: 'notice' };
  if (!strong && promotionWords.test(text)) return { kind: 'ignored', reason: 'promotion' };

  const mentions = [...text.matchAll(mention)].map((match) => ({
    balance: balanceBefore.test(text.slice(Math.max(0, match.index - 40), match.index)),
    currency: currencyOf(match[1] ?? match[4]!),
    amount: amountOf(match[2] ?? match[3]!),
  }));
  const moved = mentions.find((found) => !found.balance);
  const bare = moved ? null : text.match(bareAmount);
  const direction: MessageDirection | null = refundWords.test(text) ? 'refund' : receivedWords.test(text) ? 'received' : spentWords.test(text) ? 'spent' : null;
  if (!moved && !bare) return { kind: 'ignored', reason: 'notice' };

  return {
    kind: 'movement',
    direction,
    amount: moved ? moved.amount : bare ? amountOf(bare[1]!) : null,
    currency: moved?.currency ?? mentions[0]?.currency ?? null,
    cardDigits: text.match(cardDigits)?.[1] ?? null,
    merchant: merchantIn(text),
    available: mentions.find((found) => found.balance)?.amount ?? null,
  };
}
