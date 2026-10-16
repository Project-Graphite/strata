import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { integrationApp, password } from './harness';

describe('Bank messages from a phone against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  function withToken(token: string, method: string, path: string, body?: unknown) {
    return fetch(`${strata.base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).then(async (response) => ({ status: response.status, body: response.status === 204 ? null : await response.json() }));
  }

  it('records bank texts, asks about the unclear ones, pairs transfers and keeps balances', async () => {
    const owner = await member('texter');
    const viewer = await member('text-reader');
    const home = (await owner.call('POST', '/spaces', { name: 'Texts' })).body;
    await strata.join(home.id, viewer, SpaceRole.VIEWER);
    const bank = (await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'NBE', currency: 'EGP', cardDigits: ['1234'], senders: ['BanK-AlAhly'] })).body;
    const wallet = (await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'Vodafone Cash', kind: 'wallet', currency: 'EGP', senders: ['VF-Cash'] })).body;
    const token = (await owner.call('POST', '/me/tokens', { name: 'Phone', scopes: ['spending:capture'], password })).body.token;
    const send = (from: string, text: string) => withToken(token, 'POST', `/spaces/${home.id}/captures`, { from, text, sentStamp: 1791971990000, receivedStamp: 1791972000000, sim: 'sim1' });

    expect((await withToken(token, 'GET', `/spaces/${home.id}/spending?month=2026-10`)).status).toBe(403);
    expect((await send('BanK-AlAhly', 'رمز التحقق الخاص بك هو 4821 لا تشاركه مع أحد')).body).toEqual({ status: 'ignored', reason: 'code' });
    expect(await strata.prisma.capturedMessage.count({ where: { spaceId: home.id } })).toBe(0);

    const purchase = 'تم خصم 250.00جم من بطاقة الخصم المباشر رقم ****1234 لدى CARREFOUR MAADI في 14/10 13:45 المتاح 9,750.00جم';
    expect((await send('BanK-AlAhly', purchase)).body).toEqual({ status: 'review', expenseId: null });
    expect((await send('BanK-AlAhly', purchase)).body).toEqual({ status: 'review', expenseId: null });
    const stored = await strata.prisma.capturedMessage.findFirstOrThrow({ where: { spaceId: home.id } });
    expect(stored.textSealed).not.toContain('CARREFOUR');

    const [waiting] = (await viewer.call('GET', `/spaces/${home.id}/captures`)).body;
    expect(waiting).toMatchObject({
      sender: 'BanK-AlAhly',
      text: purchase,
      receivedAt: '2026-10-14T10:00:00.000Z',
      suggestion: { direction: 'spent', amountMinor: 25_000, currency: 'EGP', merchant: 'CARREFOUR MAADI', accountId: bank.id, availableMinor: 975_000 },
    });
    const draft = { title: 'Carrefour', amountMinor: 25_000, currency: 'EGP', spentOn: '2026-10-14', category: 'groceries', direction: 'spent', accountId: bank.id, merchant: 'CARREFOUR MAADI' };
    expect((await viewer.call('POST', `/captures/${waiting.id}/record`, draft)).status).toBe(403);
    expect((await withToken(token, 'POST', `/captures/${waiting.id}/record`, draft)).status).toBe(403);
    expect((await owner.call('POST', `/captures/${waiting.id}/record`, draft)).body).toMatchObject({ title: 'Carrefour', source: 'sms', category: 'groceries', accountId: bank.id });
    expect((await owner.call('POST', `/captures/${waiting.id}/record`, draft)).status).toBe(400);

    const again = await send('BanK-AlAhly', 'تم خصم 80.00جم من بطاقة الخصم المباشر رقم ****1234 لدى carrefour maadi في 15/10 09:10 المتاح 9,670.00جم');
    expect(again.body.status).toBe('recorded');
    expect((await owner.call('GET', `/expenses/${again.body.expenseId}`)).body).toMatchObject({ title: 'carrefour maadi', amountMinor: 8000, category: 'groceries', spentOn: '2026-10-14', accountId: bank.id });

    const topUp = await send('VF-Cash', 'تم استلام مبلغ 500 جنيه من رقم 01012345678 ورصيدك الحالي 650 جنيه');
    expect(topUp.body.status).toBe('recorded');
    const sent = await send('BanK-AlAhly', 'تم تنفيذ تحويل لحظي بمبلغ 500 جم من حسابك المنتهي ب ****1234 بتاريخ 14-10-2026 13:45');
    expect(sent.body.status).toBe('review');
    const transfer = (await owner.call('GET', `/spaces/${home.id}/captures`)).body.find((message: { text: string }) => message.text.includes('تحويل لحظي'));
    const paired = (await owner.call('POST', `/captures/${transfer.id}/record`, { ...draft, title: 'To wallet', amountMinor: 50_000, category: 'other', merchant: null })).body;
    expect(paired).toMatchObject({ id: topUp.body.expenseId, title: 'Transfer', direction: 'transfer', accountId: bank.id, toAccountId: wallet.id });

    const balances = Object.fromEntries((await owner.call('GET', `/spaces/${home.id}/accounts`)).body.map((account: { name: string; balanceMinor: number }) => [account.name, account.balanceMinor]));
    expect(balances).toEqual({ NBE: 967_000 - 50_000, 'Vodafone Cash': 65_000 });

    expect((await send('Unknown', 'Your card **9876 was used for USD 12.99 at NETFLIX.COM')).body.status).toBe('review');
    const unknown = (await owner.call('GET', `/spaces/${home.id}/captures`)).body.find((message: { sender: string }) => message.sender === 'Unknown');
    expect(unknown.suggestion).toMatchObject({ currency: 'USD', amountMinor: 1299, accountId: null });
    expect((await owner.call('POST', `/captures/${unknown.id}/ignore`)).status).toBe(204);
    expect((await owner.call('POST', `/captures/${unknown.id}/ignore`)).status).toBe(400);
    expect((await owner.call('GET', `/spaces/${home.id}/captures`)).body).toEqual([]);
  });

  it('renames, categorises and drops messages by merchant rules', async () => {
    const owner = await member('rule-maker');
    const home = (await owner.call('POST', '/spaces', { name: 'Rules' })).body;
    const send = (text: string) => owner.call('POST', `/spaces/${home.id}/captures`, { from: 'CIB', text });

    expect((await owner.call('POST', `/spaces/${home.id}/merchant-rules`, { match: 'uber', category: 'yachts' })).status).toBe(400);
    const uber = (await owner.call('POST', `/spaces/${home.id}/merchant-rules`, { match: 'uber', rename: 'Uber ride', category: 'transport' })).body;
    expect(uber).toMatchObject({ match: 'uber', rename: 'Uber ride', category: 'transport', ignore: false });
    expect((await owner.call('POST', `/spaces/${home.id}/merchant-rules`, { match: 'uber', rename: 'Uber trip', category: 'transport' })).body.id).toBe(uber.id);
    await owner.call('POST', `/spaces/${home.id}/merchant-rules`, { match: 'cashback store', ignore: true });

    const ride = await send('Your card **1234 was charged for EGP 85.00 at UBER *TRIP CAIRO on 14/10');
    expect(ride.body.status).toBe('recorded');
    expect((await owner.call('GET', `/expenses/${ride.body.expenseId}`)).body).toMatchObject({ title: 'Uber trip', category: 'transport', merchant: 'UBER *TRIP CAIRO' });
    expect((await send('Your card **1234 was charged for EGP 5.00 at CASHBACK STORE on 14/10')).body).toEqual({ status: 'ignored', reason: 'rule' });

    expect((await owner.call('GET', `/spaces/${home.id}/merchant-rules`)).body.map((rule: { match: string }) => rule.match)).toEqual(['cashback store', 'uber']);
    expect((await owner.call('DELETE', `/merchant-rules/${uber.id}`)).status).toBe(204);
    expect((await owner.call('DELETE', `/merchant-rules/${uber.id}`)).status).toBe(404);
  });

});
