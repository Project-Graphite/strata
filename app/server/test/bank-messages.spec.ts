import { describe, expect, it } from 'vitest';
import { chatAllowed, normalise, paymentLabelOf, readMessage } from '../src/spending/capture/bank-messages';

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
    [
      'InstaPay transfer sent in English',
      'You have transferred EGP 1,500.00 to ahmed@instapay from your account ****1234. Ref: 61234567890',
      { amount: 1500, currency: 'EGP', cardDigits: '1234', merchant: 'ahmed@instapay' },
    ],
    [
      'InstaPay transfer received in English',
      'You have received EGP 1,200.00 from OMAR HASSAN via InstaPay',
      { direction: 'received', amount: 1200, currency: 'EGP', merchant: 'OMAR HASSAN' },
    ],
    [
      'InstaPay P2P sent-you notification',
      'MOHAMED ALI sent you EGP 600.00 via InstaPay',
      { direction: 'received', amount: 600, currency: 'EGP', merchant: 'MOHAMED ALI' },
    ],
    [
      'InstaPay transfer sent in Arabic',
      'تم تحويل مبلغ 1,200.00 ج.م إلى محمد أحمد بنجاح عبر انستاباي',
      { amount: 1200, currency: 'EGP', merchant: 'محمد أحمد' },
    ],
    [
      'InstaPay transfer received in Arabic',
      'وصلك 850.00 ج.م من خالد علي عبر انستاباي',
      { direction: 'received', amount: 850, currency: 'EGP', merchant: 'خالد علي' },
    ],
    [
      'nSave card purchase',
      "nSave: You spent £12.50 at Sainsbury's with card ending 4412",
      { amount: 12.5, currency: 'GBP', cardDigits: '4412', merchant: "Sainsbury's" },
    ],
    [
      'nSave outbound transfer',
      'Outbound transfer of $200.00 to Ahmed Hassan completed',
      { amount: 200, currency: 'USD', merchant: 'Ahmed Hassan' },
    ],
    [
      'nSave inbound account deposit',
      'You received $1,000.00 from Remote Inc into your USD account. Available balance $2,450.00',
      { direction: 'received', amount: 1000, currency: 'USD', merchant: 'Remote Inc', available: 2450 },
    ],
    [
      'nSave account top-up',
      '£500.00 was added to your GBP account from Wise',
      { direction: 'received', amount: 500, currency: 'GBP', merchant: 'Wise' },
    ],
    [
      'nSave P2P incoming transfer',
      'Ahmed Hassan sent you £35.00',
      { direction: 'received', amount: 35, currency: 'GBP', merchant: 'Ahmed Hassan' },
    ],
    [
      'PayPal merchant payment',
      'You paid $19.99 USD to Spotify AB',
      { amount: 19.99, currency: 'USD', merchant: 'Spotify AB' },
    ],
    [
      'PayPal P2P money sent',
      'You sent €45.00 EUR to Marco Rossi',
      { amount: 45, currency: 'EUR', merchant: 'Marco Rossi' },
    ],
    [
      'PayPal P2P money received',
      'Alex Johnson sent you $120.00 USD',
      { direction: 'received', amount: 120, currency: 'USD', merchant: 'Alex Johnson' },
    ],
    [
      'PayPal pre-authorized payment',
      'PayPal: You authorized a payment of $14.99 USD to Apple.com/bill',
      { amount: 14.99, currency: 'USD', merchant: 'Apple.com/bill' },
    ],
    [
      'PayPal refund',
      'Refund from Steam Games for $29.99 USD to your PayPal balance',
      { direction: 'refund', amount: 29.99, currency: 'USD', merchant: 'Steam Games' },
    ],
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
    ['notice', 'AHMED ALI requested EGP 500.00 from you on InstaPay'],
    ['notice', 'لديك طلب دفع بقيمة 500 ج.م من أحمد علي عبر انستاباي'],
    ['notice', 'PayPal: Jane Doe requested $40.00 USD'],
    ['promotion', 'Enjoy 20% cashback on all purchases with your CIB card. Minimum purchase EGP 500'],
  ])('ignores a %s message', (reason, text) => {
    expect(readMessage(text)).toEqual({ kind: 'ignored', reason });
  });

  it('identifies digital transaction apps from sender, package name or message text', () => {
    expect(paymentLabelOf('InstaPay', 'You sent EGP 500 to ali@instapay')).toBe('InstaPay');
    expect(paymentLabelOf('Notification', 'تم تحويل 300 جم', 'com.egyptianbanks.instapay')).toBe('InstaPay');
    expect(paymentLabelOf('nSave', 'You spent £12.50 at Tesco')).toBe('nSave');
    expect(paymentLabelOf('Alert', 'Outbound transfer of $100', 'com.nsave.app')).toBe('nSave');
    expect(paymentLabelOf('PayPal', 'You paid $19.99 USD to Spotify AB')).toBe('PayPal');
    expect(paymentLabelOf('Alert', 'Alex sent you $20', 'com.paypal.android.p2pmobile')).toBe('PayPal');
    expect(paymentLabelOf('BanK-AlAhly', 'تم خصم 250 جم لدى CARREFOUR')).toBeNull();
  });

  it('filters SMS and app captures against allowed chats when configured', () => {
    expect(chatAllowed('BanK-AlAhly', undefined)).toBe(true);
    expect(chatAllowed('BanK-AlAhly', [])).toBe(true);
    expect(chatAllowed('BanK-AlAhly', ['BanK-AlAhly', 'CIB'])).toBe(true);
    expect(chatAllowed('Friend Chat', ['BanK-AlAhly', 'CIB'])).toBe(false);
    expect(chatAllowed('Notification', ['BanK-AlAhly', 'InstaPay'], 'com.egyptianbanks.instapay', 'Sent EGP 200')).toBe(true);
    expect(chatAllowed('PayPal', ['nSave', 'PayPal'], 'com.paypal.android.p2pmobile', 'You paid $10')).toBe(true);
  });
});
