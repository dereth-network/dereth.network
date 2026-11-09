import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { artGuide } from './deploy/art-guide.mjs';
import { GAME_HOMES, gameHome, servedFrom, withOpenGraph } from './deploy/open-graph.mjs';
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
  '/dereth',
  '/auberean',
  '/network',
  '/art',
  '/art/sources',
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
        art: page('./art/index.html'),
        'art-sources': page('./art/sources/index.html'),
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
    // The art pack guide, rendered from Dereth's docs (deploy/art-guide.mjs).
    artGuide(),
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
      // What a shared link shows (deploy/open-graph.mjs): every page's Open Graph tags, and each
      // game's home page, /dereth/ and /auberean/, the home page with that game's.
      name: 'dereth-open-graph',
      enforce: 'post',
      transformIndexHtml: (html) => withOpenGraph(html),
      configureServer(server) {
        // A page the dev server serves names its preview pictures where it is served (a tunnel's
        // https://dev.dereth.network, say), so a link pasted from there shows them before the
        // pictures are deployed.
        server.middlewares.use((request, response, next) => {
          const host = request.headers['x-forwarded-host'] ?? request.headers.host;
          if (!host) return next();
          const scheme = String(request.headers['x-forwarded-proto'] ?? 'http').split(',')[0];
          const end = response.end.bind(response);
          response.end = (chunk, ...rest) => {
            if (chunk && String(response.getHeader('Content-Type') ?? '').includes('text/html')) {
              chunk = servedFrom(String(chunk), `${scheme}://${host}`);
              response.removeHeader('Content-Length');
            }
            return end(chunk, ...rest);
          };
          next();
        });
        server.middlewares.use(async (request, response, next) => {
          const game = new URL(request.url ?? '/', 'http://x').pathname.match(
            /^\/(dereth|auberean)\/$/,
          )?.[1];
          if (!game) return next();
          try {
            const home = await readFile(page('./index.html'), 'utf8');
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(gameHome(await server.transformIndexHtml('/', home), game));
          } catch (error) {
            next(error);
          }
        });
      },
      generateBundle(_, bundle) {
        const home = bundle['index.html'];
        if (home?.type !== 'asset') throw new Error('The build has no home page');
        for (const [game, { path }] of Object.entries(GAME_HOMES))
          this.emitFile({
            type: 'asset',
            fileName: path,
            source: gameHome(String(home.source), game),
          });
      },
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
