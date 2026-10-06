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

const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
};

export function createSite({ root, releaseId }) {
  const webRoot = resolve(root);
  const send = (response, status, type, body, cache = 'no-cache') => {
    response.writeHead(status, { ...HEADERS, 'Content-Type': type, 'Cache-Control': cache });
    response.end(body);
  };
  return createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname);
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
    // A file under dist/, never outside it.
    const file = normalize(join(webRoot, path === '/' ? 'index.html' : path));
    if (file === webRoot || file.startsWith(webRoot + sep)) {
      try {
        if ((await stat(file)).isFile()) {
          // Vite's hashed files never change; everything else is checked on each visit.
          const cache = path.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'no-cache';
          const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
          return send(response, 200, type, await readFile(file), cache);
        }
      } catch {}
    }
    // Any other page address gets the site; any other file is missing.
    if (!extname(path))
      return send(response, 200, TYPES['.html'], await readFile(join(webRoot, 'index.html')));
    return send(response, 404, TYPES['.txt'], 'Not found');
  });
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
