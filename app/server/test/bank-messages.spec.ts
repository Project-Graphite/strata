import { describe, expect, it } from 'vitest';
import { normalise, readMessage, readQuickEntry } from '../src/spending/capture/bank-messages';

const movement = (fields: object) => ({ kind: 'movement', direction: 'spent', amount: null, currency: null, cardDigits: null, merchant: null, available: null, ...fields });

describe('Bank text messages', () => {
  it('turns Arabic-Indic digits and glued amounts into plain text', () => {
    expect(normalise('تم خصم ٢٥٠٫٥٠جم\u200f من ****١٢٣٤')).toBe('تم خصم 250.50 جم من ****1234');
    expect(normalise('EGP1,250.00 at  AMAZON')).toBe('EGP 1,250.00 at AMAZON');
  });

  it.each([
    [
      'NBE card purchase in Arabic',
      'تم خصم 250.00جم من بطاقة الخصم المباشر رقم ****1234 لدى CARREFOUR MAADI في 14/10 13:45 المتاح 9,750.00جم',
      { amount: 250, currency: 'EGP', cardDigits: '1234', merchant: 'CARREFOUR MAADI', available: 9750 },
    ],
    [
      'NBE instant transfer received',
      'تم إضافة تحويل لحظي بمبلغ 1500 جم إلى حسابك رقم ****5678 من AHMED MOHAMED برقم مرجعي 123456789',
      { direction: 'received', amount: 1500, currency: 'EGP', cardDigits: '5678', merchant: 'AHMED MOHAMED' },
    ],
    [
      'CIB credit card in English',
      'Your credit card ending with 1234 was charged for EGP 1,250.50 at AMAZON EG on 14/10/26 13:45. Available limit EGP 48,749.50',
      { amount: 1250.5, currency: 'EGP', cardDigits: '1234', merchant: 'AMAZON EG', available: 48749.5 },
    ],
    ['CIB instant transfer sent', 'تم تنفيذ تحويل لحظي بمبلغ 500 جم من حسابك المنتهي ب ****1234 بتاريخ 14-10-2026 13:45', { amount: 500, currency: 'EGP', cardDigits: '1234' }],
    ['CIB refund', 'Refund of EGP 349.00 to your card ending 1234 from Noon Egypt', { direction: 'refund', amount: 349, currency: 'EGP', cardDigits: '1234', merchant: 'Noon Egypt' }],
    ['Vodafone Cash money in', 'تم استلام مبلغ 200 جنيه من رقم 01012345678 ورصيدك الحالي 450 جنيه', { direction: 'received', amount: 200, currency: 'EGP', available: 450 }],
    ['Vodafone Cash recharge', 'You have successfully recharged 50 LE for 01012345678', { amount: 50, currency: 'EGP' }],
    [
      'Banque Misr cash withdrawal',
      'Dear Customer, EGP 2,000.00 has been withdrawn from your account ***4321 at ATM BM NASR CITY on 14/10/2026. Avail. Bal: EGP 5,300.00',
      { amount: 2000, currency: 'EGP', cardDigits: '4321', merchant: 'ATM BM NASR CITY', available: 5300 },
    ],
    ['a purchase with a safety footer', 'تم خصم 100 جم من بطاقتك ****1234 لدى UBER. لا تشارك رمز التحقق مع أحد', { amount: 100, currency: 'EGP', cardDigits: '1234', merchant: 'UBER' }],
    ['a dollar purchase', 'Your card **9876 was used for USD 12.99 at NETFLIX.COM', { amount: 12.99, currency: 'USD', cardDigits: '9876', merchant: 'NETFLIX.COM' }],
    ['an amount without a currency', 'تم خصم مبلغ 75.5 من بطاقتك', { amount: 75.5 }],
  ])('reads a %s', (_name, text, fields) => {
    expect(readMessage(text)).toEqual(movement(fields));
  });

  it.each([
    ['code', 'Your OTP for the purchase of EGP 500.00 at AMAZON is 482913. Do not share it.'],
    ['code', 'رمز التحقق الخاص بك هو 4821 لا تشاركه مع أحد'],
    ['code', 'Use 739102 as your one-time password'],
    ['declined', 'Your transaction of EGP 500 at ZARA was declined'],
    ['notice', 'You have logged in to CIB Mobile Banking on 14/10'],
    ['notice', 'رصيدك الحالي 1,200.00 جم'],
    ['notice', 'تم استلام طلب استرداد المبلغ وسيتم مراجعته'],
    ['promotion', 'Enjoy 20% cashback on all purchases with your CIB card. Minimum purchase EGP 500'],
  ])('ignores a %s message', (reason, text) => {
    expect(readMessage(text)).toEqual({ kind: 'ignored', reason });
  });

  it.each([
    ['120 talabat', { amount: 120, currency: null, title: 'talabat' }],
    ['coffee 45.5', { amount: 45.5, currency: null, title: 'coffee' }],
    ['٥٠ قهوة', { amount: 50, currency: null, title: 'قهوة' }],
    ['EGP 1,250 groceries at Seoudi', { amount: 1250, currency: 'EGP', title: 'groceries at Seoudi' }],
    ['300جم بنزين', { amount: 300, currency: 'EGP', title: 'بنزين' }],
    ['12.99 USD Netflix', { amount: 12.99, currency: 'USD', title: 'Netflix' }],
    ['75', { amount: 75, currency: null, title: null }],
  ])('reads the quick entry %s', (text, entry) => {
    expect(readQuickEntry(text)).toEqual(entry);
  });

  it('needs a number for a quick entry', () => {
    expect(readQuickEntry('lunch with Sara')).toBeNull();
  });
});
