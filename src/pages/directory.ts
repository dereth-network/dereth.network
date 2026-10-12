// The directory's search: the hub's listed characters, searched, filtered and sorted by the hub
// itself, a page at a time. A search goes when it is asked for (the hub allows a few a minute),
// and lives in the address, so it can be shared.
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
import type { DirectoryQuery } from '../network/hub.ts';

const hub = pageHub();
const form = byId<HTMLFormElement>('filters');
const q = byId<HTMLInputElement>('q');
const world = byId<HTMLSelectElement>('world');
const heritage = byId<HTMLSelectElement>('heritage');
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

let query: DirectoryQuery = queryFrom(new URLSearchParams(location.search));
let next: number | null = null;
// Each new search is a new generation; an answer for an older one is dropped.
let generation = 0;

function show(from: DirectoryQuery) {
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
    fill(notices);
    if (offset === 0) fill(list);
    for (const entry of page.data) {
      const item = build(entryView(entry));
      if (item) list.append(item);
    }
    if (offset === 0 && page.data.length === 0)
      list.append(h('li', { class: 'empty' }, 'No listed character matches that.'));
    summary.textContent = totalText(page.total);
    summary.hidden = false;
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
  const params = paramsOf(query).toString();
  history.replaceState(history.state, '', location.pathname + (params ? `?${params}` : ''));
  void load(0);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  search();
});
for (const select of [world, heritage, sort]) select.addEventListener('change', search);
more.addEventListener('click', () => {
  if (next !== null) void load(next);
});

// The worlds on the network, to search one of them; without them, the search still works.
show(query);
hub
  .network()
  .then(({ worlds }) => {
    for (const w of [...worlds].sort((a, b) => a.name.localeCompare(b.name)))
      world.append(h('option', { value: w.slug }, w.name));
    if (query.world && !worlds.some((w) => w.slug === query.world))
      world.append(h('option', { value: query.world }, query.world));
    world.value = query.world ?? '';
  })
  .catch(() => {
    if (query.world) {
      world.append(h('option', { value: query.world }, query.world));
      world.value = query.world;
    }
  });
void load(0);
