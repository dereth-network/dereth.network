// The hub's API client against a stubbed fetch: what it sends for each route, and how it reads
// the hub's answers and refusals.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HubError, createHub } from '../src/network/hub.ts';
import type { Registration } from '../src/network/hub.ts';

interface Sent {
  url: string;
  init: RequestInit;
}

function stub(...answers: (Response | Error)[]) {
  const sent: Sent[] = [];
  const fetch = async (url: string, init: RequestInit = {}) => {
    sent.push({ url, init });
    const answer = answers.shift() ?? new Response(null, { status: 204 });
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { sent, fetch };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const HUB = 'https://hub.example.org';

const registration: Registration = {
  slug: 'coldeve',
  name: 'Coldeve',
  description: 'A classic PvE world.',
  ruleset: 'PvE',
  region: 'US East',
  maturity: 'Unspecified',
  website: 'https://coldeve.example.org',
  discord: 'https://discord.gg/example',
  isDemo: false,
  endpoint: { mode: 'manual', address: 'play.coldeve.example.org', port: 9000 },
  emulator: { family: 'ACE', version: '1.77' },
};

test('the world list is read without the cookie, its search, filters and page in the query', async () => {
  const { sent, fetch } = stub(json(200, { data: [], total: 0, limit: 50, offset: 50 }));
  await createHub(HUB, fetch).worlds({
    q: 'cold eve',
    ruleset: 'PvP-lite',
    federation: 'on',
    limit: 50,
    offset: 50,
  });
  assert.equal(
    sent[0].url,
    `${HUB}/v1/servers?q=cold+eve&ruleset=PvP-lite&federation=on&limit=50&offset=50`,
  );
  assert.equal(sent[0].init.method, 'GET');
  assert.equal(sent[0].init.credentials, 'omit');
  assert.equal(sent[0].init.mode, 'cors');
  assert.equal(sent[0].init.body, undefined);
  assert.equal(sent[0].init.headers, undefined);
});

test('an empty search asks for the first page with no query at all', async () => {
  const { sent, fetch } = stub(json(200, { data: [] }));
  await createHub(HUB, fetch).worlds();
  assert.equal(sent[0].url, `${HUB}/v1/servers`);
});

test('a hub under a path, with or without its slash, joins its routes cleanly', async () => {
  const { sent, fetch } = stub(json(200, {}), json(200, {}));
  await createHub('https://dereth.network/hub/', fetch).config();
  await createHub('https://dereth.network/hub', fetch).config();
  assert.deepEqual(
    sent.map((s) => s.url),
    ['https://dereth.network/hub/v1/config', 'https://dereth.network/hub/v1/config'],
  );
});

// Each route the pages call: its method, its path, whether it carries the session, and its body.
const ROUTES: [
  string,
  (h: ReturnType<typeof createHub>) => Promise<unknown>,
  string,
  string,
  boolean,
  unknown?,
][] = [
  ['config', (h) => h.config(), 'GET', '/v1/config', false],
  ['one world', (h) => h.world('coldeve'), 'GET', '/v1/servers/coldeve', false],
  ['the network', (h) => h.network(), 'GET', '/v1/network', false],
  ['the totals', (h) => h.status(), 'GET', '/v1/status', false],
  ['sign out', (h) => h.signOut(), 'POST', '/v1/auth/signout', true],
  ['my worlds', (h) => h.myWorlds(), 'GET', '/v1/operator/worlds', true],
  ['my world', (h) => h.myWorld('coldeve'), 'GET', '/v1/operator/worlds/coldeve', true],
  ['register', (h) => h.register(registration), 'POST', '/v1/operator/worlds', true, registration],
  [
    'change',
    (h) => h.update('coldeve', registration),
    'PUT',
    '/v1/operator/worlds/coldeve',
    true,
    registration,
  ],
  ['withdraw', (h) => h.withdraw('coldeve'), 'DELETE', '/v1/operator/worlds/coldeve', true],
  ['claim', (h) => h.claim('coldeve'), 'POST', '/v1/operator/worlds/coldeve/claim', true],
  [
    'a new token',
    (h) => h.newVerification('coldeve'),
    'POST',
    '/v1/operator/worlds/coldeve/verification',
    true,
  ],
  [
    'verify by page',
    (h) => h.verifyPage('coldeve', 'https://coldeve.example.org/network.txt'),
    'POST',
    '/v1/operator/worlds/coldeve/verify',
    true,
    { url: 'https://coldeve.example.org/network.txt' },
  ],
  [
    'network on',
    (h) => h.setFederation('coldeve', 'on'),
    'PUT',
    '/v1/operator/worlds/coldeve/federation',
    true,
    { flag: 'on' },
  ],
  [
    'network off',
    (h) => h.setFederation('coldeve', 'off'),
    'PUT',
    '/v1/operator/worlds/coldeve/federation',
    true,
    { flag: 'off' },
  ],
  ['a new key', (h) => h.rotateKey('coldeve'), 'POST', '/v1/operator/worlds/coldeve/key', true],
  ['the person', (h) => h.person(), 'GET', '/v1/person', true],
  [
    'link a character',
    (h) => h.linkCharacter('K7QD-2MXP'),
    'POST',
    '/v1/person/link',
    true,
    { code: 'K7QD-2MXP' },
  ],
  [
    'unlink a character',
    (h) => h.unlinkCharacter('Sir Bob@coldeve'),
    'DELETE',
    '/v1/person/characters/Sir%20Bob%40coldeve',
    true,
  ],
  [
    'remove a person friend',
    (h) => h.removePersonFriend('Ann@frost'),
    'DELETE',
    '/v1/person/friends/Ann%40frost',
    true,
  ],
  ['forget me', (h) => h.forgetPerson(), 'DELETE', '/v1/person', true],
  [
    'a world’s mirrors into Discord',
    (h) => h.worldMirrors('coldeve'),
    'GET',
    '/v1/operator/worlds/coldeve/discord/mirrors',
    true,
  ],
  [
    'mirror a world’s room through the bot',
    (h) => h.setWorldMirror('coldeve', 'global', { channel: '1558376951000000101' }),
    'PUT',
    '/v1/operator/worlds/coldeve/discord/mirrors/global',
    true,
    { channel: '1558376951000000101' },
  ],
  [
    'mirror a world’s room through a webhook',
    (h) =>
      h.setWorldMirror('coldeve', 'general', {
        webhook: 'https://discord.com/api/webhooks/1558376954619629701/tok_en-1',
      }),
    'PUT',
    '/v1/operator/worlds/coldeve/discord/mirrors/general',
    true,
    { webhook: 'https://discord.com/api/webhooks/1558376954619629701/tok_en-1' },
  ],
  [
    'stop a world’s mirror',
    (h) => h.stopWorldMirror('coldeve', 'general'),
    'DELETE',
    '/v1/operator/worlds/coldeve/discord/mirrors/general',
    true,
  ],
  ['the hub’s Discord settings', (h) => h.discordAdmin(), 'GET', '/v1/admin/discord', true],
  [
    'the network’s mirror of a channel',
    (h) => h.setNetworkMirror('oldguard@channel', { channel: '1558376951000000101' }),
    'PUT',
    '/v1/admin/discord/mirrors/oldguard%40channel',
    true,
    { channel: '1558376951000000101' },
  ],
  [
    'stop the network’s mirror',
    (h) => h.stopNetworkMirror('global'),
    'DELETE',
    '/v1/admin/discord/mirrors/global',
    true,
  ],
  [
    'take a world’s mirror away',
    (h) => h.takeWorldMirror('coldeve', 'global'),
    'DELETE',
    '/v1/admin/discord/worlds/coldeve/mirrors/global',
    true,
  ],
  [
    'the picture mirrored lines show',
    (h) => h.setMirrorAvatar('https://dereth.network/media/art/emblem.png'),
    'PUT',
    '/v1/admin/discord/avatar',
    true,
    { url: 'https://dereth.network/media/art/emblem.png' },
  ],
  [
    'no picture',
    (h) => h.setMirrorAvatar(null),
    'PUT',
    '/v1/admin/discord/avatar',
    true,
    { url: null },
  ],
  ['the hub’s Discord log', (h) => h.discordLog(), 'GET', '/v1/admin/discord/log', true],
  ['the hub’s settings', (h) => h.hubSettings(), 'GET', '/v1/admin/settings', true],
  [
    'a change to the hub’s settings',
    (h) => h.setHubSettings({ approvalsPerDay: 400, pendingDays: 21 }),
    'PUT',
    '/v1/admin/settings',
    true,
    { approvalsPerDay: 400, pendingDays: 21 },
  ],
  ['the hub’s settings log', (h) => h.hubSettingsLog(), 'GET', '/v1/admin/settings/log', true],
  [
    'a listed character',
    (h) => h.directoryCharacter('Sir Bob@coldeve'),
    'GET',
    '/v1/directory/characters/Sir%20Bob%40coldeve',
    false,
  ],
  [
    'an allegiance’s members',
    (h) => h.directoryAllegiance('coldeve', 'k3Yq0pW9xLmN', { limit: 50, offset: 50 }),
    'GET',
    '/v1/directory/allegiances/coldeve/k3Yq0pW9xLmN?limit=50&offset=50',
    false,
  ],
  [
    'report',
    (h) => h.report({ slug: 'coldeve', reason: 'spam', details: 'Tells every minute.' }),
    'POST',
    '/v1/reports',
    true,
    { slug: 'coldeve', reason: 'spam', details: 'Tells every minute.' },
  ],
  ['my reports', (h) => h.myReports(), 'GET', '/v1/operator/reports', true],
  ['open reports', (h) => h.adminReports(), 'GET', '/v1/admin/reports?state=open', true],
  ['all reports', (h) => h.adminReports('all'), 'GET', '/v1/admin/reports?state=all', true],
  [
    'dismiss',
    (h) => h.resolveReport('rep_1', 'dismiss', 'Not abuse.'),
    'POST',
    '/v1/admin/reports/rep_1',
    true,
    { action: 'dismiss', note: 'Not abuse.' },
  ],
  [
    'revoke',
    (h) => h.resolveReport('rep_1', 'revoke', 'Impersonating Coldeve.'),
    'POST',
    '/v1/admin/reports/rep_1',
    true,
    { action: 'revoke', note: 'Impersonating Coldeve.' },
  ],
];

for (const [name, invoke, method, path, session, body] of ROUTES)
  test(`${name}: ${method} ${path}`, async () => {
    const { sent, fetch } = stub(json(200, {}));
    await invoke(createHub(HUB, fetch));
    const { url, init } = sent[0];
    assert.equal(url, HUB + path);
    assert.equal(init.method, method);
    assert.equal(init.credentials, session ? 'include' : 'omit');
    if (body === undefined) {
      assert.equal(init.body, undefined);
      assert.equal(init.headers, undefined, 'no body, so no Content-Type to preflight');
    } else {
      assert.deepEqual(init.headers, { 'Content-Type': 'application/json' });
      assert.deepEqual(JSON.parse(init.body as string), body);
    }
  });

test('slugs and report ids are escaped in the path', async () => {
  const { sent, fetch } = stub(json(200, {}), json(200, {}));
  const hub = createHub(HUB, fetch);
  await hub.verifyPage('a/b?c', 'https://x.example/');
  await hub.resolveReport('../x', 'dismiss', 'n');
  assert.equal(sent[0].url, `${HUB}/v1/operator/worlds/a%2Fb%3Fc/verify`);
  assert.equal(sent[1].url, `${HUB}/v1/admin/reports/..%2Fx`);
});

test('a registration answers with the world, its key and its verification', async () => {
  const answer = {
    world: { slug: 'coldeve', name: 'Coldeve' },
    key: 'drth_Ue3',
    verification: {
      token: 'dnv_q0Zx4l',
      expiresAt: '2026-10-18T18:05:02.000Z',
      page: { hosts: ['play.coldeve.example.org', 'coldeve.example.org'] },
      game: '@dn verify dnv_q0Zx4l',
    },
  };
  const { fetch } = stub(json(201, answer));
  assert.deepEqual(await createHub(HUB, fetch).register(registration), answer);
});

test('nobody signed in reads as null; the operator signed in as the operator', async () => {
  const operator = {
    id: 'op_5f0c9a2e41d7b3c8',
    discordId: '80351110224678912',
    name: 'Nelly',
    signedInAt: '2026-10-11T18:02:11.000Z',
    admin: false,
  };
  const { fetch } = stub(
    json(401, { error: { code: 'UNAUTHORIZED', message: 'Not signed in' } }),
    json(200, { operator }),
  );
  const hub = createHub(HUB, fetch);
  assert.equal(await hub.operator(), null);
  assert.deepEqual(await hub.operator(), operator);
});

test('a hub without sign-in is a refusal, not a signed-out visitor', async () => {
  const { fetch } = stub(json(503, { error: { code: 'UNAVAILABLE', message: 'Sign-in is off' } }));
  await assert.rejects(createHub(HUB, fetch).operator(), (e: unknown) => {
    assert.ok(e instanceof HubError);
    assert.equal(e.status, 503);
    assert.equal(e.code, 'UNAVAILABLE');
    return true;
  });
});

test('a failed verification carries its code, reason and message', async () => {
  const { fetch } = stub(
    json(422, {
      error: {
        code: 'VERIFICATION_FAILED',
        reason: 'token_not_found',
        message: 'The token was not on the page.',
      },
    }),
  );
  await assert.rejects(createHub(HUB, fetch).verifyPage('coldeve', 'https://x.example/'), {
    name: 'HubError',
    status: 422,
    code: 'VERIFICATION_FAILED',
    reason: 'token_not_found',
    message: 'The token was not on the page.',
  });
});

test('a rate limit carries its wait from the body, or else from Retry-After', async () => {
  const { fetch } = stub(
    json(
      429,
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many registrations today',
          retryAfterSeconds: 41230,
        },
      },
      { 'Retry-After': '41230' },
    ),
    // A 429 from something in front of the hub, without its error form.
    new Response('Too many requests', { status: 429, headers: { 'Retry-After': '120' } }),
  );
  const hub = createHub(HUB, fetch);
  await assert.rejects(hub.register(registration), {
    code: 'RATE_LIMITED',
    retryAfterSeconds: 41230,
  });
  await assert.rejects(hub.register(registration), {
    code: 'RATE_LIMITED',
    retryAfterSeconds: 120,
  });
});

test('a refused federation change carries the hub’s reason', async () => {
  const { fetch } = stub(
    json(409, { error: { code: 'CONFLICT', reason: 'not_verified', message: 'Not verified' } }),
    json(
      429,
      {
        error: {
          code: 'RATE_LIMITED',
          reason: 'rate_limited',
          message: 'No approvals left today',
          retryAfterSeconds: 3600,
        },
      },
      { 'Retry-After': '3600' },
    ),
  );
  const hub = createHub(HUB, fetch);
  await assert.rejects(hub.setFederation('coldeve', 'on'), {
    status: 409,
    code: 'CONFLICT',
    reason: 'not_verified',
  });
  await assert.rejects(hub.setFederation('coldeve', 'on'), {
    status: 429,
    reason: 'rate_limited',
    retryAfterSeconds: 3600,
  });
});

test('a refusal without the hub’s error form still has a code and a message', async () => {
  const { fetch } = stub(
    new Response('<html>Bad gateway</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    }),
    new Response('Not found', { status: 404 }),
  );
  const hub = createHub(HUB, fetch);
  await assert.rejects(hub.myWorlds(), {
    status: 502,
    code: 'REQUEST_FAILED',
    message: 'The hub answered 502.',
  });
  await assert.rejects(hub.myWorlds(), { status: 404, code: 'NOT_FOUND' });
});

test('an unreachable hub, or one that takes too long, is told apart from a refusal', async () => {
  const { fetch } = stub(
    new TypeError('Failed to fetch'),
    new DOMException('The operation timed out.', 'TimeoutError'),
  );
  const hub = createHub(HUB, fetch);
  await assert.rejects(hub.config(), { status: 0, code: 'NETWORK' });
  await assert.rejects(hub.config(), { status: 0, code: 'TIMEOUT' });
});

test('every request can be given up on', async () => {
  const { sent, fetch } = stub(json(200, {}));
  await createHub(HUB, fetch).config();
  assert.ok(sent[0].init.signal instanceof AbortSignal);
});

test('an answer with no body resolves to nothing', async () => {
  const { fetch } = stub(new Response(null, { status: 204 }), new Response(null, { status: 204 }));
  const hub = createHub(HUB, fetch);
  assert.equal(await hub.signOut(), undefined);
  assert.equal(await hub.withdraw('coldeve'), undefined);
});

test('a success the page cannot read is said so', async () => {
  const { fetch } = stub(new Response('<html></html>', { status: 200 }));
  await assert.rejects(createHub(HUB, fetch).myWorlds(), { status: 200, code: 'BAD_RESPONSE' });
});

test('sign-in goes to the route the hub names, coming back to the page', () => {
  const hub = createHub(HUB, stub().fetch);
  const config = { baseDomain: 'dereth.network', heartbeatTtlSeconds: 180, authEnabled: true };
  assert.equal(
    hub.signInUrl({ ...config, signIn: '/v1/auth/discord' }, '/operators/?claim=coldeve'),
    `${HUB}/v1/auth/discord?return=%2Foperators%2F%3Fclaim%3Dcoldeve`,
  );
  assert.equal(hub.signInUrl(config, '/report/'), `${HUB}/v1/auth/discord?return=%2Freport%2F`);
  assert.equal(
    hub.signInUrl({ ...config, signIn: 'https://elsewhere.example/' }, '/'),
    `${HUB}/v1/auth/discord?return=%2F`,
    'only a route on the hub itself',
  );
  assert.equal(
    hub.signInUrl(config, '/link/', 'https://dev.dereth.network'),
    `${HUB}/v1/auth/discord?return=%2Flink%2F&site=https%3A%2F%2Fdev.dereth.network`,
    'the site it was started from, for the hub to return to',
  );
});

test('nobody signed in is no person, not a failure', async () => {
  const { fetch } = stub(json(401, { error: { code: 'UNAUTHORIZED', message: 'Sign in first' } }));
  assert.equal(await createHub(HUB, fetch).person(), null);
});

test('a code the hub never gave, a spent one and a lapsed one are one refusal', async () => {
  const { fetch } = stub(
    json(422, {
      error: {
        code: 'LINK_FAILED',
        reason: 'no_such_code',
        message: 'That code is not one the hub gave, or it has been used or has lapsed',
      },
    }),
  );
  await assert.rejects(createHub(HUB, fetch).linkCharacter('0000-0000'), {
    name: 'HubError',
    status: 422,
    code: 'LINK_FAILED',
    reason: 'no_such_code',
  });
});

test('a directory search is read without the cookie, its fields named as the hub names them', async () => {
  const { sent, fetch } = stub(json(200, { data: [] }), json(200, { data: [] }));
  const hub = createHub(HUB, fetch);
  await hub.directory({
    q: 'sir bo',
    world: 'coldeve',
    levelMin: 100,
    levelMax: 200,
    heritage: 1,
    allegiance: 'order of',
    sort: 'level',
    limit: 50,
    offset: 50,
  });
  assert.equal(
    sent[0].url,
    `${HUB}/v1/directory/characters?q=sir+bo&world=coldeve&level_min=100&level_max=200&heritage=1&allegiance=order+of&sort=level&limit=50&offset=50`,
  );
  assert.equal(sent[0].init.credentials, 'omit');
  await hub.directory({ sort: 'updated', offset: 0 });
  assert.equal(sent[1].url, `${HUB}/v1/directory/characters`, 'the default sort and page');
});

test('every kind of absence from the directory reads as no character, and no allegiance', async () => {
  const absent = () =>
    json(404, { error: { code: 'NOT_FOUND', message: 'No such character in the directory' } });
  const { fetch } = stub(absent(), absent());
  const hub = createHub(HUB, fetch);
  assert.equal(await hub.directoryCharacter('Nobody@coldeve'), null);
  assert.equal(await hub.directoryAllegiance('coldeve', 'no-such-key'), null);
});

test('a directory answer that is not absence is still a refusal', async () => {
  const { fetch } = stub(
    json(429, { error: { code: 'RATE_LIMITED', message: 'Slow down', retryAfterSeconds: 20 } }),
    new TypeError('Failed to fetch'),
  );
  const hub = createHub(HUB, fetch);
  await assert.rejects(hub.directory({ q: 'bob' }), { status: 429, retryAfterSeconds: 20 });
  await assert.rejects(hub.directoryCharacter('Sir Bob@coldeve'), { code: 'NETWORK' });
});

test('a listed character is its own answer', async () => {
  const character = { address: 'Sir Bob@coldeve', name: 'Sir Bob', level: 126 };
  const { fetch } = stub(json(200, { character }));
  assert.deepEqual(await createHub(HUB, fetch).directoryCharacter('Sir Bob@coldeve'), character);
});
