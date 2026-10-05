import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { defineConfig, type Plugin } from 'vite';

function serviceWorker(): Plugin {
  return {
    name: 'strata-service-worker',
    apply: 'build',
    async generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((name) => name.startsWith('assets/'))
        .sort()
        .map((name) => `/${name}`);
      const template = await readFile(new URL('./service-worker.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace('__VERSION__', createHash('sha256').update(assets.join(' ')).digest('hex').slice(0, 12))
          .replace('__ASSETS__', JSON.stringify(assets)),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  server: {
    proxy: {
      '/api': { target: process.env.VITE_API_ORIGIN ?? 'http://localhost:3000', ws: true },
    },
  },
});
