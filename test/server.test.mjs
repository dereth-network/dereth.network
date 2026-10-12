// The site's server: its pages by folder, its policy, and what it refuses.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { MOVED, contentSecurityPolicy, createSite, staticHostFiles } from '../server.mjs';

let root;
let server;
let base;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'dereth-site-'));
  await mkdir(join(root, 'worlds'));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<title>Home</title>');
  await writeFile(join(root, 'worlds', 'index.html'), '<title>Worlds</title>');
  await writeFile(join(root, 'assets', 'page-1a2b.js'), 'export {};');
  server = createSite({ root, releaseId: 'test', hubUrl: 'http://127.0.0.1:8650/' });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
});

const get = (path) => fetch(new URL(path, base));

// A raw request, for addresses fetch would tidy first.
const raw = (path) =>
  new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path }, (res) => {
      res.resume();
      res.on('end', () => done(res.statusCode));
    });
    req.on('error', fail);
    req.end();
  });

test('a page is its folder, with or without the slash', async () => {
  for (const path of ['/worlds/', '/worlds']) {
    const page = await get(path);
    assert.equal(page.status, 200);
    assert.equal(await page.text(), '<title>Worlds</title>');
    assert.match(page.headers.get('content-type'), /^text\/html/);
  }
  assert.equal(await (await get('/')).text(), '<title>Home</title>');
});

test('any other page address gets the home page; any other file is missing', async () => {
  assert.equal(await (await get('/no/such/page')).text(), '<title>Home</title>');
  assert.equal((await get('/no-such-file.png')).status, 404);
  assert.equal(await raw('/../package.json'), 404);
});

test('the link page moved to your characters, with its query', async () => {
  for (const path of ['/link/', '/link']) {
    const moved = await fetch(new URL(`${path}?signin=failed`, base), { redirect: 'manual' });
    assert.equal(moved.status, 302);
    assert.equal(moved.headers.get('location'), '/characters/?signin=failed');
  }
});

test('hashed files are cached for a year, pages are checked each visit', async () => {
  const asset = await get('/assets/page-1a2b.js');
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal((await get('/worlds/')).headers.get('cache-control'), 'no-cache');
});

test('every answer carries the policy, which lets pages reach the hub and nothing else', async () => {
  const policy = (await get('/worlds/')).headers.get('content-security-policy');
  assert.equal(policy, contentSecurityPolicy('http://127.0.0.1:8650'));
  assert.match(policy, /connect-src 'self' http:\/\/127\.0\.0\.1:8650;/);
  assert.match(policy, /script-src 'self';/);
  assert.match(policy, /style-src 'self';/);
  assert.doesNotMatch(policy, /unsafe/);
  assert.equal((await get('/no-such-file.png')).headers.get('content-security-policy'), policy);
});

test('a static host is given the same headers, caching and moved pages as the server', async () => {
  const { _headers, _redirects } = staticHostFiles('http://127.0.0.1:8650');
  const [all, assets] = _headers.split('/assets/*\n');
  const answer = await get('/worlds/');
  for (const name of [
    'content-security-policy',
    'x-content-type-options',
    'referrer-policy',
    'x-frame-options',
  ]) {
    const line = all.split('\n').find((l) => l.trim().toLowerCase().startsWith(`${name}:`));
    assert.equal(line?.split(': ').slice(1).join(': '), answer.headers.get(name), name);
  }
  assert.ok(all.startsWith('/*\n'));
  assert.equal(
    assets.trim(),
    `Cache-Control: ${(await get('/assets/page-1a2b.js')).headers.get('cache-control')}`,
  );
  for (const [from, to] of Object.entries(MOVED))
    for (const path of [from, `${from}/`])
      assert.match(_redirects, new RegExp(`^${path} ${to} 302$`, 'm'));
});

test('the hub is hub.dereth.network unless another is named', () => {
  assert.match(contentSecurityPolicy(), /connect-src 'self' https:\/\/hub\.dereth\.network;/);
  assert.match(
    contentSecurityPolicy('https://dereth.network/hub'),
    /connect-src 'self' https:\/\/dereth\.network;/,
  );
  assert.throws(() => contentSecurityPolicy('ftp://hub.example.org'));
  assert.throws(() => contentSecurityPolicy('https://user:pw@hub.example.org'));
});

test('a malformed address is refused, and the server carries on', async () => {
  assert.equal(await raw('/%E0%A4%A'), 400);
  assert.equal((await get('/')).status, 200);
});

test('the site takes no posts', async () => {
  assert.equal((await fetch(new URL('/worlds/', base), { method: 'POST' })).status, 405);
});

test('the health check names the release', async () => {
  assert.deepEqual(await (await get('/healthz')).json(), { status: 'ok', release: 'test' });
});
