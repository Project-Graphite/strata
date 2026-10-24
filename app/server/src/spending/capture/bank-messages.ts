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
const paymentRequestWords =
  /\brequest(?:ed|s|ing)?\b.*?\b(?:from you|money|payment)\b|\b(?:payment|money|collect|transfer) request\b|\brequested\s+(?:EGP|USD|EUR|GBP|SAR|AED|KWD|QAR|L\.?E\.?|\$|€|£|\d)|طلب (?:دفع|تحصيل|تحويل|سداد|أموال|اموال)|يطلب منك/i;
const noticeWords = /log ?in|logged|sign(?:ed)? in|تسجيل الدخول|\brequest(?:ed|s|ing)?\b|طلبك|طلب /i;
const promotionWords = /\boffer|discount|cashback|\bwin\b|\bwon\b|promo|valid (?:till|until)|%|٪|عرض|اربح|استمتع|استفد/i;
const strongWords =
  /debited|charged|deducted|credited|refund|was used|has been used|sent you|paid you|transferred to you|you (?:sent|paid|transferred|received|spent)|authorized a payment|تم خصم|تم إضافة|تم اضافة|تم إيداع|تم ايداع|تم تحويل|تم استلام|تم سحب|تم شراء|تم سداد|تم دفع|وصلك|وصلتك|وصل لك|حول لك|استرداد/i;
const refundWords = /refund|revers|returned|استرداد|مرتجع|إرجاع|ارجاع|رد مبلغ/i;
const receivedWords =
  /credited|received|deposit|salary|incoming|added to|to your (?:[a-z]{3}\s+)?(?:account|card|wallet)|sent you|paid you|transferred to you|تم إضافة|تم اضافة|تم إيداع|تم ايداع|إيداع|ايداع|استلام|استلمت|وصلك|وصلتك|وصل لك|حول لك|أرسل لك|ارسل لك|وارد|راتب|إلى حسابك|الى حسابك|لحسابك|إلى محفظتك|الى محفظتك/i;
const spentWords = /debited|charged|deducted|purchase|paid|payment|spent|withdraw|was used|has been used|authorized|sent|transfer|recharge|خصم|شراء|سحب|دفع|سداد|تحويل|حولت|شحن/i;
const balanceBefore =
  /(?:available(?: balance| limit| credit(?: limit)?)?|avail\.?(?: bal\.?)?|(?:current |new |remaining )?balance(?: is)?|bal\.?|المتاح(?: هو)?|متاح|الرصيد(?: المتاح| الحالي)?|رصيدك(?: الحالي| المتاح)?|رصيد)\s*(?:is|:|=|هو|-)?\s*$/i;
const cardDigits = /(?:\*{2,}|x{2,}|#|ending(?: with| in)?|ends with|المنتهي(?:ة)? ب(?:ـ)?|المنتهية|رقم)\s*(\d{4})(?!\d)/i;
const merchantAfter = [
  /(?:لدى|لدي|عند)\s+(.+?)(?=\s+(?:في|بتاريخ|يوم|المتاح|الرصيد|رصيد|رقم|برقم|مرجع|بنجاح|عبر|عن طريق)\s|\s+(?:بنجاح|عبر|عن طريق)$|\s+\d{1,2}[/.-]\d|[،,;]|\.\s|\.$|$)/g,
  /\bat\s+(.+?)(?=\s+(?:on|at|from|to|into|in|dated|date|for|via|ref|avail|available|balance|with|using|card|completed|succeeded|successfully|was)\b|\s+\d{1,2}[/.-]\d|[,;]|\.\s|\.$|$)/gi,
  /(?:^(?:(?:paypal|instapay|nsave)\s*[:\-–—]\s*)?|[.!?]\s+)([A-Za-z\u0600-\u06ff][\p{L}\p{N}.'’&_-]*(?:\s+[\p{L}\p{N}.'’&_-]+){0,4})\s+(?:sent you|paid you|transferred to you|حول لك|أرسل لك|ارسل لك)\b/giu,
  /(?:\bfrom|\bto|من|إلى|الى)\s+(.+?)(?=\s+(?:on|at|from|to|into|in|dated|date|for|via|ref|avail|available|balance|with|using|card|completed|succeeded|successfully|was|في|بتاريخ|يوم|المتاح|الرصيد|رصيد|رقم|برقم|مرجع|من|إلى|الى|بنجاح|عبر|عن طريق|لحسابك)(?:\s|$)|\s+\d{1,2}[/.-]\d|[،,;]|\.\s|\.$|$)/gi,
];
const notMerchant = /^(?:(?:you|your|the|a|an|main|account|card|wallet)\b|أنت|انت|حساب|بطاق|محفظ|رقم|الحساب|البطاقة|المحفظة)/i;

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

export type DigitalPaymentApp = 'InstaPay' | 'nSave' | 'PayPal';

const digitalAppMatchers: [DigitalPaymentApp, RegExp][] = [
  ['InstaPay', /\b(?:instapay|ipn)\b|com\.egyptianbanks\.instapay|@instapay|انستاباي|إنستاباي/i],
  ['nSave', /\bnsave\b|com\.nsave|tech\.nsave/i],
  ['PayPal', /\bpaypal\b|com\.paypal/i],
];

export function paymentLabelOf(sender: string, text: string, app?: string | null): DigitalPaymentApp | null {
  const combined = `${app ?? ''} ${sender} ${normalise(text)}`;
  return digitalAppMatchers.find(([, pattern]) => pattern.test(combined))?.[0] ?? null;
}

const cleanSender = (value: string) => value.trim().toLowerCase().replace(/[\s\-_.]+/g, '');

export function chatAllowed(
  sender: string,
  allowedChats?: string[] | null,
  app?: string | null,
  text = '',
  chat?: string | null,
): boolean {
  const filters = (allowedChats ?? []).map(cleanSender).filter(Boolean);
  if (filters.length === 0) return true;
  const appLabel = paymentLabelOf(sender, text, app);
  const candidates = [sender, chat ?? '', app ?? '', appLabel ?? ''].map(cleanSender).filter(Boolean);
  return candidates.some((candidate) => filters.some((allowed) => candidate === allowed || candidate.includes(allowed) || allowed.includes(candidate)));
}

export function readMessage(raw: string): ReadMessage {
  const text = normalise(raw);
  const strong = strongWords.test(text);
  if (codeNearby.test(text) || (!strong && codeWords.test(text))) return { kind: 'ignored', reason: 'code' };
  if (declinedWords.test(text)) return { kind: 'ignored', reason: 'declined' };
  if (paymentRequestWords.test(text) || (!strong && noticeWords.test(text))) return { kind: 'ignored', reason: 'notice' };
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
