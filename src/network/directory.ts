// What the directory's pages show: a search's results, a listed character's profile and its
// allegiance's listed members, and the one page for a character the directory does not show. No
// DOM here, so all of it can be checked without a browser.
import { AUGMENTATIONS, HERITAGES, SKILLS, rankTitle } from './game.ts';
import type {
  AllegiancePage,
  AttributeName,
  Hub,
  ListingState,
  DirectoryCharacter,
  DirectoryEntry,
  DirectoryQuery,
  DirectorySkill,
  VitalName,
} from './hub.ts';
import { copyable, v } from './view.ts';
import type { View } from './view.ts';

/** The hub's page size, and the most results one search reaches. */
export const PAGE = 50;
export const REACH = 1000;

/** A listed character's page on this site, as the hub names it. */
export function characterHref(address: string): string {
  return `/directory/character/?a=${encodeURIComponent(address)}`;
}

/** An allegiance's page of listed members. */
export function allegianceHref(world: string, key: string): string {
  return `/directory/allegiance/?w=${encodeURIComponent(world)}&k=${encodeURIComponent(key)}`;
}

/** The world list, searched for one world. */
export function worldHref(slug: string): string {
  return `/worlds/?q=${encodeURIComponent(slug)}`;
}

/** The tell a player types in game to reach a character from any world on the network. */
export function tellLine(address: string): string {
  return `@tell ${address}, `;
}

/** A whole number with its thousands marked. */
export function count(n: number): string {
  return Math.trunc(n).toLocaleString('en-US');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A day, in UTC: "12 Oct 2026". */
function day(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** The hour a profile last changed, as the hub keeps it: "12 Oct 2026, 14:00 UTC". */
export function changedText(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${day(date)}, ${String(date.getUTCHours()).padStart(2, '0')}:00 UTC`;
}

/** A date of birth, in seconds since 1970: "1 May 2004". */
export function birthText(seconds: number): string {
  return day(new Date(seconds * 1000));
}

/** Time played, in seconds, as the game's age: "41 days 3 hours". */
export function ageText(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const part = (n: number, one: string) => `${count(n)} ${one}${n === 1 ? '' : 's'}`;
  if (days > 0)
    return hours > 0 ? `${part(days, 'day')} ${part(hours, 'hour')}` : part(days, 'day');
  if (hours > 0) return part(hours, 'hour');
  return part(minutes, 'minute');
}

export function heritageName(heritage: number): string {
  return HERITAGES[heritage] ?? `Heritage ${heritage}`;
}

export function genderName(gender: number): string {
  return gender === 2 ? 'female' : 'male';
}

/** A rank as its title for the character's heritage and gender, where the game has one. */
export function rankText(rank: number, heritage: number, gender: number): string {
  const title = rankTitle(heritage, gender, rank);
  return title ? `${title} (rank ${rank})` : `Rank ${rank}`;
}

const TRAINING_ORDER = { specialized: 0, trained: 1, untrained: 2 };

const TRAINING_TEXT = { specialized: 'Specialized', trained: 'Trained', untrained: 'Untrained' };
const TRAININGS = ['specialized', 'trained', 'untrained'] as const;

export function skillName(id: number): string {
  return SKILLS[id] ?? `Skill ${id}`;
}

/** Skills as a character sheet lists them: specialized, then trained, then untrained, each
 * highest first. */
export function sortedSkills(skills: DirectorySkill[]): DirectorySkill[] {
  return [...skills].sort(
    (a, b) =>
      TRAINING_ORDER[a.training] - TRAINING_ORDER[b.training] ||
      b.base - a.base ||
      skillName(a.id).localeCompare(skillName(b.id)),
  );
}

export function augmentationName(id: number): string {
  return AUGMENTATIONS[id] ?? `Augmentation ${id}`;
}

const ATTRIBUTES: [AttributeName, string][] = [
  ['strength', 'Strength'],
  ['endurance', 'Endurance'],
  ['coordination', 'Coordination'],
  ['quickness', 'Quickness'],
  ['focus', 'Focus'],
  ['self', 'Self'],
];

const VITALS: [VitalName, string][] = [
  ['health', 'Health'],
  ['stamina', 'Stamina'],
  ['mana', 'Mana'],
];

/** Where one of the person's own characters stands in the directory, as its page says it. */
export function listingText(state: ListingState | undefined): { tone: string; text: string } {
  switch (state) {
    case 'listed':
      return { tone: 'on', text: 'On the network' };
    case 'taken_down':
      return { tone: 'bad', text: 'Off the network: banned' };
    case 'off':
      return { tone: '', text: 'Off the network: link paused' };
    default:
      return { tone: '', text: 'Unknown' };
  }
}

// ---- the search, in the address bar and as the hub takes it -------------------------------------

/** A name or allegiance search the hub takes: at least two characters, two of them letters for a
 * name. */
export function searchable(text: string, letters: boolean): boolean {
  const t = text.trim();
  if (!t) return true;
  const lettersIn = [...t].filter((c) => /\p{L}/u.test(c)).length;
  return letters
    ? lettersIn >= 2 && [...t].length <= 32 && /^[\p{L} '-]+$/u.test(t)
    : [...t].length >= 2 && [...t].length <= 40 && !/[<>]/.test(t);
}

const whole = (value: string | null, max: number): number | undefined => {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n >= 1 && n <= max ? n : undefined;
};

/** A search from the address bar's query, keeping only what the hub would take. */
export function queryFrom(params: URLSearchParams): DirectoryQuery {
  const query: DirectoryQuery = {};
  const q = params.get('q')?.trim();
  if (q && searchable(q, true)) query.q = q;
  const world = params.get('world')?.trim().toLowerCase();
  if (world && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(world)) query.world = world;
  const levelMin = whole(params.get('level_min'), 100000);
  const levelMax = whole(params.get('level_max'), 100000);
  if (levelMin !== undefined) query.levelMin = levelMin;
  if (levelMax !== undefined && (levelMin === undefined || levelMax >= levelMin))
    query.levelMax = levelMax;
  const heritage = whole(params.get('heritage'), 13);
  if (heritage !== undefined) query.heritage = heritage;
  const allegiance = params.get('allegiance')?.trim();
  if (allegiance && searchable(allegiance, false)) query.allegiance = allegiance;
  const sort = params.get('sort');
  if (sort === 'level') query.sort = 'level';
  return query;
}

/** A search as the address bar holds it, so a search can be shared. */
export function paramsOf(query: DirectoryQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.world) params.set('world', query.world);
  if (query.levelMin !== undefined) params.set('level_min', String(query.levelMin));
  if (query.levelMax !== undefined) params.set('level_max', String(query.levelMax));
  if (query.heritage !== undefined) params.set('heritage', String(query.heritage));
  if (query.allegiance) params.set('allegiance', query.allegiance);
  if (query.sort === 'level') params.set('sort', 'level');
  return params;
}

/** How many a search found, and whether only its first thousand can be reached. */
export function totalText(total: number): string {
  const found = `${count(total)} ${total === 1 ? 'character' : 'characters'}`;
  return total > REACH
    ? `${found}. Only the first ${count(REACH)} are shown: narrow the search to see the rest.`
    : found;
}

// ---- the views --------------------------------------------------------------------------------

function worldName(entry: { world: { slug: string; name: string | null } }): string {
  return entry.world.name ?? entry.world.slug;
}

/** A link to a listed character's page. */
function characterLink(address: string): View {
  return v('a', { href: characterHref(address) }, address);
}

/** One listed character as a row of a search or of an allegiance's members. */
export function entryView(entry: DirectoryEntry, { withPatron = false } = {}): View {
  const al = entry.allegiance;
  const facts = [
    `Level ${count(entry.level)} ${heritageName(entry.heritage)}, ${genderName(entry.gender)}`,
    al
      ? `${rankText(al.rank, entry.heritage, entry.gender)}${al.name ? ` of ${al.name}` : ''}`
      : '',
  ].filter(Boolean);
  return v(
    'li',
    { class: 'world listing' },
    v(
      'div',
      { class: 'world-head' },
      v('h3', {}, characterLink(entry.address)),
      v('span', { class: 'state' }, `Changed ${changedText(entry.updated)}`),
    ),
    entry.title ? v('p', { class: 'desc' }, entry.title) : null,
    v('p', { class: 'meta' }, facts.join(' · ')),
    withPatron && al?.patron
      ? v('p', { class: 'meta' }, 'Patron ', characterLink(al.patron))
      : null,
  );
}

/** A row of facts: its label, and what it says. */
function row(label: string, ...value: View[]): View {
  return v('div', {}, v('dt', {}, label), v('dd', {}, ...value));
}

/** A small table: its caption (if any), its heads and its rows. */
function table(caption: string | null, heads: string[], rows: string[][]): View {
  return v(
    'table',
    { class: 'stats' },
    caption ? v('caption', {}, caption) : null,
    v('thead', {}, v('tr', {}, ...heads.map((head) => v('th', { scope: 'col' }, head)))),
    v(
      'tbody',
      {},
      ...rows.map(([name, ...cells]) =>
        v('tr', {}, v('th', { scope: 'row' }, name), ...cells.map((cell) => v('td', {}, cell))),
      ),
    ),
  );
}

/** The allegiance's facts, its patron and monarch linked while they are listed, and its listed
 * members, each linked. */
function allegianceView(c: DirectoryCharacter, members: AllegiancePage | null): View {
  const al = c.allegiance;
  if (!al) return null;
  const size = al.members !== undefined ? `${count(al.members)} members` : '';
  const listed = members?.data.filter((m) => m.address !== c.address) ?? [];
  return v(
    'section',
    { class: 'panel', 'aria-labelledby': 'h-allegiance' },
    v('h2', { id: 'h-allegiance' }, 'Allegiance'),
    v(
      'dl',
      { class: 'rows' },
      row('Allegiance', [al.name, size].filter(Boolean).join(' · ') || 'Unnamed'),
      row('Rank', rankText(al.rank, c.heritage, c.gender)),
      al.patron ? row('Patron', characterLink(al.patron)) : null,
      al.monarch ? row('Monarch', characterLink(al.monarch)) : null,
    ),
    listed.length
      ? v(
          'div',
          {},
          v('h3', {}, 'Listed members'),
          v(
            'ul',
            { class: 'members' },
            ...listed.map((m) =>
              v(
                'li',
                {},
                characterLink(m.address),
                v(
                  'span',
                  { class: 'muted' },
                  ` · ${rankText(m.allegiance?.rank ?? 0, m.heritage, m.gender)} · level ${count(m.level)}`,
                ),
              ),
            ),
          ),
        )
      : null,
    v(
      'p',
      { class: 'links' },
      v('a', { href: allegianceHref(c.world.slug, al.key) }, 'Every listed member'),
    ),
  );
}

/** A listed character's whole profile, as its world last sent it. */
export function characterView(c: DirectoryCharacter, members: AllegiancePage | null): View {
  const attributes = c.attributes;
  const vitals = c.vitals;
  const skills = sortedSkills(c.skills ?? []);
  const augmentations = [...(c.augmentations ?? [])].sort((a, b) =>
    augmentationName(a.id).localeCompare(augmentationName(b.id)),
  );
  // The six facts its own options let others see, each only when the profile carries it.
  const seen = [
    c.birth !== undefined ? row('Born', birthText(c.birth)) : null,
    c.age !== undefined ? row('Played', ageText(c.age)) : null,
    c.deaths !== undefined ? row('Deaths', count(c.deaths)) : null,
    c.titles !== undefined ? row('Titles', count(c.titles)) : null,
    c.chess !== undefined ? row('Chess rank', count(c.chess)) : null,
    c.fishing !== undefined ? row('Fishing skill', count(c.fishing)) : null,
  ].filter(Boolean);
  // Experience, unassigned experience and skill credits share a row, as far as the width allows.
  const figures = [
    c.experience ? row('Experience', count(c.experience.total)) : null,
    c.experience ? row('Unassigned', count(c.experience.unassigned)) : null,
    c.credits !== undefined ? row('Skill credits', count(c.credits)) : null,
  ].filter(Boolean);
  const progress = [
    c.luminance
      ? row('Luminance', `${count(c.luminance.available)} of ${count(c.luminance.maximum)}`)
      : null,
  ].filter(Boolean);
  return v(
    'div',
    { class: 'profile' },
    v(
      'section',
      { class: 'panel lead', 'aria-labelledby': 'h-character' },
      v('h1', { id: 'h-character' }, c.address, c.title ? v('span', {}, c.title) : null),
      v(
        'p',
        { class: 'meta' },
        `Level ${count(c.level)} ${heritageName(c.heritage)}, ${genderName(c.gender)} · on `,
        v('a', { href: worldHref(c.world.slug) }, worldName(c)),
      ),
      v('p', { class: 'meta' }, `Profile changed ${changedText(c.updated)}`),
      v(
        'div',
        { class: 'tell' },
        v('p', {}, 'Send a tell from any world on the Dereth Network:'),
        copyable(tellLine(c.address), `A tell to ${c.address}`),
      ),
    ),
    allegianceView(c, members),
    attributes || vitals || figures.length || progress.length || seen.length
      ? v(
          'section',
          { class: 'panel', 'aria-labelledby': 'h-stats' },
          v('h2', { id: 'h-stats' }, 'Character'),
          v(
            'div',
            { class: 'sheet' },
            attributes
              ? table(
                  'Attributes',
                  ['Attribute', 'Base', 'Innate'],
                  ATTRIBUTES.map(([key, name]) => [
                    name,
                    count(attributes[key].base),
                    count(attributes[key].innate),
                  ]),
                )
              : null,
            vitals
              ? table(
                  'Vitals',
                  ['Vital', 'Base'],
                  VITALS.map(([key, name]) => [name, count(vitals[key].base)]),
                )
              : null,
          ),
          figures.length ? v('dl', { class: 'figures' }, ...figures) : null,
          progress.length ? v('dl', { class: 'rows' }, ...progress) : null,
          seen.length ? v('dl', { class: 'figures' }, ...seen) : null,
        )
      : null,
    skills.length
      ? v(
          'section',
          { class: 'panel', 'aria-labelledby': 'h-skills' },
          v('h2', { id: 'h-skills' }, 'Skills'),
          ...TRAININGS.map((training) => {
            const these = skills.filter((s) => s.training === training);
            return these.length
              ? v(
                  'details',
                  { class: 'fold', open: training !== 'untrained' },
                  v('summary', {}, `${TRAINING_TEXT[training]} (${these.length})`),
                  table(
                    null,
                    ['Skill', 'Base'],
                    these.map((s) => [skillName(s.id), count(s.base)]),
                  ),
                )
              : null;
          }),
        )
      : null,
    augmentations.length
      ? v(
          'section',
          { class: 'panel', 'aria-labelledby': 'h-augs' },
          v('h2', { id: 'h-augs' }, 'Augmentations'),
          v(
            'ul',
            { class: 'augs' },
            ...augmentations.map((a) =>
              v('li', {}, augmentationName(a.id), a.times > 1 ? ` ×${count(a.times)}` : ''),
            ),
          ),
        )
      : null,
  );
}

/** The one page for every address the directory does not show: a character nobody listed, one
 * taken out, one of a world off the network, and an address that names no character. */
export function absentView(): View {
  return v(
    'section',
    { class: 'panel lead', 'aria-labelledby': 'h-absent' },
    v('h1', { id: 'h-absent' }, 'Not in the directory'),
    v('p', {}, 'The directory shows no character at this address.'),
    v(
      'div',
      { class: 'buttons' },
      v('a', { class: 'btn', href: '/directory/' }, 'Search the directory'),
    ),
  );
}

/** The one page for an allegiance the directory shows no member of. */
export function absentAllegianceView(): View {
  return v(
    'section',
    { class: 'panel lead', 'aria-labelledby': 'h-absent' },
    v('h1', { id: 'h-absent' }, 'No listed members'),
    v('p', {}, 'The directory shows no member of this allegiance.'),
    v(
      'div',
      { class: 'buttons' },
      v('a', { class: 'btn', href: '/directory/' }, 'Search the directory'),
    ),
  );
}

/** An allegiance's heading: its name, size and how many are listed. */
export function allegianceHeadView(page: AllegiancePage): View {
  const al = page.allegiance;
  const size = al.members !== undefined ? `${count(al.members)} members, ` : '';
  return v(
    'div',
    {},
    v(
      'h1',
      { id: 'h-allegiance' },
      al.name ?? 'An unnamed allegiance',
      v('span', {}, worldName(al)),
    ),
    v('p', { class: 'summary' }, `${size}${count(al.listed)} listed`),
  );
}

// ---- the pages, from their addresses --------------------------------------------------------------

/** What a character's page shows for its address's query (`?a=Name@world`): the character's
 * profile and its allegiance's listed members, with the title for the browser's tab; or, for every
 * address the directory does not show, the one page that says so. */
export async function characterPage(
  hub: Pick<Hub, 'directoryCharacter' | 'directoryAllegiance'>,
  search: string,
): Promise<{ title: string | null; view: View }> {
  const address = new URLSearchParams(search).get('a')?.trim() ?? '';
  const character = address ? await hub.directoryCharacter(address) : null;
  if (!character) return { title: null, view: absentView() };
  const al = character.allegiance;
  // The members are the page's second part: without them, the character still shows.
  const members = al
    ? await hub.directoryAllegiance(character.world.slug, al.key, { limit: PAGE }).catch(() => null)
    : null;
  return { title: character.address, view: characterView(character, members) };
}

/** An allegiance's page for its address's query (`?w=world&k=key`): its first page of listed
 * members, or null for every allegiance the directory shows no member of. */
export async function allegiancePage(
  hub: Pick<Hub, 'directoryAllegiance'>,
  search: string,
): Promise<{ world: string; key: string; page: AllegiancePage } | null> {
  const params = new URLSearchParams(search);
  const world = params.get('w')?.trim().toLowerCase() ?? '';
  const key = params.get('k')?.trim() ?? '';
  if (!world || !key) return null;
  const page = await hub.directoryAllegiance(world, key, { limit: PAGE });
  return page ? { world, key, page } : null;
}
