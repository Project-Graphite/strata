import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const dist = new URL('../dist/', import.meta.url);
const initialBudget = 250 * 1024;
const chunkBudget = 150 * 1024;
const heavyEditors = [/^prod-/, /^chunk-EIO257PC-/, /^note-extensions-/];

const html = readFileSync(new URL('index.html', dist), 'utf8');
const initial = new Set([...html.matchAll(/<(?:script type="module"[^>]*\ssrc|link rel="modulepreload"[^>]*\shref)="\/assets\/([^"]+\.js)"/g)].map((match) => match[1]));
const chunks = readdirSync(new URL('assets/', dist))
  .filter((name) => name.endsWith('.js'))
  .map((name) => {
    const source = readFileSync(new URL(`assets/${name}`, dist));
    return { name, raw: source.length, gzip: gzipSync(source).length, initial: initial.has(name), heavy: heavyEditors.some((pattern) => pattern.test(name)) };
  })
  .sort((a, b) => b.gzip - a.gzip);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const initialChunks = chunks.filter((chunk) => chunk.initial);
const initialGzip = initialChunks.reduce((total, chunk) => total + chunk.gzip, 0);
const failures = [];

if (initialChunks.length !== initial.size) failures.push(`index.html references ${initial.size} scripts but only ${initialChunks.length} exist in dist/assets`);
if (initialGzip > initialBudget) failures.push(`Entry and preloaded JS is ${kb(initialGzip)} gzip, over the ${kb(initialBudget)} budget`);
for (const chunk of chunks) {
  if (!chunk.initial && !chunk.heavy && chunk.gzip > chunkBudget) failures.push(`${chunk.name} is ${kb(chunk.gzip)} gzip, over the ${kb(chunkBudget)} chunk budget`);
}

console.table(chunks.slice(0, 15).map((chunk) => ({ chunk: chunk.name, raw: kb(chunk.raw), gzip: kb(chunk.gzip), loaded: chunk.initial ? 'initial' : chunk.heavy ? 'lazy, allowlisted' : 'lazy' })));
console.log(`Entry and preloaded JS: ${initialChunks.length} files, ${kb(initialChunks.reduce((total, chunk) => total + chunk.raw, 0))} raw, ${kb(initialGzip)} gzip (budget ${kb(initialBudget)})`);
for (const pattern of heavyEditors) {
  const matched = chunks.filter((chunk) => pattern.test(chunk.name));
  console.log(`Allowlisted ${pattern}: ${matched.length ? matched.map((chunk) => `${chunk.name} ${kb(chunk.gzip)} gzip`).join(', ') : 'no matching chunk'}`);
}
for (const failure of failures) console.error(`FAIL ${failure}`);
process.exitCode = failures.length ? 1 : 0;
