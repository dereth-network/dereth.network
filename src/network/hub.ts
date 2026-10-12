// The hub's API, as the network pages call it from the browser. The public routes (the world
// list, the network's worlds) are read without the hub's cookie; the operator routes carry it
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

/** One of a person's characters. */
export interface PersonCharacter {
  address: string;
  world: { slug: string; name: string | null };
  linkedAt: string;
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
  alts: 'hidden' | 'shown';
  characters: PersonCharacter[];
  friends: PersonFriend[];
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

    setAlts: (shown: boolean) =>
      call<{ person: Person }>('PUT', '/v1/person/alts', { body: { shown }, session: true }),

    removePersonFriend: (handle: string) =>
      call<void>('DELETE', `/v1/person/friends/${seg(handle)}`, { session: true }),

    /** Forgets the person: its links, person friends and setting (and, when it holds nothing
     * else, its account and session). */
    forgetPerson: () => call<void>('DELETE', '/v1/person', { session: true }),
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
