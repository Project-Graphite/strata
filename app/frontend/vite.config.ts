import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import { routePages } from './src/route-pages.ts';

const compress = promisify(brotliCompress);
const uiModule = /node_modules[\\/](@mui|@emotion|@project-graphite[\\/]ui)[\\/]/;
const selectModule = /node_modules[\\/](@mui[\\/]material[\\/](Autocomplete|useAutocomplete|Popper)|@popperjs|@project-graphite[\\/]ui[\\/]dist[\\/]components[\\/](Select|SuggestField|GridListbox|TimePicker))[\\/.]/;

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

function brotliAssets(): Plugin {
  return {
    name: 'strata-brotli-assets',
    apply: 'build',
    async writeBundle({ dir }, bundle) {
      await Promise.all(
        Object.keys(bundle)
          .filter((name) => name.startsWith('assets/') && /\.(js|css)$/.test(name))
          .map(async (name) => {
            const source = await readFile(join(dir!, name));
            await writeFile(join(dir!, `${name}.br`), await compress(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: source.length } }));
          }),
      );
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
      };
      Object.values(bundle).forEach((output) => output.type === 'chunk' && output.isEntry && visit(output.fileName));
      const assets = Object.keys(bundle)
        .filter((name) => name.startsWith('assets/') && (name.endsWith('.css') || reachable.has(name)))
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

function routePreload(): Plugin {
  return {
    name: 'strata-route-preload',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = (name: string, skip: Set<string>, found = new Set<string>()) => {
        const output = bundle[name];
        if (found.has(name) || skip.has(name) || output?.type !== 'chunk') return found;
        found.add(name);
        output.imports.forEach((imported) => files(imported, skip, found));
        return found;
      };
      const chunks = Object.values(bundle).flatMap((output) => (output.type === 'chunk' ? [output] : []));
      const initial = chunks.filter((chunk) => chunk.isEntry).reduce((found, chunk) => files(chunk.fileName, new Set(), found), new Set<string>());
      const routes = routePages.flatMap(([pattern, page]) => {
        const chunk = chunks.find((candidate) => candidate.isDynamicEntry && candidate.facadeModuleId?.replaceAll('\\', '/').endsWith(`/src/${page}.tsx`));
        return chunk ? [[pattern, [...files(chunk.fileName, initial)].map((name) => `/${name}`)]] : [];
      });
      this.emitFile({
        type: 'asset',
        fileName: 'route-preload.js',
        source: `(() => {
  try {
    if (localStorage.getItem('strata-signed-in') !== '1') return;
  } catch {
    return;
  }
  const path = location.pathname.replace(/(.)\\/$/, '$1');
  const route = ${JSON.stringify(routes)}.find(([pattern]) => new RegExp(pattern).test(path));
  for (const href of route?.[1] ?? []) {
    const link = Object.assign(document.createElement('link'), { rel: 'preload', as: 'script', href, crossOrigin: '', fetchPriority: 'low' });
    document.head.append(link);
  }
})();
`,
      });
    },
    transformIndexHtml: () => [{ tag: 'script', attrs: { type: 'module', async: true, src: '/route-preload.js' }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker(), excalidrawFonts(), routePreload(), brotliAssets()],
  resolve: {
    alias: { '@excalidraw/mermaid-to-excalidraw': join(import.meta.dirname, 'src/stubs/mermaid-to-excalidraw.ts') },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
            { name: 'ui', test: uiModule, tags: ['$initial'] },
            { name: 'ui-more', test: (id) => uiModule.test(id) && !selectModule.test(id) },
            { name: 'ui-select', test: selectModule },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': { target: process.env.VITE_API_ORIGIN ?? 'http://localhost:3000', ws: true, xfwd: true },
    },
  },
});
