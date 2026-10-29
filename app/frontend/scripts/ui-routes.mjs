import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

export const base = process.env.SHOTS_URL ?? 'http://localhost:4102';
const [email, password] = ['SHOTS_EMAIL', 'SHOTS_PASSWORD'].map((name) => {
  if (!process.env[name]) throw new Error(`Set ${name}: a test account on ${base}`);
  return process.env[name];
});

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const parents = [];
const found = [{ path: '/', signedIn: true }];
for (const line of app.slice(app.indexOf('<Routes>'), app.indexOf('</Routes>')).split('\n').map((text) => text.trim())) {
  if (line === '</Route>') parents.pop();
  if (!line.startsWith('<Route ')) continue;
  const segment = line.match(/ path="([^"]*)"/)?.[1] ?? '';
  const signedIn = line.includes('<Protected />') || parents.some((parent) => parent.signedIn);
  if (!line.endsWith('/>')) {
    parents.push({ segment, signedIn });
    continue;
  }
  const path = `/${[...parents.map((parent) => parent.segment), segment].filter(Boolean).join('/')}`;
  if ((segment || / index /.test(line)) && !/[:*]/.test(path) && !line.includes('<Moved ')) found.push({ path, signedIn });
}

export const routes = found.sort((a, b) => Number(a.signedIn) - Number(b.signedIn));

export async function signIn(page) {
  await page.goto(`${base}/login`);
  const status = await page.evaluate(
    async (account) =>
      (
        await fetch('/api/v1/auth/login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(account),
        })
      ).status,
    { email, password },
  );
  if (status >= 300) throw new Error(`Signing in as ${email} answered ${status}`);
}

export async function open(page, url) {
  const pending = new Set();
  const finish = (request) => pending.delete(request);
  page.on('request', (request) => request.resourceType() !== 'eventsource' && pending.add(request));
  page.on('requestfinished', finish);
  page.on('requestfailed', finish);
  await page.goto(url);
  const deadline = Date.now() + 15_000;
  let quiet = 0;
  while (quiet < 5 && Date.now() < deadline) {
    await page.waitForTimeout(100);
    quiet = pending.size === 0 ? quiet + 1 : 0;
  }
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), undefined, { timeout: 10_000 }).catch(() => {});
}

export async function sweep(visit) {
  const only = process.argv.slice(2);
  const browser = await chromium.launch();
  try {
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ]) {
      const phone = width < 600;
      const context = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, colorScheme: 'dark' });
      let signedIn = false;
      for (const route of routes.filter((route) => only.length === 0 || only.includes(route.path))) {
        if (route.signedIn && !signedIn) {
          const page = await context.newPage();
          await signIn(page);
          await page.close();
          signedIn = true;
        }
        const page = await context.newPage();
        await visit(page, {
          url: `${base}${route.path}`,
          name: `${width}-${route.path.slice(1).replaceAll('/', '-') || 'home'}${route.signedIn ? '' : '-signed-out'}`,
        });
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
