// The website's server: the built site in dist/, and /healthz for the deploy script. Node only, no
// dependencies.
import { createServer } from 'node:http';
import { realpathSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// The network pages call the hub's API from the browser. DERETH_HUB_URL names another hub (a
// local one, for testing); the build reads the same variable to write it into those pages.
const DEFAULT_HUB_URL = 'https://hub.dereth.network';

// No inline styles or scripts anywhere. The one address the pages may reach besides the site is
// the hub's origin.
export function contentSecurityPolicy(hubUrl = DEFAULT_HUB_URL) {
  const hub = new URL(hubUrl);
  if (!['http:', 'https:'].includes(hub.protocol) || hub.username || hub.password)
    throw new Error('The hub must be an http(s) URL without credentials');
  return `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${hub.origin}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;
}

// Pages that moved, by their old address (without its slash), to where they went. None has now:
// `/link/`, which the hub names in every link it gives a player in game, is a page of its own.
export const MOVED = {};

// The pages search engines are asked not to index: the character directory, whose players listed
// their characters for the network, not for the web. robots.txt keeps crawlers out of them too.
export const NOT_INDEXED = '/directory';

/** Whether a path is one of the pages search engines are asked not to index. */
export function notIndexed(path) {
  return path === NOT_INDEXED || path.startsWith(`${NOT_INDEXED}/`);
}

// The headers every answer carries.
export function securityHeaders(hubUrl = DEFAULT_HUB_URL) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': contentSecurityPolicy(hubUrl),
  };
}

// The same rules for a static host that reads `_headers` and `_redirects` (Cloudflare Pages):
// every answer's headers, Vite's hashed files cached for a year (anything else is checked on each
// visit, as the host does unless told otherwise), the directory's pages kept out of search
// engines, and the moved pages, with or without the slash.
export function staticHostFiles(hubUrl = DEFAULT_HUB_URL) {
  const headers = Object.entries(securityHeaders(hubUrl)).map(([k, v]) => `  ${k}: ${v}`);
  const redirects = Object.entries(MOVED).flatMap(([from, to]) => [
    `${from} ${to} 302`,
    `${from}/ ${to} 302`,
  ]);
  return {
    _headers: [
      '/*',
      ...headers,
      '/assets/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      NOT_INDEXED,
      '  X-Robots-Tag: noindex',
      `${NOT_INDEXED}/*`,
      '  X-Robots-Tag: noindex',
      '',
    ].join('\n'),
    _redirects: [...redirects, ''].join('\n'),
  };
}

export function createSite({
  root,
  releaseId,
  hubUrl = process.env.DERETH_HUB_URL || DEFAULT_HUB_URL,
}) {
  const webRoot = resolve(root);
  const headers = securityHeaders(hubUrl);
  const send = (response, status, type, body, cache = 'no-cache', extra = {}) => {
    response.writeHead(status, {
      ...headers,
      ...extra,
      'Content-Type': type,
      'Cache-Control': cache,
    });
    response.end(body);
  };
  const serve = async (request, response) => {
    let path;
    let search;
    try {
      const url = new URL(request.url ?? '/', 'http://x');
      path = decodeURIComponent(url.pathname);
      search = url.search;
    } catch {
      return send(response, 400, TYPES['.txt'], 'Bad request');
    }
    if (path === '/healthz')
      return send(
        response,
        200,
        TYPES['.json'],
        JSON.stringify({ status: 'ok', release: releaseId }),
        'no-store',
      );
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return send(response, 405, TYPES['.txt'], 'Method not allowed');
    // A page that moved, kept for the addresses already out there.
    const moved = MOVED[path.replace(/\/$/, '')];
    if (moved) {
      response.writeHead(302, {
        ...headers,
        Location: moved + search,
        'Cache-Control': 'no-cache',
      });
      return response.end();
    }
    // A file under dist/, never outside it. A page is its folder's index.html, so /worlds/ and
    // /worlds are the same page.
    const file = normalize(join(webRoot, path));
    if (file === webRoot || file.startsWith(webRoot + sep)) {
      for (const candidate of extname(path) ? [file] : [file, join(file, 'index.html')]) {
        try {
          if ((await stat(candidate)).isFile()) {
            // Vite's hashed files never change; everything else is checked on each visit.
            const cache = path.startsWith('/assets/')
              ? 'public, max-age=31536000, immutable'
              : 'no-cache';
            const type = TYPES[extname(candidate).toLowerCase()] ?? 'application/octet-stream';
            const robots = notIndexed(path) ? { 'X-Robots-Tag': 'noindex' } : {};
            return send(response, 200, type, await readFile(candidate), cache, robots);
          }
        } catch {}
      }
    }
    // Any other page address gets the site; any other file is missing.
    if (!extname(path))
      return send(response, 200, TYPES['.html'], await readFile(join(webRoot, 'index.html')));
    return send(response, 404, TYPES['.txt'], 'Not found');
  };
  return createServer((request, response) =>
    serve(request, response).catch(() => {
      if (response.headersSent) response.destroy();
      else send(response, 500, TYPES['.txt'], 'Server error');
    }),
  );
}

// Run as the program (not imported by the release check). The deploy starts it through the
// `current` symlink, so the two paths are compared as the files they name.
const self = realpathSync(fileURLToPath(import.meta.url));
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === self) {
  const root = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist');
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  createSite({ root, releaseId: process.env.DERETH_RELEASE_ID ?? 'dev' }).listen(port, host, () =>
    console.log(`Serving ${root} on http://${host}:${port}`),
  );
}
