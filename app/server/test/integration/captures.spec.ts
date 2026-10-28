import { SpaceRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { MaintenanceScheduler } from '../../src/jobs/maintenance.scheduler';
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
      suggestion: { direction: 'spent', amountMinor: 25_000, currency: 'EGP', merchant: 'CARREFOUR MAADI', cardDigits: '1234', accountId: bank.id, availableMinor: 975_000 },
    });
    const draft = { title: 'Carrefour', amountMinor: 25_000, currency: 'EGP', spentOn: '2026-10-14', category: 'groceries', direction: 'spent', accountId: bank.id, merchant: 'CARREFOUR MAADI', cardDigits: '1234' };
    expect((await viewer.call('POST', `/captures/${waiting.id}/record`, draft)).status).toBe(403);
    expect((await withToken(token, 'POST', `/captures/${waiting.id}/record`, draft)).status).toBe(403);
    expect((await owner.call('POST', `/captures/${waiting.id}/record`, draft)).body).toMatchObject({ title: 'Carrefour', source: 'sms', category: 'groceries', accountId: bank.id, cardDigits: '1234' });
    expect((await owner.call('POST', `/captures/${waiting.id}/record`, draft)).status).toBe(400);

    const again = await send('BanK-AlAhly', 'تم خصم 80.00جم من بطاقة الخصم المباشر رقم ****1234 لدى carrefour maadi في 15/10 09:10 المتاح 9,670.00جم');
    expect(again.body.status).toBe('recorded');
    expect((await owner.call('GET', `/expenses/${again.body.expenseId}`)).body).toMatchObject({
      title: 'carrefour maadi',
      amountMinor: 8000,
      category: 'groceries',
      spentOn: '2026-10-14',
      occurredAt: '2026-10-14T10:00:00.000Z',
      kind: 'purchase',
      accountId: bank.id,
      cardDigits: '1234',
      cardId: expect.any(String),
    });
    const againCapture = await strata.prisma.capturedMessage.findFirstOrThrow({ where: { expenseId: again.body.expenseId } });
    expect(againCapture).toMatchObject({ parserVersion: 1, confidence: expect.any(Number) });
    expect((await strata.prisma.expense.findUniqueOrThrow({ where: { itemId: again.body.expenseId } })).captureId).toBe(againCapture.id);

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
    expect(unknown.suggestion).toMatchObject({ currency: 'USD', amountMinor: 1299, cardDigits: '9876', accountId: null });
    expect((await owner.call('POST', `/captures/${unknown.id}/ignore`)).status).toBe(204);
    expect((await owner.call('POST', `/captures/${unknown.id}/ignore`)).status).toBe(400);
    expect((await owner.call('GET', `/spaces/${home.id}/captures`)).body).toEqual([]);

    expect((await viewer.call('GET', `/spaces/${home.id}/cards`)).body).toEqual([{ digits: '1234', accountId: bank.id }]);
    expect((await withToken(token, 'GET', `/spaces/${home.id}/cards`)).status).toBe(403);
    expect((await owner.call('PATCH', `/expenses/${again.body.expenseId}`, { cardDigits: '5555', accountId: null })).body).toMatchObject({ cardDigits: '5555' });
    expect((await owner.call('PATCH', `/expenses/${again.body.expenseId}`, { cardDigits: '55' })).status).toBe(400);
    expect((await owner.call('GET', `/spaces/${home.id}/cards`)).body).toEqual([
      { digits: '5555', accountId: null },
      { digits: '1234', accountId: bank.id },
    ]);
  });

  it('renames, categorises and drops messages by merchant rules', async () => {
    const owner = await member('rule-maker');
    const home = (await owner.call('POST', '/spaces', { name: 'Rules' })).body;
    const send = (text: string) => owner.call('POST', `/spaces/${home.id}/captures`, { from: 'CIB', text });
    await owner.call('POST', `/spaces/${home.id}/merchant-rules`, { match: 'talabat', rename: 'Talabat', category: 'eating out' });
    expect((await send('Your card **1234 was charged for EGP 120.00 at TALABAT EG on 13/10')).body).toEqual({ status: 'review', expenseId: null });
    await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'CIB', currency: 'EGP', senders: ['CIB'] });

    expect((await owner.call('POST', `/spaces/${home.id}/merchant-rules`, { match: 'uber', category: 'yachts' })).status).toBe(400);
    const uber = (await owner.call('POST', `/spaces/${home.id}/merchant-rules`, { match: 'uber', rename: 'Uber ride', category: 'transport' })).body;
    expect(uber).toMatchObject({ match: 'uber', rename: 'Uber ride', category: 'transport', ignore: false });
    expect((await owner.call('POST', `/spaces/${home.id}/merchant-rules`, { match: 'uber', rename: 'Uber trip', category: 'transport' })).body.id).toBe(uber.id);
    await owner.call('POST', `/spaces/${home.id}/merchant-rules`, { match: 'cashback store', ignore: true });

    const ride = await send('Your card **1234 was charged for EGP 85.00 at UBER *TRIP CAIRO on 14/10');
    expect(ride.body.status).toBe('recorded');
    expect((await owner.call('GET', `/expenses/${ride.body.expenseId}`)).body).toMatchObject({ title: 'Uber trip', category: 'transport', merchant: 'UBER *TRIP CAIRO' });
    expect((await send('Your card **1234 was charged for EGP 5.00 at CASHBACK STORE on 14/10')).body).toEqual({ status: 'ignored', reason: 'rule' });

    expect((await owner.call('GET', `/spaces/${home.id}/merchant-rules`)).body.map((rule: { match: string }) => rule.match)).toEqual(['cashback store', 'talabat', 'uber']);
    expect(await strata.prisma.merchant.findUniqueOrThrow({ where: { id: uber.id }, select: { name: true, aliases: true, category: true } })).toEqual({ name: 'Uber trip', aliases: ['uber'], category: 'transport' });
    expect((await strata.prisma.expense.findUniqueOrThrow({ where: { itemId: ride.body.expenseId } })).merchantId).toBe(uber.id);
    expect((await owner.call('DELETE', `/merchant-rules/${uber.id}`)).status).toBe(204);
    expect((await owner.call('DELETE', `/merchant-rules/${uber.id}`)).status).toBe(404);
  });

  it('captures digital transactions from InstaPay, nSave and PayPal and filters SMS by specific chats', async () => {
    const owner = await member('digital-texter');
    const home = (await owner.call('POST', '/spaces', { name: 'Digital' })).body;
    const nbe = (await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'NBE', currency: 'EGP', cardDigits: ['1234'], senders: ['BanK-AlAhly', 'InstaPay'] })).body;
    const nsave = (await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'nSave', kind: 'wallet', currency: 'GBP', cardDigits: ['4412'], senders: ['nSave'] })).body;
    const paypal = (await owner.call('POST', `/spaces/${home.id}/accounts`, { name: 'PayPal', kind: 'wallet', currency: 'USD', senders: ['PayPal'] })).body;
    await owner.call('POST', `/spaces/${home.id}/merchant-rules`, { match: 'spotify ab', rename: 'Spotify', category: 'entertainment' });
    await owner.call('POST', `/spaces/${home.id}/merchant-rules`, { match: "sainsbury's", rename: 'Sainsburys', category: 'groceries' });

    const allowedChats = ['BanK-AlAhly', 'InstaPay', 'nSave', 'PayPal'];
    const ignoredChat = await owner.call('POST', `/spaces/${home.id}/captures`, {
      from: 'Mom',
      chat: 'Mom',
      text: 'I sent you EGP 500 for dinner',
      allowedChats,
    });
    expect(ignoredChat.body).toEqual({ status: 'ignored', reason: 'chat' });

    const instapayIn = await owner.call('POST', `/spaces/${home.id}/captures`, {
      from: 'InstaPay',
      app: 'com.egyptianbanks.instapay',
      text: 'MOHAMED ALI sent you EGP 600.00 via InstaPay',
      allowedChats,
    });
    expect(instapayIn.body.status).toBe('recorded');
    expect((await owner.call('GET', `/expenses/${instapayIn.body.expenseId}`)).body).toMatchObject({
      title: 'MOHAMED ALI',
      direction: 'received',
      amountMinor: 60_000,
      currency: 'EGP',
      accountId: nbe.id,
      paymentLabel: 'InstaPay',
    });

    const nsaveCard = await owner.call('POST', `/spaces/${home.id}/captures`, {
      from: 'nSave',
      app: 'com.nsave.app',
      text: "nSave: You spent £12.50 at Sainsbury's with card ending 4412",
      allowedChats,
    });
    expect(nsaveCard.body.status).toBe('recorded');
    expect((await owner.call('GET', `/expenses/${nsaveCard.body.expenseId}`)).body).toMatchObject({
      title: 'Sainsburys',
      direction: 'spent',
      amountMinor: 1250,
      currency: 'GBP',
      category: 'groceries',
      accountId: nsave.id,
      cardDigits: '4412',
      paymentLabel: 'nSave',
    });

    const paypalPayment = await owner.call('POST', `/spaces/${home.id}/captures`, {
      from: 'PayPal',
      app: 'com.paypal.android.p2pmobile',
      text: 'You paid $19.99 USD to Spotify AB',
      allowedChats,
    });
    expect(paypalPayment.body.status).toBe('recorded');
    expect((await owner.call('GET', `/expenses/${paypalPayment.body.expenseId}`)).body).toMatchObject({
      title: 'Spotify',
      direction: 'spent',
      amountMinor: 1999,
      currency: 'USD',
      category: 'entertainment',
      accountId: paypal.id,
      paymentLabel: 'PayPal',
    });

    await owner.call('POST', `/spaces/${home.id}/merchant-rules`, { match: 'ahmed@instapay', rename: 'Ahmed transfer', category: 'other' });
    const instapayOut = await owner.call('POST', `/spaces/${home.id}/captures`, {
      from: 'InstaPay',
      app: 'com.egyptianbanks.instapay',
      text: 'You have transferred EGP 450.00 to ahmed@instapay from your account ****1234',
      allowedChats,
    });
    expect(instapayOut.body.status).toBe('recorded');
    const duplicateBankSms = await owner.call('POST', `/spaces/${home.id}/captures`, {
      from: 'BanK-AlAhly',
      text: 'تم خصم 450.00 جم من حسابك ****1234 لدى ahmed@instapay المتاح 8,000.00 جم',
      allowedChats,
    });
    expect(duplicateBankSms.body).toEqual({ status: 'recorded', expenseId: instapayOut.body.expenseId });
  });

  it('forgets message text after 90 days but keeps the link to the recorded transaction', async () => {
    const owner = await member('text-keeper');
    const home = owner.personalSpaceId;
    await owner.call('POST', `/spaces/${home}/accounts`, { name: 'CIB', currency: 'EGP', senders: ['CIB'] });
    await owner.call('POST', `/spaces/${home}/merchant-rules`, { match: 'spinneys', rename: 'Spinneys', category: 'groceries' });
    const recorded = await owner.call('POST', `/spaces/${home}/captures`, { from: 'CIB', text: 'Your card **1234 was charged for EGP 300.00 at SPINNEYS on 14/10' });
    expect(recorded.body.status).toBe('recorded');
    expect((await owner.call('POST', `/spaces/${home}/captures`, { from: 'Unknown', text: 'Your card **9876 was used for USD 12.99 at NETFLIX.COM' })).body.status).toBe('review');
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    await strata.prisma.capturedMessage.updateMany({ where: { spaceId: home }, data: { createdAt: old } });

    const maintenance = strata.service(MaintenanceScheduler);
    await vi.waitFor(() => expect((maintenance as unknown as { running: boolean }).running).toBe(false), { timeout: 15_000 });
    await maintenance.run(new Date());

    expect(await strata.prisma.capturedMessage.findMany({ where: { spaceId: home }, select: { textSealed: true, expenseId: true, status: true } })).toEqual([
      { textSealed: null, expenseId: recorded.body.expenseId, status: 'recorded' },
    ]);
    expect((await owner.call('GET', `/spaces/${home}/captures`)).body).toEqual([]);
    expect((await owner.call('GET', `/expenses/${recorded.body.expenseId}`)).body.title).toBe('Spinneys');
  });

});
