import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { staticHostFiles } from './server.mjs';

// The hub whose API the network pages call: https://hub.dereth.network, unless DERETH_HUB_URL
// names another (a local hub, for testing). It is written into each page that calls it, and
// server.mjs reads the same variable to let those pages reach it.
const DEFAULT_HUB_URL = 'https://hub.dereth.network';

function hubUrl(value) {
  const url = new URL(value || DEFAULT_HUB_URL);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('DERETH_HUB_URL must be an http(s) URL without credentials');
  if (url.search || url.hash) throw new Error('DERETH_HUB_URL takes no query or fragment');
  return url.href.replace(/\/+$/, '');
}

const hub = hubUrl(process.env.DERETH_HUB_URL);
const page = (path) => fileURLToPath(new URL(path, import.meta.url));

// Each page's folder, as the dev server should answer for it without its slash: /join is the
// /join/ page, as Pages and server.mjs already treat it.
const PAGE_FOLDERS = new Set([
  '/network',
  '/worlds',
  '/operators',
  '/report',
  '/characters',
  '/link',
  '/join',
  '/directory',
  '/directory/character',
  '/directory/allegiance',
]);

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: page('./index.html'),
        network: page('./network/index.html'),
        worlds: page('./worlds/index.html'),
        operators: page('./operators/index.html'),
        report: page('./report/index.html'),
        characters: page('./characters/index.html'),
        link: page('./link/index.html'),
        join: page('./join/index.html'),
        directory: page('./directory/index.html'),
        'directory-character': page('./directory/character/index.html'),
        'directory-allegiance': page('./directory/allegiance/index.html'),
      },
    },
  },
  // DERETH_DEV_HOSTS: other names the dev server answers to (comma-separated), e.g. a tunnel's
  // dev.dereth.network.
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: (process.env.DERETH_DEV_HOSTS || '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean),
  },
  plugins: [
    {
      // In development, a page's address without its slash goes to the page. The browser keeps a
      // link's #... through the redirect, which a join link needs.
      name: 'dereth-page-folders',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const url = new URL(request.url ?? '/', 'http://x');
          if (!PAGE_FOLDERS.has(url.pathname)) return next();
          response.statusCode = 308;
          response.setHeader('Location', `${url.pathname}/${url.search}`);
          response.end();
        });
      },
    },
    {
      name: 'dereth-hub-url',
      transformIndexHtml: (html) => html.replaceAll('%DERETH_HUB_URL%', hub),
    },
    {
      // `_headers` and `_redirects` for a static host (Cloudflare Pages), from server.mjs's rules.
      name: 'dereth-static-host',
      generateBundle() {
        for (const [fileName, source] of Object.entries(staticHostFiles(hub)))
          this.emitFile({ type: 'asset', fileName, source });
      },
    },
  ],
});
