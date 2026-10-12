// The worlds page: the hub's public list, searched and filtered by the hub itself, a page at a
// time, with whether each world is on the network and linked to it now.
import { byId, errorNotice, fill, h, pageHub } from '../network/dom.ts';
import {
  NETWORK_TEXT,
  RULESETS,
  addressUnproven,
  connectAddress,
  networkState,
  safeLink,
  software,
  statusLine,
} from '../network/format.ts';
import type { NetworkStatus, NetworkWorld, World } from '../network/hub.ts';

const PAGE = 50;
const hub = pageHub();
const list = byId<HTMLUListElement>('list');
const more = byId<HTMLButtonElement>('more');
const notices = byId('notices');
const summary = byId('summary');
const q = byId<HTMLInputElement>('q');
const ruleset = byId<HTMLSelectElement>('ruleset');
const networked = byId<HTMLInputElement>('networked');

// The search and filters live in the address, so a list can be shared.
const start = new URLSearchParams(location.search);
q.value = start.get('q') ?? '';
const startRuleset = start.get('ruleset') ?? '';
if ((RULESETS as readonly string[]).includes(startRuleset)) ruleset.value = startRuleset;
networked.checked = start.get('federation') === 'on';

let linked: Map<string, NetworkWorld> | null = null;
let next: number | null = null;
// Each new search is a new generation; an answer for an older one is dropped.
let generation = 0;

const known = (value: string | undefined) => (value && value !== 'Unspecified' ? value : '');

function worldItem(world: World): HTMLLIElement {
  const status = statusLine(world);
  const net = networkState(world, linked);
  const where = connectAddress(world);
  const meta = [world.ruleset, known(world.region), software(world), known(world.maturity)]
    .filter(Boolean)
    .join(' · ');
  const website = safeLink(world.website);
  const discord = safeLink(world.discord);
  const unclaimed = world.ownership?.state === 'unclaimed';
  const badges = [
    net !== 'off' ? h('span', { class: `badge ${net}` }, NETWORK_TEXT[net]) : null,
    unclaimed ? h('span', { class: 'badge' }, 'Community listing') : null,
    addressUnproven(world)
      ? h(
          'span',
          {
            class: 'badge wait',
            title:
              'Its address changed since its operator proved they run it, and isn’t proven yet.',
          },
          'New address, not yet proven',
        )
      : null,
    world.isDemo ? h('span', { class: 'badge' }, 'Demo') : null,
  ].filter((b) => b !== null);
  const slug = encodeURIComponent(world.slug);
  const away = { rel: 'noopener noreferrer nofollow ugc' };
  return h(
    'li',
    { class: 'world' },
    h(
      'div',
      { class: 'world-head' },
      h('h2', {}, world.name),
      h('code', {}, `@${world.slug}`),
      h('span', { class: 'state' }, h('span', { class: `dot ${status.tone}` }), status.text),
    ),
    meta ? h('p', { class: 'meta' }, meta) : null,
    where ? h('p', { class: 'meta' }, 'Connect to ', h('code', {}, where)) : null,
    badges.length ? h('p', { class: 'badges' }, ...badges) : null,
    world.description ? h('p', { class: 'desc' }, world.description) : null,
    h(
      'p',
      { class: 'links' },
      website ? h('a', { href: website, ...away }, 'Website') : null,
      discord ? h('a', { href: discord, ...away }, 'Discord') : null,
      unclaimed ? h('a', { href: `/operators/?claim=${slug}` }, 'Yours? Claim it') : null,
      h('a', { href: `/report/?world=${slug}` }, 'Report'),
    ),
  );
}

function summaryText(s: NetworkStatus): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  return [
    n(s.total, 'world', 'worlds'),
    n(s.playersOnline, 'player', 'players'),
    n(s.federatedServers, 'world on the Dereth Network', 'worlds on the Dereth Network'),
  ].join(' · ');
}

async function load(offset: number) {
  const ticket = offset === 0 ? ++generation : generation;
  list.setAttribute('aria-busy', 'true');
  more.disabled = true;
  try {
    const page = await hub.worlds({
      q: q.value.trim(),
      ruleset: ruleset.value,
      federation: networked.checked ? 'on' : undefined,
      limit: PAGE,
      offset,
    });
    if (ticket !== generation) return;
    fill(notices);
    if (offset === 0) fill(list);
    list.append(...page.data.map(worldItem));
    if (offset === 0 && page.data.length === 0)
      list.append(
        h(
          'li',
          { class: 'empty' },
          q.value.trim() || ruleset.value || networked.checked
            ? 'No world matches that.'
            : 'The hub lists no worlds yet.',
        ),
      );
    next = page.nextOffset ?? null;
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
  const params = new URLSearchParams();
  if (q.value.trim()) params.set('q', q.value.trim());
  if (ruleset.value) params.set('ruleset', ruleset.value);
  if (networked.checked) params.set('federation', 'on');
  const query = params.toString();
  history.replaceState(history.state, '', location.pathname + (query ? `?${query}` : ''));
  void load(0);
}

let typing: ReturnType<typeof setTimeout> | undefined;
q.addEventListener('input', () => {
  clearTimeout(typing);
  typing = setTimeout(search, 300);
});
ruleset.addEventListener('change', search);
networked.addEventListener('change', search);
byId('filters').addEventListener('submit', (event) => {
  event.preventDefault();
  clearTimeout(typing);
  search();
});
more.addEventListener('click', () => {
  if (next !== null) void load(next);
});

// Which worlds are linked comes first, so the first page shows it; without it, the list still
// shows which worlds are on the network.
const links = hub
  .network()
  .then(({ worlds }) => new Map(worlds.map((w) => [w.slug, w])))
  .catch(() => null);
hub
  .status()
  .then((s) => {
    summary.textContent = summaryText(s);
    summary.hidden = false;
  })
  .catch(() => {});
linked = await links;
void load(0);
