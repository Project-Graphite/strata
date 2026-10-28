import { describe, expect, it } from 'vitest';
import { normalise } from '../src/spending/capture/bank-messages';
import { parseMessage } from '../src/spending/capture/sms-parser';

describe('SMS parser', () => {
  it('keeps a transaction that carries an operation code', () => {
    expect(parseMessage('Bank', 'تم خصم 320.00 جم من بطاقتك ****1234 لدى SAMPLE STORE. كود العملية 83921')).toMatchObject({
      kind: 'movement',
      direction: 'spent',
      amount: 320,
      currency: 'EGP',
      merchant: 'SAMPLE STORE',
      reference: '83921',
    });
    expect(parseMessage('Fawry', 'تم سداد فاتورة كهرباء بمبلغ 420.00 جنيه بنجاح. كود العملية 83921')).toMatchObject({ kind: 'movement', templateId: 'fawry-bill-ar', reference: '83921' });
  });

  it('keeps a transaction that mentions a verified PIN and still drops a real OTP', () => {
    expect(parseMessage('Bank', 'Your card **1234 was charged for EGP 250.00 at SAMPLE STORE. PIN verified. Ref 123456')).toMatchObject({
      kind: 'movement',
      amount: 250,
      cardDigits: '1234',
      reference: '123456',
    });
    expect(parseMessage('Bank', 'Your OTP is 482913 to confirm EGP 500.00 to be debited from your card')).toEqual({ kind: 'ignored', reason: 'code' });
  });

  it('reads single-star and card-number formats', () => {
    expect(parseMessage('Bank', 'Purchase of EGP 75.00 with card *1234 at SAMPLE CAFE')).toMatchObject({ cardDigits: '1234', merchant: 'SAMPLE CAFE' });
    expect(parseMessage('Bank', 'EGP 75.00 was charged to card no. 5678 at SAMPLE CAFE')).toMatchObject({ cardDigits: '5678', amount: 75 });
  });

  it('reads merchants after the for-the-benefit-of connector', () => {
    expect(parseMessage('Bank', 'تم خصم 120.00 جم من حسابك لصالح SAMPLE FOOD')).toMatchObject({ amount: 120, merchant: 'SAMPLE FOOD' });
  });

  it('reads merchants after bill payment for', () => {
    expect(parseMessage('Bank', 'Bill payment for SAMPLE INTERNET of EGP 300.00 was debited from your account ****1234')).toMatchObject({ amount: 300, merchant: 'SAMPLE INTERNET' });
  });

  it('reads merchants in dash-separated POS messages', () => {
    expect(parseMessage('Bank', 'POS - SAMPLE MARKET - EGP 185.00 debited from card *1234')).toMatchObject({ amount: 185, merchant: 'SAMPLE MARKET', cardDigits: '1234' });
    expect(parseMessage('Bank', 'Purchase - EGP 185.00 - SAMPLE MARKET - card *1234')).toMatchObject({ amount: 185, merchant: 'SAMPLE MARKET' });
  });

  it('picks the moved amount over exchange rates and fees', () => {
    expect(parseMessage('Bank', 'Exchange rate 1 USD = 49.31 EGP applied. Your card ****1234 was charged for USD 12.99 at SAMPLE.COM')).toMatchObject({ amount: 12.99, currency: 'USD' });
    expect(parseMessage('Bank', 'Commission EGP 2.50 charged. EGP 500.00 has been transferred from your account ****1234 to SAMPLE NAME')).toMatchObject({ amount: 500, currency: 'EGP' });
  });

  it('does not turn a balance update into income', () => {
    expect(parseMessage('Bank', 'Your account balance is now EGP 5,000.00')).toEqual({ kind: 'ignored', reason: 'notice' });
    expect(parseMessage('Bank', 'EGP 500.00 was credited to your account ****1234. Balance is now EGP 5,000.00')).toMatchObject({ direction: 'received', amount: 500, available: 5000 });
  });

  it('tells credit-card payments and ATM withdrawals apart', () => {
    expect(parseMessage('CIB', 'Payment of EGP 5,000.00 has been received for your credit card ending with 1234 on 18/10/26')).toMatchObject({ movement: 'card_payment', templateId: 'cib-card-payment' });
    expect(parseMessage('CIB', 'Cash withdrawal of EGP 2,000.00 from your card ending with 1234 at CIB ATM SAMPLE on 16/10/26 18:20')).toMatchObject({ movement: 'atm', templateId: 'cib-atm' });
    expect(parseMessage('Bank', 'Cash withdrawal of EGP 500.00 from card ****1234 at ATM SAMPLE')).toMatchObject({ movement: 'atm', templateId: null });
    expect(parseMessage('Bank', 'Your credit card payment of EGP 3,000.00 was received')).toMatchObject({ movement: 'card_payment' });
  });

  it('reads the date written in the message', () => {
    expect(parseMessage('Bank', 'Your card **1234 was charged for EGP 85.00 at SAMPLE CAFE on 14/10/2026')).toMatchObject({ occurredOn: '2026-10-14' });
    expect(parseMessage('Bank', 'تم خصم 85.00 جم من بطاقتك ****1234 بتاريخ 2026-10-15')).toMatchObject({ occurredOn: '2026-10-15' });
    expect(parseMessage('Bank', 'Your card **1234 was charged for EGP 85.00 at SAMPLE CAFE on 14/10')).toMatchObject({ occurredOn: null });
    expect(parseMessage('Bank', 'Your card **1234 was charged for EGP 85.00 at SAMPLE CAFE on 31/02/2026')).toMatchObject({ occurredOn: null });
  });

  it('prefers sender templates and caps the fallback confidence', () => {
    expect(parseMessage('Notification', 'MOHAMED SAMPLE sent you EGP 600.00 via InstaPay', 'com.egyptianbanks.instapay')).toMatchObject({ institution: 'InstaPay', templateId: 'instapay-sent-you-en', confidence: 0.9 });
    const fallback = parseMessage('CIB', 'Your card **9876 was used for USD 12.99 at SAMPLE.COM');
    expect(fallback).toMatchObject({ institution: 'CIB', templateId: null, amount: 12.99 });
    expect(fallback.kind === 'movement' && fallback.confidence).toBeLessThanOrEqual(0.6);
  });

  it('strips bidi controls and reads Persian digits', () => {
    expect(normalise('‫تم خصم ۲۵۰ جم‬⁦')).toBe('تم خصم 250 جم');
  });
});
