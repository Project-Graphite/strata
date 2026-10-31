import { amountDigits, currencyWords, MessageDirection } from '../bank-messages';

export type MovementKind = 'purchase' | 'atm' | 'fee' | 'bill' | 'transfer' | 'card_payment' | 'installment' | 'salary' | 'refund' | 'income';

export interface Template {
  id: string;
  pattern: RegExp;
  kind: MovementKind;
  direction: MessageDirection;
  confidence: number;
}

export interface Institution {
  institution: string;
  senderPatterns: RegExp[];
  notices?: RegExp[];
  templates: Template[];
}

export const amount = `(?<amount>${amountDigits})`;
export const currency = `(?<currency>${currencyWords})`;
export const balance = `(?<balance>${amountDigits})`;
export const anyCurrency = `(?:${currencyWords})`;
export const card = String.raw`(?:[*#]+ ?|x+ ?)?(?<card>\d{4})(?!\d)`;
export const date = String.raw`(?<date>\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)`;
export const time = String.raw`(?<time>\d{1,2}:\d{2}(?::\d{2})?)`;
export const phone = String.raw`01\d ?[\dX]{8}`;
export const ref =String.raw`(?<ref>[A-Za-z0-9-]*\d[A-Za-z0-9-]*)`;
export const on = String.raw`(?: on ${date}(?: (?:at )?${time})?)?`;
export const dated = String.raw`(?: (?:بتاريخ|يوم|في) ${date}(?: ${time})?)?`;
export const merchant = String.raw`(?<merchant>.+?)(?= on \d| via | using | from your| to your|[,;]|\. |\.$|$)`;
export const arabicMerchant = String.raw`(?<merchant>.+?)(?= (?:بتاريخ|يوم|في) \d| المتاح| الحد المتاح| الرصيد| برقم| بنجاح| عبر| من حسابك| بالبطاقة| ببطاقة| ورصيدك| رصيدك|[،؛;,]|\. |\.$|$)`;
export const shape = (source: string) => new RegExp(source, 'i');
