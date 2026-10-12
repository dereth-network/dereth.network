// What the network pages say about worlds, operators' worlds and the hub's refusals, in plain
// words. No DOM here, so all of it can be checked without a browser.
import { HubError } from './hub.ts';
import type { Approval, AuditEvent, NetworkWorld, Registration, Report, World } from './hub.ts';

/** The rulesets a world may have, in the order the pages offer them. */
export const RULESETS = ['PvE', 'PvP', 'PvP-lite', 'Custom'] as const;

// The names no world can join the network under: the nine retail worlds, and the network's own
// words. A world may still be listed with one; it just cannot turn the network on.
const NETWORK_RESERVED = new Set([
  'darktide',
  'frostfell',
  'harvestgain',
  'leafcull',
  'morningthaw',
  'solclaim',
  'thistledown',
  'verdantine',
  'wintersebb',
  'channel',
  'discord',
  'hub',
  'net',
  'network',
  'local',
  'localhost',
  'world',
  'all',
  'any',
]);

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A slug the registry takes: 2 to 40 of a-z, 0-9 and single inner hyphens. (The hub also keeps
 * some platform words back, and says so when one is asked for.) */
export function isRegistrySlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= 40 && SLUG.test(slug);
}

/** A slug that can join the network, and so be the world half of `Name@world`. */
export function isNetworkSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= 12 && SLUG.test(slug) && !NETWORK_RESERVED.has(slug);
}

/** What the register form says about a slug as it is typed, or null when there is nothing to say. */
export function slugAdvice(slug: string): { ok: boolean; text: string } | null {
  if (!slug) return null;
  if (!isRegistrySlug(slug))
    return {
      ok: false,
      text: 'Use 2 to 40 lower-case letters and numbers, with single hyphens between them.',
    };
  if (slug.length > 12)
    return {
      ok: false,
      text: 'Longer than 12 characters: the world can be listed, but it can’t join the network.',
    };
  if (NETWORK_RESERVED.has(slug))
    return {
      ok: false,
      text: 'That name is kept back (a retail world, or one of the network’s own words): the world can be listed, but it can’t join the network.',
    };
  return { ok: true, text: `Players there will be Name@${slug}.` };
}

/** A link the pages may draw: http or https, with no credentials in it. */
export function safeLink(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password)
      return url.href;
  } catch {}
  return null;
}

export type Tone = 'online' | 'busy' | 'offline' | 'quiet';

/** A world's state and population, as one short line and a tone for its dot. */
export function statusLine(world: World): { tone: Tone; text: string } {
  const status = world.status;
  const players = status?.playersOnline;
  const count =
    typeof players === 'number' ? ` · ${players} ${players === 1 ? 'player' : 'players'}` : '';
  switch (status?.state) {
    case 'online':
      return { tone: 'online', text: `Online${count}` };
    case 'degraded':
      return { tone: 'busy', text: `Having trouble${count}` };
    case 'maintenance':
      return { tone: 'busy', text: 'Down for maintenance' };
    case 'offline':
      return { tone: 'offline', text: 'Offline' };
    case 'stale':
      return { tone: 'quiet', text: 'Not reporting lately' };
    default:
      return { tone: 'quiet', text: 'Doesn’t report its status' };
  }
}

export type NetworkState = 'linked' | 'unlinked' | 'on' | 'off';

/** Whether a world is on the network, and if so whether its link to the hub is up now (`on` when
 * the hub's list of links couldn't be read). */
export function networkState(
  world: World,
  linked: ReadonlyMap<string, NetworkWorld> | null,
): NetworkState {
  const entry = linked?.get(world.slug);
  if (entry) return entry.online ? 'linked' : 'unlinked';
  if (world.federation !== 'on') return 'off';
  return linked ? 'unlinked' : 'on';
}

export const NETWORK_TEXT: Record<NetworkState, string> = {
  linked: 'On the network · linked',
  unlinked: 'On the network · not linked now',
  on: 'On the network',
  off: 'Not on the network',
};

/** The software a world runs, as one line. */
export function software(world: World): string {
  if (world.software) return world.software;
  const e = world.emulator;
  return e ? [e.family, e.version].filter(Boolean).join(' ') : '';
}

/** Where a player's launcher connects, when the world gives a fixed address. */
export function connectAddress(world: World): string | null {
  const e = world.endpoint;
  if (!e || !e.address) return null;
  const host = e.address.includes(':') ? `[${e.address}]` : e.address;
  return `${host}:${e.port}`;
}

/** A time from the hub, in the reader's own way of writing dates. */
export function when(iso: string | null | undefined, locale?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

/** A wait the hub asked for, in words: "about 2 minutes", "about 11 hours". */
export function waitText(seconds: number): string {
  if (seconds < 90) return 'a minute';
  const minutes = Math.round(seconds / 60);
  if (minutes < 55) return `about ${minutes} minutes`;
  const hours = Math.round(seconds / 3600);
  return hours <= 1 ? 'about an hour' : `about ${hours} hours`;
}

// Why a verification failed, by the hub's reason.
const VERIFICATION_REASONS: Record<string, string> = {
  token_not_found:
    'The hub didn’t find the token on that page. Check the page is up, answers 200 over HTTPS on the world’s own host without redirecting elsewhere, and shows the token exactly as given.',
  host_mismatch:
    'That page isn’t on the world’s own host. Use a page on the host its address names.',
  address_not_public:
    'The check came from a private or reserved address. It must come from the world’s public address.',
  wrong_token: 'That isn’t the world’s current token, or it was already used. Get a new one.',
  expired: 'The token has expired. Get a new one.',
  address_mismatch:
    'The check came from an address that isn’t the world’s. It must come from the world’s own server.',
  no_verification: 'There’s no open token for this world. Get a new one.',
  endpoint_changed: 'The world’s address changed while the hub was checking. Check again.',
};

// What each of the hub's codes means to the person reading the page. The hub's own message
// follows where it says more.
const CODES: Record<string, string> = {
  NETWORK: 'The Dereth Network’s hub couldn’t be reached. Check your connection and try again.',
  TIMEOUT: 'The hub took too long to answer. Try again in a moment.',
  BAD_RESPONSE: 'The hub sent an answer this page can’t read. Try again in a moment.',
  UNAUTHORIZED: 'You’re signed out. Sign in with Discord to carry on.',
  UNAVAILABLE: 'Sign-in isn’t open on the hub yet.',
  TOO_LARGE: 'That’s more than the hub takes in one go. Shorten it and try again.',
  INTERNAL_ERROR: 'The hub had a problem. Try again in a moment.',
};

// Why linking a character was refused, by the hub's reason.
const LINK_REASONS: Record<string, string> = {
  no_such_code: 'This link was used already or has expired. Type @dn link in game for a new one.',
  too_many_characters: 'You have linked as many characters as one account may. Unlink one first.',
};

/** A refusal from the hub, in plain words. */
export function explain(error: unknown): string {
  if (!(error instanceof HubError))
    return 'Something went wrong on this page. Reload it and try again.';
  const linking = error.reason ? LINK_REASONS[error.reason] : undefined;
  if (linking && (error.code === 'LINK_FAILED' || error.code === 'CONFLICT')) return linking;
  if (error.code === 'VERIFICATION_FAILED')
    return (error.reason && VERIFICATION_REASONS[error.reason]) || error.message;
  const refused = error.reason ? FEDERATION_REASONS[error.reason] : undefined;
  if (refused && error.code === 'RATE_LIMITED')
    return `${refused} Try again in ${waitText(error.retryAfterSeconds ?? 86400)}.`;
  if (refused) return refused;
  if (error.code === 'RATE_LIMITED') {
    const wait = error.retryAfterSeconds
      ? ` Try again in ${waitText(error.retryAfterSeconds)}.`
      : '';
    return `${sentence(error.message)}${wait}`;
  }
  const plain = CODES[error.code];
  if (plain) return plain;
  if (error.status >= 500) return CODES.INTERNAL_ERROR;
  return sentence(error.message);
}

function sentence(text: string): string {
  const t = text.trim();
  if (!t) return 'The hub refused that.';
  const first = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(first) ? first : `${first}.`;
}

/** What verifying, or turning the network on, did about the network. */
export const APPROVAL_TEXT: Record<Approval, string> = {
  approved: 'The world is on the network now.',
  not_network_slug:
    'The world can’t join the network under this slug (longer than 12 characters, or kept back). It stays listed.',
  locked: 'The world is locked by the hub’s operator, so the network stays off.',
  unlisted: 'The hub’s operator took the world out of the lists, so the network stays off.',
  rate_limited:
    'Today’s approvals are used up, so the network stays off for now. Turn it on from here tomorrow.',
};

// Why turning the network on was refused, by the hub's reason.
const FEDERATION_REASONS: Record<string, string> = {
  not_verified: 'Prove you run the world first; then the network can be turned on.',
  endpoint_not_verified:
    'The world’s address changed, so it left the network. Prove you run it at the new address to turn the network back on.',
  not_network_slug: APPROVAL_TEXT.not_network_slug,
  locked: APPROVAL_TEXT.locked,
  unlisted: APPROVAL_TEXT.unlisted,
  rate_limited: 'Today’s approvals are used up, so the network stays off for now.',
};

/** Where an operator's world stands, as the operator page shows it. */
export type Stage = 'locked' | 'claim' | 'pending' | 'reverify' | 'on' | 'off-network-slug' | 'off';

export function stage(world: World): Stage {
  const op = world.operator;
  if (op?.locked) return 'locked';
  if (op?.role === 'claimant') return 'claim';
  if (world.ownership?.state === 'pending') return 'pending';
  if (op?.verification && op.verification.endpointVerified === false) return 'reverify';
  if (world.federation === 'on') return 'on';
  return isNetworkSlug(world.slug) ? 'off' : 'off-network-slug';
}

export const STAGE_TEXT: Record<Stage, string> = {
  locked: 'Locked',
  claim: 'Claim waiting for proof',
  pending: 'Waiting for proof',
  reverify: 'Address changed: prove it again',
  on: 'On the network',
  'off-network-slug': 'Listed; can’t join the network',
  off: 'Verified; network off',
};

/** Whether the world still needs its operator to prove they run it. */
export function needsProof(world: World): boolean {
  const s = stage(world);
  return s === 'claim' || s === 'pending' || s === 'reverify';
}

export const REPORT_REASONS = {
  impersonation: 'It pretends to be another world, or the network',
  abuse: 'Abuse of players on other worlds',
  spam: 'Spam',
  other: 'Something else',
} as const;

/** How a report stands: open, or how it ended. */
export function reportOutcome(report: Pick<Report, 'state' | 'resolution'>): {
  tone: string;
  text: string;
} {
  if (report.state === 'open') return { tone: 'wait', text: 'Open' };
  if (report.resolution === 'revoked') return { tone: 'bad', text: 'World revoked' };
  if (report.resolution === 'dismissed') return { tone: '', text: 'Dismissed' };
  return { tone: '', text: 'Closed' };
}

/** Who did something in a world's history, as the operator reading it sees them. */
export function actorText(actor: string, me: string | null): string {
  if (actor === 'hub') return 'the hub';
  if (actor === 'world') return 'the world';
  if (actor === 'hub-operator') return 'the hub’s operator';
  if (actor === 'earlier-claimant') return 'an earlier claimant';
  if (actor === 'hub-admin') return 'a hub admin';
  return me !== null && actor === me ? 'you' : 'another operator';
}

/**
 * Whether a verified world's address changed since its operator proved they run it, and is not
 * yet proven again: the public list says so.
 */
export function addressUnproven(world: World): boolean {
  return world.ownership?.state === 'managed' && world.ownership.endpointVerified === false;
}

// The rooms mirrored into Discord, by the names players know them by.
const ROOM_NAMES: Record<string, string> = {
  global: 'Global',
  general: 'General',
  trade: 'Trade',
  lfg: 'LFG',
  roleplay: 'Roleplay',
};

/** A room's name as players know it; a network channel by its address (`oldguard@channel`). */
export function roomName(room: string): string {
  return ROOM_NAMES[room] ?? room;
}

/** A mirror into Discord set or stopped, in words, or null for details that say neither. The hub
 * changes one itself when the room that carries a world's Global chat changes: that room's mirror
 * becomes Global's (`was`), or goes when Global is mirrored already (`carriesGlobal`). */
function mirrorEventText(details: Record<string, unknown>, by: string): string | null {
  const room = typeof details.room === 'string' ? roomName(details.room) : 'A room';
  if (details.mirrored === true) {
    const through = details.through === 'webhook' ? 'a webhook' : 'the bot';
    const was =
      typeof details.was === 'string'
        ? `: ${roomName(details.was)}’s mirror, since ${roomName(details.was)} carries Global`
        : '';
    return `${room} mirrored into the Discord channel ${details.channel}, through ${through}, by ${by}${was}`;
  }
  if (details.mirrored === false)
    return details.carriesGlobal === true
      ? `${room} no longer mirrored into Discord, by ${by}: ${room} carries Global, which is mirrored already`
      : `${room} no longer mirrored into Discord, by ${by}`;
  return null;
}

/** Where a world carries Global chat, set, in words. */
function globalRoomEventText(details: Record<string, unknown>, by: string): string {
  const where = (r: unknown) =>
    r === 'off' ? 'no room' : typeof r === 'string' ? roomName(r) : 'a room';
  const from = typeof details.was === 'string' ? ` (from ${where(details.was)})` : '';
  const seed = details.seed === true ? ', as the world’s settings said' : '';
  return `Cross-world Global chat carried in ${where(details.room)}${from}${seed}, by ${by}`;
}

/** One entry of a world's history, or of the hub's Discord log: what happened, who did it, and
 * what it records. */
export function auditText(event: AuditEvent, me: string | null): string {
  const by = actorText(event.actor, me);
  const details = event.details ?? {};
  const mirror = event.kind === 'discord-mirror' ? mirrorEventText(details, by) : null;
  if (mirror) return mirror;
  if (event.kind === 'global-room') return globalRoomEventText(details, by);
  if (event.kind === 'discord-avatar')
    return typeof details.url === 'string'
      ? `The picture mirrored lines show set to ${details.url}, by ${by}`
      : `The picture mirrored lines show removed, by ${by}`;
  const facts = Object.entries(event.details ?? {})
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    .map(([k, v]) => `${k}: ${v}`);
  const what = `${event.kind.replaceAll('_', ' ')} by ${by}`;
  return facts.length ? `${what} (${facts.join(', ')})` : what;
}

/** The registration form's fields, as typed. */
export interface RegistrationFields {
  slug: string;
  name: string;
  description: string;
  ruleset: string;
  region: string;
  maturity: string;
  website: string;
  discord: string;
  isDemo: boolean;
  mode: 'manual' | 'observed';
  address: string;
  port: string;
  addressFamily: string;
  family: string;
  version: string;
}

/** A world's registration as the form starts it: blank for a new world, or as it stands. */
export function fieldsOf(world: World | null): RegistrationFields {
  const e = world?.endpoint;
  return {
    slug: world?.slug ?? '',
    name: world?.name ?? '',
    description: world?.description ?? '',
    ruleset: world?.ruleset ?? 'PvE',
    region: world?.region && world.region !== 'Unspecified' ? world.region : '',
    maturity: world?.maturity && world.maturity !== 'Unspecified' ? world.maturity : '',
    website: world?.website ?? '',
    discord: world?.discord ?? '',
    isDemo: world?.isDemo ?? false,
    mode: e?.mode ?? 'manual',
    address: e?.mode === 'manual' ? (e.address ?? '') : '',
    port: e ? String(e.port) : '9000',
    addressFamily: e?.addressFamily ?? 'ipv4',
    family: world?.emulator?.family ?? 'ACE',
    version: world?.emulator?.version ?? '',
  };
}

/** The body the hub takes to register a world or replace its registration. */
export function toRegistration(f: RegistrationFields): Registration {
  const trim = (s: string) => s.trim();
  const registration: Registration = {
    slug: trim(f.slug),
    name: trim(f.name),
    description: trim(f.description),
    ruleset: f.ruleset,
    region: trim(f.region) || 'Unspecified',
    maturity: trim(f.maturity) || 'Unspecified',
    isDemo: f.isDemo,
    endpoint:
      f.mode === 'observed'
        ? {
            mode: 'observed',
            port: Number(f.port),
            addressFamily: f.addressFamily === 'ipv6' ? 'ipv6' : 'ipv4',
          }
        : { mode: 'manual', address: trim(f.address), port: Number(f.port) },
    emulator: { family: trim(f.family) },
  };
  if (trim(f.website)) registration.website = trim(f.website);
  if (trim(f.discord)) registration.discord = trim(f.discord);
  if (trim(f.version)) registration.emulator.version = trim(f.version);
  return registration;
}

// The symbols of a link code: Crockford's base 32, without I, L, O and U.
const CODE_SYMBOLS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A link code as a player typed it, in the form the hub writes it (`K7QD-2MXP`): case, spaces
 * and hyphens don't matter, I and L read as 1 and O as 0. Null when it isn't eight symbols. */
export function readLinkCode(typed: string): string | null {
  let symbols = '';
  for (const raw of typed.toUpperCase()) {
    if (raw === ' ' || raw === '-') continue;
    const c = raw === 'I' || raw === 'L' ? '1' : raw === 'O' ? '0' : raw;
    if (!CODE_SYMBOLS.includes(c)) return null;
    symbols += c;
    if (symbols.length > 8) return null;
  }
  return symbols.length === 8 ? `${symbols.slice(0, 4)}-${symbols.slice(4)}` : null;
}
