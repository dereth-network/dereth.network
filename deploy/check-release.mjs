// A candidate release's own check, run on the VM before it goes live: the server answers its
// health check and serves every page, with its stylesheet, script and assets, under a policy the
// page keeps: no inline style or script, and nothing to call but the site and the hub the page
// names. The directory's pages ask search engines not to index them, and robots.txt keeps
// crawlers out of them.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Every page, by its address, and its title.
const PAGES = {
  '/': 'Dereth Network',
  '/network/': 'The Dereth Network',
  '/worlds/': 'Worlds · Dereth Network',
  '/operators/': 'Operators · Dereth Network',
  '/report/': 'Report a world · Dereth Network',
  '/characters/': 'Your characters · Dereth Network',
  '/link/': 'Link a character · Dereth Network',
  '/join/': 'Join a world · Dereth Network',
  '/directory/': 'Directory · Dereth Network',
  '/directory/character/': 'A character · Directory · Dereth Network',
  '/directory/allegiance/': 'An allegiance · Directory · Dereth Network',
};

// The pages search engines are asked not to index, by their address's start.
const NOT_INDEXED = '/directory/';

const release = resolve(process.argv[2] ?? '.');
const { createSite } = await import(pathToFileURL(resolve(release, 'server.mjs')).href);
const server = createSite({ root: resolve(release, 'dist'), releaseId: 'preflight' });
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const get = (path) => fetch(new URL(path, base));

const directives = (policy) =>
  new Map(
    policy
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...values]) => [name, values]),
  );

// The page's markup holds nothing the policy would block: no <style>, no <script> without a
// file, no style or event-handler attribute, no javascript: address; and the hub it calls is one
// the policy lets it reach.
function keepsPolicy(path, html, policy) {
  const rules = directives(policy);
  assert.deepEqual(rules.get('script-src'), ["'self'"], `${path}: scripts must be the site's own`);
  assert.deepEqual(rules.get('style-src'), ["'self'"], `${path}: styles must be the site's own`);
  for (const [, tag, attributes] of html.matchAll(
    /<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
  )) {
    const names = [...attributes.matchAll(/([^\s=/"']+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)];
    assert.notEqual(tag.toLowerCase(), 'style', `${path} has an inline <style>`);
    if (tag.toLowerCase() === 'script')
      assert.ok(
        names.some(([, name]) => name.toLowerCase() === 'src'),
        `${path} has an inline <script>`,
      );
    for (const [, name, value = ''] of names) {
      assert.notEqual(name.toLowerCase(), 'style', `${path} has a style attribute on <${tag}>`);
      assert.ok(!/^on/i.test(name), `${path} has an event-handler attribute (${name})`);
      assert.ok(!/^["']?\s*javascript:/i.test(value), `${path} has a javascript: address`);
    }
  }
  const hub = html.match(/<meta name="dereth-hub" content="([^"]*)"/)?.[1];
  if (hub !== undefined) {
    const origin = new URL(hub).origin;
    assert.ok(
      rules.get('connect-src')?.includes(origin),
      `${path} calls the hub at ${origin}, which the server's policy does not let it reach`,
    );
  }
}

try {
  const health = await get('/healthz');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).release, 'preflight');
  const named = new Set();
  for (const [path, title] of Object.entries(PAGES)) {
    const page = await get(path);
    assert.equal(page.status, 200, `${path} is not served`);
    const html = await page.text();
    assert.ok(html.includes(`<title>${title}</title>`), `${path} is not its page`);
    assert.match(html, /"\/assets\/[^"]+\.css"/, `${path} must reference its stylesheet`);
    keepsPolicy(path, html, page.headers.get('content-security-policy') ?? '');
    if (path.startsWith(NOT_INDEXED)) {
      assert.match(
        html,
        /<meta name="robots" content="noindex"/,
        `${path} must ask not to be indexed`,
      );
      assert.equal(page.headers.get('x-robots-tag'), 'noindex', `${path} must be served noindex`);
    } else {
      assert.equal(page.headers.get('x-robots-tag'), null, `${path} must stay indexable`);
    }
    for (const m of html.matchAll(/(?:src|href)="(\/[^"/][^"]*)"/g)) named.add(m[1]);
  }
  // Every file a page names (its stylesheet, script, images, fonts) is in the release.
  assert.ok(named.size > 0);
  for (const file of named)
    assert.equal((await get(file)).status, 200, `The release is missing ${file}`);
  const robots = await get('/robots.txt');
  assert.equal(robots.status, 200, 'The release has no robots.txt');
  assert.match(
    await robots.text(),
    /^User-agent: \*\nDisallow: \/directory\/$/m,
    'robots.txt must keep crawlers out of the directory',
  );
  const bare = await (await get('/worlds')).text();
  assert.ok(bare.includes(`<title>${PAGES['/worlds/']}</title>`), 'A page answers without its /');
  assert.equal((await get('/no/such/page')).status, 200, 'Every page address gets the site');
  assert.equal((await get('/no-such-file.png')).status, 404);
  assert.equal((await get('/../package.json')).status, 404, 'Nothing outside dist/ is served');
  assert.equal((await get('/%E0%A4%A')).status, 400, 'A malformed address is refused');
  console.log(
    `Candidate release passed: health, ${Object.keys(PAGES).length} pages, their policy, stylesheets, scripts and assets, and the directory kept out of search engines.`,
  );
} finally {
  server.close();
}
