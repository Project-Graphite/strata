import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { open, sweep } from './ui-routes.mjs';

const shots = new URL('../shots/', import.meta.url);
mkdirSync(shots, { recursive: true });
const report = [];

await sweep(async (page, { url, name }) => {
  let requests = 0;
  const errors = [];
  page.on('request', (request) => new URL(request.url()).pathname.startsWith('/api/') && requests++);
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(String(error)));
  await open(page, url);
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, shots)), fullPage: true });
  const facts = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelectorAll('h1').length,
    height: document.documentElement.scrollHeight,
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    busy: document.querySelectorAll('[aria-busy="true"]').length,
  }));
  report.push({ name, ...facts, requests, errors });
});

writeFileSync(new URL('report.json', shots), JSON.stringify(report, null, 2));
console.table(report.map(({ errors, ...facts }) => ({ ...facts, errors: errors.length })));
console.log(`${report.length} full-page shots and report.json in ${fileURLToPath(shots)}`);
