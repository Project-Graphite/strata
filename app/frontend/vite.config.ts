import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { cp, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

function excalidrawFonts(): Plugin {
  const fonts = join(dirname(createRequire(import.meta.url).resolve('@excalidraw/excalidraw')), 'fonts');
  return {
    name: 'strata-excalidraw-fonts',
    configureServer(server) {
      server.middlewares.use('/excalidraw/fonts', (request, response, next) => {
        const file = join(fonts, decodeURIComponent((request.url ?? '').split('?')[0]!));
        if (!file.startsWith(fonts + sep) || !existsSync(file)) return next();
        response.setHeader('Content-Type', 'font/woff2');
        createReadStream(file).pipe(response);
      });
    },
    async writeBundle({ dir }) {
      await cp(fonts, join(dir!, 'excalidraw', 'fonts'), { recursive: true });
    },
  };
}

function serviceWorker(): Plugin {
  return {
    name: 'strata-service-worker',
    apply: 'build',
    async generateBundle(_options, bundle) {
      const reachable = new Set<string>();
      const visit = (name: string) => {
        const output = bundle[name];
        if (reachable.has(name) || output?.type !== 'chunk') return;
        reachable.add(name);
        output.imports.forEach(visit);
        output.dynamicImports.filter((imported) => bundle[imported]?.type === 'chunk' && !bundle[imported].facadeModuleId?.includes('node_modules')).forEach(visit);
      };
      Object.values(bundle).forEach((output) => output.type === 'chunk' && output.isEntry && visit(output.fileName));
      const assets = Object.keys(bundle)
        .filter((name) => name.startsWith('assets/') && (bundle[name]!.type === 'asset' || reachable.has(name)))
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
  plugins: [react(), tailwindcss(), serviceWorker(), excalidrawFonts()],
  server: {
    proxy: {
      '/api': { target: process.env.VITE_API_ORIGIN ?? 'http://localhost:3000', ws: true },
    },
  },
});
