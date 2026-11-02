// What a shared link shows: every page's Open Graph tags from its own title and description, and
// each game's home page with that game's.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GAME_HOMES,
  NETWORK_CARD,
  gameHome,
  servedFrom,
  withOpenGraph,
} from '../deploy/open-graph.mjs';

const page = `<!doctype html>
<html>
  <head>
    <meta name="description" content="Tells &amp; friends between &quot;worlds&quot;." />
    <title>Worlds · Dereth Network</title>
  </head>
  <body></body>
</html>`;

const tag = (html, property) =>
  html.match(new RegExp(`<meta property="${property}" content="([^"]*)"`))?.[1];

test('a page’s link shows its own title and description, and the network’s emblem', () => {
  const html = withOpenGraph(page);
  assert.equal(tag(html, 'og:title'), 'Worlds · Dereth Network');
  assert.equal(tag(html, 'og:description'), 'Tells &amp; friends between &quot;worlds&quot;.');
  assert.equal(tag(html, 'og:image'), NETWORK_CARD);
  assert.equal(tag(html, 'og:site_name'), 'Dereth Network');
  assert.ok(html.indexOf('og:image') < html.indexOf('</head>'), 'the tags are in the head');
});

test('each game’s home page has that game’s title, description and picture, and no other tags', () => {
  for (const [game, home] of Object.entries(GAME_HOMES)) {
    const html = gameHome(withOpenGraph(page), game);
    assert.match(html, new RegExp(`<title>${home.title}</title>`), game);
    assert.equal(tag(html, 'og:title'), home.title, game);
    assert.equal(tag(html, 'og:image'), home.card, game);
    assert.match(html, /<meta name="description" content="[^"]*Dereth Network\."/, game);
    assert.equal(html.match(/og:title/g)?.length, 1, `${game}: one set of tags`);
  }
  assert.match(GAME_HOMES.auberean.description, /Asheron's Call 2/);
  assert.notEqual(GAME_HOMES.dereth.card, GAME_HOMES.auberean.card);
});

test('a page served elsewhere names its preview picture there, and nothing else changes', () => {
  const html = gameHome(withOpenGraph(page), 'auberean');
  const moved = servedFrom(html, 'https://dev.dereth.network/');
  assert.equal(tag(moved, 'og:image'), 'https://dev.dereth.network/media/art/auberean-card.png');
  assert.equal(moved.replace('dev.dereth.network', 'dereth.network'), html);
});
