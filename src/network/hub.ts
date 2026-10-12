// The hub's API, as the network pages call it from the browser. The public routes (the world
// list, the network's worlds, the character directory) are read without the hub's cookie; the operator routes carry it
// (`credentials: 'include'`), and the hub answers them only for the site's own origin.

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export type Federation = 'on' | 'off' | 'unset';
export type StatusState = 'online' | 'degraded' | 'maintenance' | 'offline' | 'stale' | 'unknown';
export type Approval = 'approved' | 'not_network_slug' | 'locked' | 'unlisted' | 'rate_limited';
export type ReportReason = 'impersonation' | 'abuse' | 'spam' | 'other';

export interface HubConfig {
  baseDomain: string;
  heartbeatTtlSeconds: number;
  authEnabled: boolean;
  signIn?: string;
  /** What the hub does with Discord's bot; absent from a hub older than the bot. */
  broker?: BrokerConfig;
}

/** What a hub with Discord's bot offers: each is false on a hub without it. */
export interface BrokerConfig {
  /** Tells into persons' Discord direct messages. */
  discordTells: boolean;
  /** Rooms mirrored into channels of Discord servers. */
  mirrors: boolean;
}

export interface Endpoint {
  mode: 'manual' | 'observed';
  address?: string | null;
  port: number;
  /** An observed endpoint's family; null for a fixed address. */
  addressFamily?: 'ipv4' | 'ipv6' | null;
}

export interface WorldStatus {
  state: StatusState;
  playersOnline: number | null;
  lastSeenAt: string | null;
  message?: string;
}

export interface OperatorWorld {
  role: 'owner' | 'claimant';
  verification: {
    method: 'page' | 'game' | 'review' | null;
    verifiedAt: string | null;
    endpointVerified: boolean;
    open: boolean;
    expiresAt: string | null;
  } | null;
  key: { issuedAt: string } | null;
  locked: { at: string; reason: string } | null;
}

export interface World {
  slug: string;
  name: string;
  description?: string;
  ruleset: string;
  region?: string;
  maturity?: string;
  website?: string | null;
  discord?: string | null;
  isDemo?: boolean;
  endpoint?: Endpoint;
  emulator?: { family: string; version?: string };
  software?: string;
  federation?: Federation;
  ownership?: {
    state: 'pending' | 'managed' | 'unclaimed';
    verifiedAt: string | null;
    /** False once the world's address changed after it was verified, until it is again. */
    endpointVerified?: boolean;
  };
  status?: WorldStatus;
  operator?: OperatorWorld;
}

export interface WorldPage {
  data: World[];
  total: number;
  limit: number;
  offset: number;
  nextOffset: number | null;
}

export interface NetworkWorld {
  slug: string;
  name: string;
  online: boolean;
}

export interface NetworkStatus {
  total: number;
  counts: Partial<Record<StatusState, number>>;
  playersOnline: number;
  reportingServers: number;
  federatedServers: number;
}

export interface Registration {
  slug: string;
  name: string;
  description: string;
  ruleset: string;
  region: string;
  maturity: string;
  website?: string;
  discord?: string;
  isDemo: boolean;
  endpoint: Endpoint;
  emulator: { family: string; version?: string };
}

export interface Verification {
  token: string;
  expiresAt: string;
  page?: { hosts: string[] };
  game?: string;
}

export interface Operator {
  id: string;
  discordId: string;
  name: string;
  signedInAt: string;
  admin: boolean;
}

export interface Report {
  id: string;
  slug: string;
  reason: ReportReason;
  details: string;
  createdAt: string;
  state: 'open' | 'closed';
  resolvedAt: string | null;
  resolution: 'dismissed' | 'revoked' | null;
  world: { slug: string; name: string };
  /** The admin's note: in the admin routes only. */
  note?: string | null;
  /** Who filed it: in the admin routes only. */
  reporter?: { id: string; discordId: string; name: string };
}

/** Where one of a person's characters stands in the directory: listed (it is on the network);
 * held out by the hub's operator; or not listed (it is off the network). */
export type ListingState = 'listed' | 'taken_down' | 'off';

/** One of a person's characters. */
export interface PersonCharacter {
  address: string;
  world: { slug: string; name: string | null };
  linkedAt: string;
  listing?: ListingState;
}

/** A person friend: the character it was added by (its handle), and the character it was added
 * from. */
export interface PersonFriend {
  handle: string;
  addedFrom: string;
  addedAt: string;
}

/** The person signed in, as the hub shows it to that person alone. */
export interface Person {
  name: string;
  characters: PersonCharacter[];
  friends: PersonFriend[];
}

/** What a mirror carried since the hub started. */
export interface MirrorLines {
  toDiscord: number;
  heldBackToDiscord: number;
  notCarried: number;
}

/** A room mirrored into a channel of a Discord server, one way: through the bot's own webhook
 * there (its id null until the bot makes it), or through a webhook its asker made (its id, never
 * its address). */
export interface DiscordMirror {
  /** `global`, a network channel (`oldguard@channel`), or a world's own room (`general`). */
  room: string;
  channel: string;
  server: string;
  through: 'bot' | 'webhook';
  webhook: string | null;
  setAt: string;
  lines: MirrorLines;
  /** In the admins' view alone: the world whose operator set it, or null for the admins' own. */
  world?: string | null;
}

/** A world's mirrors, the rooms it may mirror, where the bot is added to a Discord server (null
 * on a hub without sign-in), and the room that carries the Global room there. */
export interface WorldMirrors {
  mirrors: DiscordMirror[];
  rooms: string[];
  invite: string | null;
  /** The world's own room that carries the Global room (`general`, `trade`, `lfg`, `roleplay`),
   * or `off` for none; null while the hub holds none for the world (it has not said, or it runs an
   * older version); left out by a hub that keeps none. */
  globalRoom?: string | null;
}

/** Where a mirror goes: a channel the bot says its lines in, by its id, or the address of a
 * webhook its asker made, which is a secret: sent once, and never answered back. */
export type MirrorTarget = { channel: string } | { webhook: string };

/** What tells into persons' Discord carried since the hub started, and how many persons' direct
 * messages are read now for replies. */
export interface TellCounts {
  toDiscord: number;
  fromDiscord: number;
  heldBackToDiscord: number;
  heldBackFromDiscord: number;
  notCarried: number;
  replyWindows: number;
}

/** The hub's Discord settings, as its admins see them: every mirror, the admins' first, the
 * picture mirrored lines show, and the tells carried. */
export interface DiscordAdmin {
  invite: string | null;
  avatarUrl: string | null;
  mirrors: DiscordMirror[];
  tells: TellCounts;
}

/** One of the hub's settings, as its admins see it: its value now, its default and its bounds. */
export interface HubSetting {
  value: number;
  default: number;
  min: number;
  max: number;
}

/** The hub's settings its admins change while it runs: its ceiling on worlds joining the network
 * a day, the age in days a Discord account needs to register or claim a world, and the days a
 * registered world may wait to be verified. */
export interface HubSettings {
  approvalsPerDay: HubSetting;
  minAccountAgeDays: HubSetting;
  pendingDays: HubSetting;
}

export type HubSettingName = keyof HubSettings;

/** How a directory search is sorted: the profiles that changed most lately first, or the highest
 * levels first. */
export type DirectorySort = 'updated' | 'level';

export interface DirectoryQuery {
  /** The start of the name, or of any word of it. */
  q?: string;
  world?: string;
  levelMin?: number;
  levelMax?: number;
  heritage?: number;
  /** The start of the allegiance's name, or of any word of it. */
  allegiance?: string;
  sort?: DirectorySort;
  limit?: number;
  offset?: number;
}

/** A character's allegiance, as far as the directory shows it. `patron` and `monarch` are there
 * only while each of them is listed too, and only on the character's own answer (a member's row
 * carries its `patron`). */
export interface DirectoryAllegiance {
  key: string;
  name?: string;
  members?: number;
  rank: number;
  patron?: string;
  monarch?: string;
}

/** One listed character, as a search's results and an allegiance's members show it. */
export interface DirectoryEntry {
  address: string;
  name: string;
  world: { slug: string; name: string | null };
  /** The hour its profile last changed. */
  updated: string;
  level: number;
  heritage: number;
  gender: number;
  title?: string;
  allegiance?: DirectoryAllegiance;
}

export interface DirectoryAttribute {
  innate: number;
  base: number;
}

export interface DirectorySkill {
  id: number;
  training: 'untrained' | 'trained' | 'specialized';
  base: number;
}

export type AttributeName =
  'strength' | 'endurance' | 'coordination' | 'quickness' | 'focus' | 'self';

export type VitalName = 'health' | 'stamina' | 'mana';

/** A listed character's whole profile. The last six fields are there only as the character's own
 * "Allow others to see your ..." options allow. */
export interface DirectoryCharacter extends DirectoryEntry {
  experience?: { total: number; unassigned: number };
  credits?: number;
  luminance?: { available: number; maximum: number };
  attributes?: Record<AttributeName, DirectoryAttribute>;
  vitals?: Record<VitalName, { base: number }>;
  skills?: DirectorySkill[];
  augmentations?: { id: number; times: number }[];
  /** When the character was made, in seconds since 1970. */
  birth?: number;
  /** How long it has been played, in seconds. */
  age?: number;
  deaths?: number;
  chess?: number;
  fishing?: number;
  titles?: number;
}

export interface DirectoryPage {
  data: DirectoryEntry[];
  total: number;
  limit: number;
  offset: number;
  nextOffset: number | null;
}

/** An allegiance's listed members, highest rank first, and the allegiance as its most lately
 * changed listed member gives it. */
export interface AllegiancePage extends DirectoryPage {
  allegiance: {
    world: { slug: string; name: string | null };
    key: string;
    name?: string;
    members?: number;
    listed: number;
  };
}

/** A registry event of one world. `actor` is the reader's own operator id, or `hub`, `world`,
 * `hub-operator`, `earlier-claimant` or `hub-admin` (the hub never shows an owner another
 * operator's id); `details` holds what the kind of event records. */
export interface AuditEvent {
  kind: string;
  at: string;
  actor: string;
  details: Record<string, unknown> | null;
}

/** A refusal from the hub, in its error form, or a request that never reached it. */
export class HubError extends Error {
  /** The HTTP status, or 0 when the hub could not be reached. */
  readonly status: number;
  /** The hub's code (`RATE_LIMITED`, `VERIFICATION_FAILED`, ...), or `NETWORK` / `TIMEOUT`. */
  readonly code: string;
  /** Why a verification failed, or a federation change was refused. */
  readonly reason: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    reason?: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'HubError';
    this.status = status;
    this.code = code;
    this.reason = reason;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// What a hub that answered without its error form is taken to mean, by status.
const CODES: Record<number, string> = {
  400: 'INVALID_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'TOO_LARGE',
  422: 'VERIFICATION_FAILED',
  429: 'RATE_LIMITED',
  503: 'UNAVAILABLE',
};

// The hub fetches a verification page within 10 seconds; anything longer than this is lost.
const TIMEOUT_MS = 30_000;

interface Call {
  body?: unknown;
  session?: boolean;
}

export interface WorldQuery {
  q?: string;
  ruleset?: string;
  /** Only the worlds with this federation flag (`on`: the worlds on the network). */
  federation?: Federation;
  limit?: number;
  offset?: number;
}

export function createHub(base: string, fetchImpl: Fetch = (i, init) => fetch(i, init)) {
  const root = base.replace(/\/+$/, '');
  const seg = (s: string) => encodeURIComponent(s);

  async function call<T>(method: string, path: string, { body, session = false }: Call = {}) {
    const init: RequestInit = {
      method,
      mode: 'cors',
      // The public routes answer any origin and must be read without the cookie; the operator
      // routes need it.
      credentials: session ? 'include' : 'omit',
    };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal)
      init.signal = AbortSignal.timeout(TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(root + path, init);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError')
        throw new HubError(0, 'TIMEOUT', 'The hub took too long to answer.');
      throw new HubError(0, 'NETWORK', 'The hub could not be reached.');
    }
    if (response.status === 204) return undefined as T;
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = undefined;
    }
    if (response.ok) {
      if (parsed === undefined)
        throw new HubError(
          response.status,
          'BAD_RESPONSE',
          'The hub sent an answer this page cannot read.',
        );
      return parsed as T;
    }
    throw refusal(response, parsed);
  }

  return {
    /** The hub's own address, for links that leave the site (sign-in). */
    base: root,

    config: () => call<HubConfig>('GET', '/v1/config'),

    worlds(query: WorldQuery = {}) {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.ruleset) params.set('ruleset', query.ruleset);
      if (query.federation) params.set('federation', query.federation);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      if (query.offset) params.set('offset', String(query.offset));
      const q = params.toString();
      return call<WorldPage>('GET', `/v1/servers${q ? `?${q}` : ''}`);
    },

    world: (slug: string) => call<World>('GET', `/v1/servers/${seg(slug)}`),

    network: () => call<{ hub?: string; worlds: NetworkWorld[] }>('GET', '/v1/network'),

    status: () => call<NetworkStatus>('GET', '/v1/status'),

    /**
     * Where the browser goes to sign in with Discord, coming back to `returnPath` on this site
     * (`site`, this page's origin): the hub returns there when it lists that origin, and to its
     * own first site otherwise.
     */
    signInUrl(
      config: HubConfig,
      returnPath: string,
      site: string | undefined = globalThis.location?.origin,
    ) {
      const route =
        config.signIn && config.signIn.startsWith('/') ? config.signIn : '/v1/auth/discord';
      const from = site ? `&site=${encodeURIComponent(site)}` : '';
      return `${root}${route}?return=${encodeURIComponent(returnPath)}${from}`;
    },

    /** The operator signed in, or null when nobody is. */
    async operator(): Promise<Operator | null> {
      try {
        return (await call<{ operator: Operator }>('GET', '/v1/operator', { session: true }))
          .operator;
      } catch (error) {
        if (error instanceof HubError && error.status === 401) return null;
        throw error;
      }
    },

    signOut: () => call<void>('POST', '/v1/auth/signout', { session: true }),

    myWorlds: () => call<{ worlds: World[] }>('GET', '/v1/operator/worlds', { session: true }),

    myWorld: (slug: string) =>
      call<{ world: World; audit: AuditEvent[] }>('GET', `/v1/operator/worlds/${seg(slug)}`, {
        session: true,
      }),

    register: (registration: Registration) =>
      call<{ world: World; key: string; verification: Verification }>(
        'POST',
        '/v1/operator/worlds',
        { body: registration, session: true },
      ),

    update: (slug: string, registration: Registration) =>
      call<{ world: World }>('PUT', `/v1/operator/worlds/${seg(slug)}`, {
        body: registration,
        session: true,
      }),

    withdraw: (slug: string) =>
      call<void>('DELETE', `/v1/operator/worlds/${seg(slug)}`, { session: true }),

    claim: (slug: string) =>
      call<{ world: World; key: string; verification: Verification }>(
        'POST',
        `/v1/operator/worlds/${seg(slug)}/claim`,
        { session: true },
      ),

    newVerification: (slug: string) =>
      call<{ verification: Verification }>(
        'POST',
        `/v1/operator/worlds/${seg(slug)}/verification`,
        { session: true },
      ),

    verifyPage: (slug: string, url: string) =>
      call<{ world: World; approval: Approval }>(
        'POST',
        `/v1/operator/worlds/${seg(slug)}/verify`,
        {
          body: { url },
          session: true,
        },
      ),

    setFederation: (slug: string, flag: 'on' | 'off') =>
      call<{ federation: Federation; approval?: Approval }>(
        'PUT',
        `/v1/operator/worlds/${seg(slug)}/federation`,
        { body: { flag }, session: true },
      ),

    rotateKey: (slug: string) =>
      call<{ key: string }>('POST', `/v1/operator/worlds/${seg(slug)}/key`, { session: true }),

    report: (report: { slug: string; reason: ReportReason; details: string }) =>
      call<{ report: Report }>('POST', '/v1/reports', { body: report, session: true }),

    myReports: () => call<{ reports: Report[] }>('GET', '/v1/operator/reports', { session: true }),

    adminReports: (state: 'open' | 'all' = 'open') =>
      call<{ reports: Report[] }>('GET', `/v1/admin/reports?state=${state}`, { session: true }),

    resolveReport: (id: string, action: 'dismiss' | 'revoke', note: string) =>
      call<{ report?: Report }>('POST', `/v1/admin/reports/${seg(id)}`, {
        body: { action, note },
        session: true,
      }),

    /** The person signed in, or null when nobody is. */
    async person(): Promise<Person | null> {
      try {
        return (await call<{ person: Person }>('GET', '/v1/person', { session: true })).person;
      } catch (error) {
        if (error instanceof HubError && error.status === 401) return null;
        throw error;
      }
    },

    /** Links the character a code was given for to the person signed in. */
    linkCharacter: (code: string) =>
      call<{ character: PersonCharacter; person: Person }>('POST', '/v1/person/link', {
        body: { code },
        session: true,
      }),

    unlinkCharacter: (address: string) =>
      call<void>('DELETE', `/v1/person/characters/${seg(address)}`, { session: true }),

    removePersonFriend: (handle: string) =>
      call<void>('DELETE', `/v1/person/friends/${seg(handle)}`, { session: true }),

    /** Forgets the person: each of its characters goes off the network, then its links, person
     * friends and sessions go (and, when it holds nothing else, its account). */
    forgetPerson: () => call<void>('DELETE', '/v1/person', { session: true }),

    /** A world's mirrors into Discord, and the rooms it may mirror. */
    worldMirrors: (slug: string) =>
      call<WorldMirrors>('GET', `/v1/operator/worlds/${seg(slug)}/discord/mirrors`, {
        session: true,
      }),

    /** Mirrors one of a world's rooms into Discord as `target` says, or moves its mirror there. */
    setWorldMirror: (slug: string, room: string, target: MirrorTarget) =>
      call<WorldMirrors>('PUT', `/v1/operator/worlds/${seg(slug)}/discord/mirrors/${seg(room)}`, {
        body: target,
        session: true,
      }),

    /** Stops mirroring one of a world's rooms into Discord. */
    stopWorldMirror: (slug: string, room: string) =>
      call<void>('DELETE', `/v1/operator/worlds/${seg(slug)}/discord/mirrors/${seg(room)}`, {
        session: true,
      }),

    /** Carries a world's Global room in one of its own rooms (`general`, `trade`, `lfg`,
     * `roleplay`), or in none (`off`), from now on. */
    setGlobalRoom: (slug: string, room: string) =>
      call<{ globalRoom: string | null }>('PUT', `/v1/operator/worlds/${seg(slug)}/global-room`, {
        body: { room },
        session: true,
      }),

    /** The hub's Discord settings, for its admins. */
    discordAdmin: () => call<DiscordAdmin>('GET', '/v1/admin/discord', { session: true }),

    /** The admins' own mirror of the Global room or of a network channel (`oldguard@channel`). */
    setNetworkMirror: (room: string, target: MirrorTarget) =>
      call<DiscordAdmin>('PUT', `/v1/admin/discord/mirrors/${seg(room)}`, {
        body: target,
        session: true,
      }),

    /** Stops the admins' own mirror of a room. */
    stopNetworkMirror: (room: string) =>
      call<void>('DELETE', `/v1/admin/discord/mirrors/${seg(room)}`, { session: true }),

    /** Takes away a world operator's mirror of a room. */
    takeWorldMirror: (slug: string, room: string) =>
      call<void>('DELETE', `/v1/admin/discord/worlds/${seg(slug)}/mirrors/${seg(room)}`, {
        session: true,
      }),

    /** The picture every mirrored line shows; null for each webhook's own. */
    setMirrorAvatar: (url: string | null) =>
      call<{ avatarUrl: string | null }>('PUT', '/v1/admin/discord/avatar', {
        body: { url },
        session: true,
      }),

    /** The hub's own Discord log, newest first: the admins' mirrors set and stopped, and the
     * picture set. */
    discordLog: () =>
      call<{ events: AuditEvent[] }>('GET', '/v1/admin/discord/log', { session: true }),

    /** The hub's settings, for its admins: each one's value, default and bounds. */
    hubSettings: () => call<HubSettings>('GET', '/v1/admin/settings', { session: true }),

    /** Sets any of the hub's settings, each by its name: the settings after. It holds at once. */
    setHubSettings: (changes: Partial<Record<HubSettingName, number>>) =>
      call<HubSettings>('PUT', '/v1/admin/settings', { body: changes, session: true }),

    /** The hub's settings log, newest first: each value set, and who set it. */
    hubSettingsLog: () =>
      call<{ events: AuditEvent[] }>('GET', '/v1/admin/settings/log', { session: true }),

    /** A page of the directory's listed characters. */
    directory(query: DirectoryQuery = {}) {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.world) params.set('world', query.world);
      if (query.levelMin !== undefined) params.set('level_min', String(query.levelMin));
      if (query.levelMax !== undefined) params.set('level_max', String(query.levelMax));
      if (query.heritage !== undefined) params.set('heritage', String(query.heritage));
      if (query.allegiance) params.set('allegiance', query.allegiance);
      if (query.sort && query.sort !== 'updated') params.set('sort', query.sort);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      if (query.offset) params.set('offset', String(query.offset));
      const q = params.toString();
      return call<DirectoryPage>('GET', `/v1/directory/characters${q ? `?${q}` : ''}`);
    },

    /** One listed character, or null: the hub answers every kind of absence alike. */
    async directoryCharacter(address: string): Promise<DirectoryCharacter | null> {
      try {
        const path = `/v1/directory/characters/${seg(address)}`;
        return (await call<{ character: DirectoryCharacter }>('GET', path)).character;
      } catch (error) {
        if (error instanceof HubError && error.status === 404) return null;
        throw error;
      }
    },

    /** An allegiance's listed members, highest rank first, or null when none is listed. */
    async directoryAllegiance(
      world: string,
      key: string,
      page: { limit?: number; offset?: number } = {},
    ): Promise<AllegiancePage | null> {
      const params = new URLSearchParams();
      if (page.limit !== undefined) params.set('limit', String(page.limit));
      if (page.offset) params.set('offset', String(page.offset));
      const q = params.toString();
      const path = `/v1/directory/allegiances/${seg(world)}/${seg(key)}${q ? `?${q}` : ''}`;
      try {
        return await call<AllegiancePage>('GET', path);
      } catch (error) {
        if (error instanceof HubError && error.status === 404) return null;
        throw error;
      }
    },
  };
}

export type Hub = ReturnType<typeof createHub>;

function refusal(response: Response, parsed: unknown): HubError {
  const error =
    parsed && typeof parsed === 'object' && 'error' in parsed
      ? ((parsed as { error: unknown }).error as Record<string, unknown> | null)
      : null;
  const code =
    typeof error?.code === 'string' ? error.code : (CODES[response.status] ?? 'REQUEST_FAILED');
  const message =
    typeof error?.message === 'string' && error.message
      ? error.message
      : `The hub answered ${response.status}.`;
  const reason = typeof error?.reason === 'string' ? error.reason : undefined;
  // Every 429 carries both, the same; the header is read only if the body lacks it (a proxy's
  // own 429, say).
  let retry: number | undefined =
    typeof error?.retryAfterSeconds === 'number' ? error.retryAfterSeconds : undefined;
  if (retry === undefined) {
    const header = Number(response.headers.get('Retry-After'));
    if (Number.isFinite(header) && header > 0) retry = header;
  }
  return new HubError(response.status, code, message, reason, retry);
}
