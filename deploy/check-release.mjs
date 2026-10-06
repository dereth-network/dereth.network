// A candidate release's own check, run on the VM before it goes live: the server answers its
// health check and serves the page, its stylesheet and script, and its assets.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const release = resolve(process.argv[2] ?? '.');
const { createSite } = await import(pathToFileURL(resolve(release, 'server.mjs')).href);
const server = createSite({ root: resolve(release, 'dist'), releaseId: 'preflight' });
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const get = (path) => fetch(new URL(path, base));
try {
  const health = await get('/healthz');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).release, 'preflight');
  const page = await get('/');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<title>Dereth Network<\/title>/, 'The page is not the website');
  assert.match(html, /"\/assets\/[^"]+\.css"/, 'The page must reference its stylesheet');
  // Every file the page names (its stylesheet, script, images, fonts) is in the release.
  const named = [...html.matchAll(/(?:src|href)="(\/[^"/][^"]*)"/g)].map((m) => m[1]);
  assert.ok(named.length > 0);
  for (const file of new Set(named))
    assert.equal((await get(file)).status, 200, `The release is missing ${file}`);
  assert.equal((await get('/no/such/page')).status, 200, 'Every page address gets the site');
  assert.equal((await get('/no-such-file.png')).status, 404);
  assert.equal((await get('/../package.json')).status, 404, 'Nothing outside dist/ is served');
  console.log('Candidate release passed: health, page, stylesheet, script and assets.');
} finally {
  server.close();
}
