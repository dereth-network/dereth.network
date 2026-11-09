// The art pack guide's Markdown becomes the site's pages: links between the guide's files go to
// their pages, links into the rest of the Dereth tree go to it on GitHub, and every heading has the
// anchor GitHub gives it, so a link to one lands on the site too.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  CONTENT,
  guideFolder,
  renderGuide,
  siteLink,
  slug,
  syncArt,
} from '../deploy/art-guide.mjs';

test('links between the guide’s files go to their pages, and the rest of the tree to GitHub', () => {
  assert.equal(siteLink('sources.md', 'README.md'), '/art/sources/');
  assert.equal(siteLink('README.md#the-manifest', 'sources.md'), '/art/#the-manifest');
  assert.equal(siteLink('./sources.md#an-entry', 'README.md'), '/art/sources/#an-entry');
  assert.equal(
    siteLink('../plugins/sources.md', 'sources.md'),
    'https://github.com/dereth-network/dereth/blob/main/docs/plugins/sources.md',
  );
  assert.equal(
    siteLink('../../tools/art/src/main.rs#L10', 'README.md'),
    'https://github.com/dereth-network/dereth/blob/main/tools/art/src/main.rs#L10',
  );
  assert.equal(siteLink('#the-tools', 'README.md'), '#the-tools');
  assert.equal(siteLink('https://example.com/a.md', 'README.md'), 'https://example.com/a.md');
});

test('headings take GitHub’s anchors, and each section is a panel of its own', () => {
  assert.equal(slug('Art pack sources: `art.json`'.replace(/`/g, '')), 'art-pack-sources-artjson');
  assert.equal(slug("Dereth's own source"), 'dereths-own-source');
  const html = renderGuide(
    [
      '# Making a pack',
      '',
      'Read [sources.md](sources.md) and [the plugins](../plugins/sources.md).',
      '',
      '## The manifest',
      '',
      '| key | what |',
      '|---|---|',
      '| `id` | the id |',
      '',
      '## The manifest',
      '',
      'See [above](#the-manifest).',
    ].join('\n'),
    'README.md',
  );
  assert.match(html, /<h1 id="making-a-pack">Making a pack<\/h1>/);
  assert.match(html, /<a href="\/art\/sources\/">Art pack sources<\/a>/);
  assert.match(
    html,
    /<a href="https:\/\/github\.com\/dereth-network\/dereth\/blob\/main\/docs\/plugins\/sources\.md">the plugins<\/a>/,
  );
  assert.match(html, /<h2 id="the-manifest">/);
  assert.match(html, /<h2 id="the-manifest-1">/);
  assert.match(html, /<nav class="contents"[^>]*><ol><li><a href="#the-manifest">/);
  assert.match(html, /<div class="table"><table>/);
  assert.equal(html.match(/<section class="panel/g).length, 3);
  assert.doesNotMatch(html, /style=|<script|<style/);
});

test('the dev server reads a Dereth checkout’s docs only when DERETH_TREE names one', () => {
  assert.equal(guideFolder({ command: 'serve', tree: undefined }), CONTENT);
  assert.equal(guideFolder({ command: 'build', tree: 'C:/dereth' }), CONTENT);
  assert.equal(
    guideFolder({ command: 'serve', tree: 'C:/dereth' }),
    resolve('C:/dereth', 'docs/art'),
  );
});

test('sync-art copies the guide’s files from a checkout', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'dereth-art-'));
  try {
    await mkdir(join(scratch, 'tree', 'docs', 'art'), { recursive: true });
    for (const file of ['README.md', 'sources.md'])
      await writeFile(join(scratch, 'tree', 'docs', 'art', file), `# ${file}\n`);
    const out = join(scratch, 'copy');
    await syncArt(join(scratch, 'tree'), out);
    assert.equal(await readFile(join(out, 'sources.md'), 'utf8'), '# sources.md\n');
    assert.equal(await readFile(join(out, 'README.md'), 'utf8'), '# README.md\n');
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
