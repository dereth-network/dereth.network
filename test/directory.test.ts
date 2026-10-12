// What the directory's pages show: a listed character's profile and the links between its
// allegiance's listed members, the one page for every kind of absence, a search in the address
// bar, and the game's names for the numbers a profile carries.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  absentView,
  allegiancePage,
  ageText,
  changedText,
  characterHref,
  characterPage,
  characterView,
  entryView,
  listingText,
  paramsOf,
  queryFrom,
  rankText,
  sortedSkills,
  tellLine,
  totalText,
} from '../src/network/directory.ts';
import { createHub } from '../src/network/hub.ts';
import type { AllegiancePage, DirectoryCharacter, DirectoryEntry } from '../src/network/hub.ts';
import { linksOf, textOf } from '../src/network/view.ts';

const HUB = 'https://hub.example.org';

/** A hub whose every answer is `answers` in turn, and the addresses it was asked. */
function hubAnswering(...answers: Response[]) {
  const asked: string[] = [];
  const hub = createHub(HUB, async (url: string) => {
    asked.push(url);
    return answers.shift() ?? new Response(null, { status: 204 });
  });
  return { hub, asked };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const absent = () =>
  json(404, { error: { code: 'NOT_FOUND', message: 'No such character in the directory' } });

const bob: DirectoryCharacter = {
  address: 'Sir Bob@coldeve',
  name: 'Sir Bob',
  world: { slug: 'coldeve', name: 'Coldeve' },
  updated: '2026-10-12T14:00:00.000Z',
  level: 126,
  heritage: 1,
  gender: 1,
  title: 'the Bloodletter',
  allegiance: {
    key: 'k3Yq0pW9xLmN',
    name: 'Order of the Dawn',
    members: 41,
    rank: 3,
    patron: 'Cara@coldeve',
    monarch: 'Queen Mab@coldeve',
  },
  experience: { total: 191226310247, unassigned: 1000 },
  credits: 0,
  luminance: { available: 5000, maximum: 1500000 },
  skills: [
    { id: 6, training: 'trained', base: 300 },
    { id: 44, training: 'specialized', base: 420 },
  ],
  augmentations: [{ id: 218, times: 1 }],
};

const member = (address: string, rank: number, patron?: string): DirectoryEntry => ({
  address,
  name: address.split('@')[0],
  world: { slug: 'coldeve', name: 'Coldeve' },
  updated: '2026-10-12T13:00:00.000Z',
  level: 200,
  heritage: 1,
  gender: 2,
  allegiance: { key: 'k3Yq0pW9xLmN', rank, patron },
});

const members: AllegiancePage = {
  allegiance: {
    world: { slug: 'coldeve', name: 'Coldeve' },
    key: 'k3Yq0pW9xLmN',
    name: 'Order of the Dawn',
    members: 41,
    listed: 3,
  },
  data: [
    member('Queen Mab@coldeve', 10),
    member('Cara@coldeve', 5, 'Queen Mab@coldeve'),
    member('Sir Bob@coldeve', 3, 'Cara@coldeve'),
  ],
  total: 3,
  limit: 50,
  offset: 0,
  nextOffset: null,
};

test('a character’s page is at the address the hub names', () => {
  assert.equal(characterHref('Sir Bob@coldeve'), '/directory/character/?a=Sir%20Bob%40coldeve');
  assert.equal(tellLine('Sir Bob@coldeve'), '@tell Sir Bob@coldeve, ');
});

test('every kind of absence shows the one page, the same for each', async () => {
  const shown = [];
  for (const search of [
    '?a=Nobody%40coldeve',
    '?a=Gone%40coldeve',
    '?a=not%20an%20address',
    '?a=oldguard%40channel',
    '?a=',
    '',
  ]) {
    const { hub, asked } = hubAnswering(absent());
    const page = await characterPage(hub, search);
    shown.push(page);
    if (!new URLSearchParams(search).get('a')) assert.deepEqual(asked, [], 'nothing to ask');
  }
  for (const page of shown) assert.deepEqual(page, { title: null, view: absentView() });
  assert.match(textOf(absentView()), /Not in the directory/);
  assert.doesNotMatch(textOf(absentView()), /Nobody|taken|unlisted|exist/i);
});

test('a listed character’s page links its patron, its monarch and its listed members', async () => {
  const { hub, asked } = hubAnswering(json(200, { character: bob }), json(200, members));
  const page = await characterPage(hub, '?a=Sir%20Bob%40coldeve');
  assert.equal(page.title, 'Sir Bob@coldeve');
  assert.deepEqual(asked, [
    `${HUB}/v1/directory/characters/Sir%20Bob%40coldeve`,
    `${HUB}/v1/directory/allegiances/coldeve/k3Yq0pW9xLmN?limit=50`,
  ]);
  const links = linksOf(page.view);
  const to = (address: string) => links.filter((l) => l.href === characterHref(address));
  assert.equal(to('Cara@coldeve').length, 2, 'as its patron and as a listed member');
  assert.equal(to('Queen Mab@coldeve').length, 2, 'as its monarch and as a listed member');
  assert.equal(to('Sir Bob@coldeve').length, 0, 'never itself');
  assert.ok(links.some((l) => l.href === '/worlds/?q=coldeve' && l.text === 'Coldeve'));
  assert.ok(links.some((l) => l.href === '/directory/allegiance/?w=coldeve&k=k3Yq0pW9xLmN'));
  const text = textOf(page.view);
  assert.match(text, /@tell Sir Bob@coldeve, /);
  assert.match(text, /Baron \(rank 3\)/);
  assert.match(text, /Order of the Dawn · 41 members/);
  assert.match(text, /191,226,310,247/);
  assert.match(text, /5,000 of 1,500,000/);
  assert.match(text, /Reinforcement of the Lugians/);
  assert.match(text, /Profile changed 12 Oct 2026, 14:00 UTC/);
});

test('a patron or monarch the hub does not name is not shown, and nothing says why', () => {
  const alone = { ...bob, allegiance: { key: 'k3Yq0pW9xLmN', members: 41, rank: 3 } };
  const view = characterView(alone, null);
  assert.deepEqual(
    linksOf(view).filter((l) => l.href.startsWith('/directory/character/')),
    [],
  );
  assert.doesNotMatch(textOf(view), /Patron|Monarch|not listed/);
});

test('the fields a character’s own options govern show only when its profile carries them', () => {
  const hidden = textOf(characterView(bob, null));
  for (const label of ['Born', 'Played', 'Deaths', 'Titles', 'Chess rank', 'Fishing skill'])
    assert.ok(!hidden.includes(label), label);
  const shown = textOf(
    characterView(
      { ...bob, birth: 1083369600, age: 3553200, deaths: 12, titles: 37, chess: 1500, fishing: 0 },
      null,
    ),
  );
  for (const said of [
    'Born 1 May 2004',
    'Played 41 days 3 hours',
    'Deaths 12',
    'Titles 37',
    'Chess rank 1,500',
    'Fishing skill 0',
  ])
    assert.ok(shown.includes(said), said);
});

test('a search’s row links its character, and an allegiance’s row its patron while listed', () => {
  const row = member('Cara@coldeve', 5, 'Queen Mab@coldeve');
  assert.deepEqual(linksOf(entryView(row)), [
    { href: characterHref('Cara@coldeve'), text: 'Cara@coldeve' },
  ]);
  assert.deepEqual(
    linksOf(entryView(row, { withPatron: true })).map((l) => l.href),
    [characterHref('Cara@coldeve'), characterHref('Queen Mab@coldeve')],
  );
  assert.match(textOf(entryView(row)), /Level 200 Aluvian, female · Thane \(rank 5\)/);
});

test('an allegiance nobody listed, or no allegiance at all, is no page', async () => {
  const none = hubAnswering(absent());
  assert.equal(await allegiancePage(none.hub, '?w=coldeve&k=no-such-key'), null);
  const nothing = hubAnswering();
  assert.equal(await allegiancePage(nothing.hub, '?w=coldeve'), null);
  assert.deepEqual(nothing.asked, []);
  const some = hubAnswering(json(200, members));
  const found = await allegiancePage(some.hub, '?w=Coldeve&k=k3Yq0pW9xLmN');
  assert.equal(found?.page.total, 3);
  assert.deepEqual(some.asked, [`${HUB}/v1/directory/allegiances/coldeve/k3Yq0pW9xLmN?limit=50`]);
});

test('a search in the address bar keeps only what the hub would take', () => {
  const query = queryFrom(
    new URLSearchParams(
      'q=sir bo&world=Coldeve&level_min=100&level_max=200&heritage=3&allegiance=dawn&sort=level',
    ),
  );
  assert.deepEqual(query, {
    q: 'sir bo',
    world: 'coldeve',
    levelMin: 100,
    levelMax: 200,
    heritage: 3,
    allegiance: 'dawn',
    sort: 'level',
  });
  assert.equal(
    paramsOf(query).toString(),
    'q=sir+bo&world=coldeve&level_min=100&level_max=200&heritage=3&allegiance=dawn&sort=level',
  );
  assert.deepEqual(
    queryFrom(
      new URLSearchParams(
        'q=b&world=No World&level_min=0&level_max=100001&heritage=14&allegiance=d&sort=name',
      ),
    ),
    {},
  );
  assert.deepEqual(queryFrom(new URLSearchParams('level_min=9&level_max=8')), { levelMin: 9 });
});

test('the game’s names and the directory’s times read as players know them', () => {
  assert.equal(rankText(3, 1, 2), 'Baroness (rank 3)');
  assert.equal(rankText(10, 2, 1), 'Sultan (rank 10)');
  assert.equal(rankText(3, 12, 1), 'Rank 3', 'the Olthoi have no titles');
  assert.equal(rankText(11, 1, 1), 'Rank 11');
  assert.equal(changedText('2026-10-12T09:00:00.000Z'), '12 Oct 2026, 09:00 UTC');
  assert.equal(ageText(3600 * 5), '5 hours');
  assert.equal(ageText(86400), '1 day');
  assert.deepEqual(
    sortedSkills(bob.skills ?? []).map((s) => s.id),
    [44, 6],
    'specialized first',
  );
  assert.equal(totalText(1), '1 character');
  assert.match(totalText(1200), /^1,200 characters\. Only the first 1,000/);
});

test('each of a person’s characters says where it stands in the directory', () => {
  assert.deepEqual(
    (['listed', 'taken_down', 'off', undefined] as const).map((s) => listingText(s).tone),
    ['on', 'bad', '', ''],
  );
  assert.match(listingText('taken_down').text, /off the network: banned/i);
  assert.match(listingText('off').text, /off the network: link paused/i);
});
