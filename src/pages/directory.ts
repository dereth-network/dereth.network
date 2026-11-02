// The directory's search: the hub's listed characters, searched, filtered and sorted by the hub
// itself, a page at a time. A search goes when it is asked for (the hub allows a few a minute),
// and lives in the address, so it can be shared. It searches the realm's game unless the search
// (or its address) names the other, or either.
import { gameOf, isGame } from '../games.ts';
import type { Game } from '../games.ts';
import { build, byId, errorNotice, fill, h, pageHub } from '../network/dom.ts';
import {
  PAGE,
  REACH,
  entryView,
  paramsOf,
  queryFrom,
  searchable,
  totalText,
} from '../network/directory.ts';
import { HERITAGES } from '../network/game.ts';
import type { DirectoryEntry, DirectoryQuery, NetworkWorld } from '../network/hub.ts';
import { currentGame, onRealm } from '../realm.ts';

const hub = pageHub();
const form = byId<HTMLFormElement>('filters');
const game = byId<HTMLSelectElement>('game');
const q = byId<HTMLInputElement>('q');
const world = byId<HTMLSelectElement>('world');
const heritage = byId<HTMLSelectElement>('heritage');
// The heritages are Dereth's; a search of Auberean alone has none to offer.
const heritageField = heritage.closest('label') ?? heritage;
const levelMin = byId<HTMLInputElement>('level-min');
const levelMax = byId<HTMLInputElement>('level-max');
const allegiance = byId<HTMLInputElement>('allegiance');
const sort = byId<HTMLSelectElement>('sort');
const hint = byId('search-hint');
const list = byId<HTMLUListElement>('list');
const more = byId<HTMLButtonElement>('more');
const notices = byId('notices');
const summary = byId('summary');

for (const [n, name] of Object.entries(HERITAGES)) heritage.append(h('option', { value: n }, name));

const opened = new URLSearchParams(location.search);
let query: DirectoryQuery = queryFrom(opened);
// The game searched: the address's, or else the realm's. `any` is either.
let searched: Game | 'any' = opened.get('game') === 'any' ? 'any' : (query.game ?? currentGame());
query.game = searched === 'any' ? undefined : searched;
// The worlds on the network, and each one's game.
let worlds: NetworkWorld[] = [];
// A listed character's game: its own, or else its world's.
const entryGame = (e: DirectoryEntry): Game =>
  e.game ? gameOf(e) : gameOf(worlds.find((w) => w.slug === e.world.slug));
let next: number | null = null;
// Each new search is a new generation; an answer for an older one is dropped.
let generation = 0;

/** The world choice holds the networked worlds of the game searched, and the one asked for. */
function showWorlds(chosen: string | undefined) {
  const offered = worlds
    .filter((w) => searched === 'any' || gameOf(w) === searched)
    .sort((a, b) => a.name.localeCompare(b.name));
  fill(
    world,
    h('option', { value: '' }, 'Any'),
    ...offered.map((w) => h('option', { value: w.slug }, w.name)),
  );
  if (chosen && !offered.some((w) => w.slug === chosen))
    world.append(h('option', { value: chosen }, chosen));
  world.value = chosen ?? '';
}

function showGame() {
  game.value = searched;
  heritageField.hidden = searched === 'auberean';
  if (heritageField.hidden) heritage.value = '';
}

function show(from: DirectoryQuery) {
  showGame();
  q.value = from.q ?? '';
  world.value = from.world ?? '';
  heritage.value = from.heritage !== undefined ? String(from.heritage) : '';
  levelMin.value = from.levelMin !== undefined ? String(from.levelMin) : '';
  levelMax.value = from.levelMax !== undefined ? String(from.levelMax) : '';
  allegiance.value = from.allegiance ?? '';
  sort.value = from.sort === 'level' ? 'level' : '';
}

/** The form's search, or why the hub would not take it. */
function asked(): { query: DirectoryQuery } | { problem: string } {
  if (!searchable(q.value, true))
    return {
      problem:
        'A name search needs at least two letters, and only letters, spaces, apostrophes and hyphens.',
    };
  if (!searchable(allegiance.value, false))
    return { problem: 'An allegiance search needs at least two characters.' };
  const params = new URLSearchParams();
  for (const [key, value] of [
    ['game', game.value],
    ['q', q.value],
    ['world', world.value],
    ['heritage', heritage.value],
    ['level_min', levelMin.value],
    ['level_max', levelMax.value],
    ['allegiance', allegiance.value],
    ['sort', sort.value],
  ])
    if (value.trim()) params.set(key, value.trim());
  const read = queryFrom(params);
  if (levelMin.value.trim() && read.levelMin === undefined)
    return { problem: 'Levels run from 1 to 100,000.' };
  if (levelMax.value.trim() && read.levelMax === undefined)
    return { problem: 'Levels run from 1 to 100,000, the second no lower than the first.' };
  return { query: read };
}

async function load(offset: number) {
  const ticket = offset === 0 ? ++generation : generation;
  list.setAttribute('aria-busy', 'true');
  more.disabled = true;
  try {
    const page = await hub.directory({ ...query, limit: PAGE, offset });
    if (ticket !== generation) return;
    // A hub that can't search by game sends every game's characters: the other's are left out,
    // and its count, which holds them, isn't shown.
    const entries = query.game ? page.data.filter((e) => entryGame(e) === query.game) : page.data;
    fill(notices);
    if (offset === 0) fill(list);
    for (const entry of entries) {
      const item = build(entryView(entry));
      if (item) list.append(item);
    }
    if (offset === 0 && entries.length === 0)
      list.append(h('li', { class: 'empty' }, 'No listed character matches that.'));
    summary.textContent = totalText(page.total);
    summary.hidden = entries.length !== page.data.length;
    next = page.nextOffset !== null && page.nextOffset < REACH ? page.nextOffset : null;
    more.hidden = next === null;
  } catch (error) {
    if (ticket !== generation) return;
    fill(notices, errorNotice(error));
  } finally {
    if (ticket === generation) {
      list.setAttribute('aria-busy', 'false');
      more.disabled = false;
    }
  }
}

function search() {
  const read = asked();
  if ('problem' in read) {
    hint.className = 'hint bad';
    hint.textContent = read.problem;
    hint.hidden = false;
    return;
  }
  hint.hidden = true;
  query = read.query;
  const params = paramsOf(query);
  if (searched === 'any') params.set('game', 'any');
  const address = params.toString();
  history.replaceState(history.state, '', location.pathname + (address ? `?${address}` : ''));
  void load(0);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  search();
});
for (const select of [world, heritage, sort]) select.addEventListener('change', search);
game.addEventListener('change', () => {
  searched = isGame(game.value) ? game.value : 'any';
  showGame();
  showWorlds(world.value || undefined);
  search();
});
// Another realm searches its own game.
onRealm(() => {
  searched = currentGame();
  showGame();
  showWorlds(world.value || undefined);
  search();
});
more.addEventListener('click', () => {
  if (next !== null) void load(next);
});

// The worlds on the network, to search one of them and to know each one's game; without them,
// the search still works.
show(query);
hub
  .network()
  .then((network) => {
    worlds = network.worlds;
  })
  .catch(() => {})
  .finally(() => {
    showWorlds(query.world);
    void load(0);
  });
