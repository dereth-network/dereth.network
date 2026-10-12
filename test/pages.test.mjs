// Every page builds, and the release check passes it: served, under the policy, with no inline
// style or script, calling only the hub the build was given. The check also fails a release
// that breaks those rules.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const site = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HUB = 'http://127.0.0.1:8650';
let release;

// Runs the release check on `release` with the hub named; resolves to its exit code and output.
const check = (hub) =>
  new Promise((done) =>
    execFile(
      process.execPath,
      [join(site, 'deploy', 'check-release.mjs'), release],
      { env: { ...process.env, DERETH_HUB_URL: hub } },
      (error, stdout, stderr) =>
        done({ code: error ? (error.code ?? 1) : 0, out: stdout + stderr }),
    ),
  );

before(async () => {
  release = await mkdtemp(join(tmpdir(), 'dereth-release-'));
  const previous = process.env.DERETH_HUB_URL;
  process.env.DERETH_HUB_URL = HUB;
  try {
    await build({
      root: site,
      configFile: join(site, 'vite.config.mjs'),
      logLevel: 'silent',
      build: { outDir: join(release, 'dist'), emptyOutDir: true },
    });
  } finally {
    if (previous === undefined) delete process.env.DERETH_HUB_URL;
    else process.env.DERETH_HUB_URL = previous;
  }
  await copyFile(join(site, 'server.mjs'), join(release, 'server.mjs'));
});

after(() => rm(release, { recursive: true, force: true }));

test('every page builds and passes the release check, with the hub it was built for', async () => {
  for (const page of [
    'network',
    'worlds',
    'operators',
    'report',
    'characters',
    'link',
    'directory',
    'directory/character',
    'directory/allegiance',
  ]) {
    const html = await readFile(join(release, 'dist', page, 'index.html'), 'utf8');
    assert.ok(html.includes(`<meta name="dereth-hub" content="${HUB}"`), `${page} names the hub`);
    const nav = html.slice(html.indexOf('<nav class="rail"'), html.indexOf('</nav>'));
    assert.ok(nav.includes('<a href="/network/"'), `${page} has the network in its nav`);
    assert.ok(!nav.includes('/directory/'), `${page} leaves the directory to the network page`);
  }
  const { code, out } = await check(HUB);
  assert.equal(code, 0, out);
  assert.match(out, /10 pages/);
});

test('the directory’s pages ask not to be indexed, and robots.txt keeps crawlers out', async () => {
  for (const page of ['directory', 'directory/character', 'directory/allegiance']) {
    const html = await readFile(join(release, 'dist', page, 'index.html'), 'utf8');
    assert.match(html, /<meta name="robots" content="noindex" \/>/, page);
  }
  for (const page of ['network', 'worlds', 'characters', 'link'])
    assert.doesNotMatch(
      await readFile(join(release, 'dist', page, 'index.html'), 'utf8'),
      /name="robots"/,
      page,
    );
  const robots = await readFile(join(release, 'dist', 'robots.txt'), 'utf8');
  assert.match(robots, /^User-agent: \*\nDisallow: \/directory\/$/m);
  const headers = await readFile(join(release, 'dist', '_headers'), 'utf8');
  assert.match(headers, /^\/directory\/\*\n {2}X-Robots-Tag: noindex$/m);
});

test('a release whose directory page would be indexed fails the check', async () => {
  const page = join(release, 'dist', 'directory', 'character', 'index.html');
  const clean = await readFile(page, 'utf8');
  try {
    await writeFile(page, clean.replace('<meta name="robots" content="noindex" />', ''));
    const { code, out } = await check(HUB);
    assert.notEqual(code, 0);
    assert.match(out, /must ask not to be indexed/);
  } finally {
    await writeFile(page, clean);
  }
});

test('a server whose policy does not reach the pages’ hub fails the check', async () => {
  const { code, out } = await check('https://hub.dereth.network');
  assert.notEqual(code, 0);
  assert.match(out, /does not let it reach/);
});

test('a page with an inline script or style fails the check', async () => {
  const page = join(release, 'dist', 'report', 'index.html');
  const clean = await readFile(page, 'utf8');
  try {
    for (const [bad, said] of [
      ['<script>alert(1)</script>', /inline <script>/],
      ['<style>p{}</style>', /inline <style>/],
      ['<p style="color:red">x</p>', /style attribute/],
      ['<a href="#" onclick="go()">x</a>', /event-handler attribute/],
    ]) {
      await writeFile(page, clean.replace('</body>', `${bad}</body>`));
      const { code, out } = await check(HUB);
      assert.notEqual(code, 0, bad);
      assert.match(out, said);
    }
  } finally {
    await writeFile(page, clean);
  }
});
