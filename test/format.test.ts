// What the pages say: slugs, statuses, links, the hub's refusals, where an operator's world
// stands, how a report ended, a world's history, and the registration body the form sends.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  actorText,
  addressUnproven,
  auditText,
  connectAddress,
  explain,
  fieldsOf,
  isNetworkSlug,
  isRegistrySlug,
  networkState,
  readLinkCode,
  reportOutcome,
  safeLink,
  slugAdvice,
  stage,
  statusLine,
  toRegistration,
  waitText,
} from '../src/network/format.ts';
import { HubError } from '../src/network/hub.ts';
import type { NetworkWorld, World } from '../src/network/hub.ts';

const world = (extra: Partial<World> = {}): World => ({
  slug: 'coldeve',
  name: 'Coldeve',
  ruleset: 'PvE',
  ...extra,
});

test('a network slug is 2 to 12 of a-z, 0-9 and inner hyphens, and not kept back', () => {
  for (const ok of ['coldeve', 'ab', 'old-guard', 'a1-b2-c3', 'twelve-chars'])
    assert.ok(isNetworkSlug(ok), ok);
  for (const no of [
    'a',
    'thirteen-char',
    'Coldeve',
    'cold--eve',
    '-cold',
    'cold-',
    'cold_eve',
    'darktide',
    'channel',
    'localhost',
  ])
    assert.ok(!isNetworkSlug(no), no);
});

test('a registry slug may be up to 40 characters', () => {
  assert.ok(isRegistrySlug('a'.repeat(40)));
  assert.ok(!isRegistrySlug('a'.repeat(41)));
  assert.ok(isRegistrySlug('darktide'), 'a retail name can be listed');
});

test('the slug hint says whether the world can join the network', () => {
  assert.equal(slugAdvice(''), null);
  assert.deepEqual(slugAdvice('coldeve'), {
    ok: true,
    text: 'Players there will be Name@coldeve.',
  });
  assert.equal(slugAdvice('coldeve-classic-pve')?.ok, false);
  assert.match(slugAdvice('coldeve-classic-pve')!.text, /can.t join the network/);
  assert.match(slugAdvice('darktide')!.text, /kept back/);
  assert.match(slugAdvice('Cold Eve')!.text, /lower-case/);
});

test('only http and https links without credentials are drawn', () => {
  assert.equal(safeLink('https://coldeve.example.org'), 'https://coldeve.example.org/');
  assert.equal(safeLink('http://discord.gg/x'), 'http://discord.gg/x');
  assert.equal(safeLink('javascript:alert(1)'), null);
  assert.equal(safeLink('data:text/html,hi'), null);
  assert.equal(safeLink('https://user:pw@example.org/'), null);
  assert.equal(safeLink('not a url'), null);
  assert.equal(safeLink(null), null);
});

test('a world’s status reads as a state and a count of players', () => {
  const at = (state: string, playersOnline: number | null = null) =>
    statusLine(world({ status: { state, playersOnline, lastSeenAt: null } as World['status'] }));
  assert.deepEqual(at('online', 42), { tone: 'online', text: 'Online · 42 players' });
  assert.deepEqual(at('online', 1), { tone: 'online', text: 'Online · 1 player' });
  assert.deepEqual(at('online', 0), { tone: 'online', text: 'Online · 0 players' });
  assert.deepEqual(at('online'), { tone: 'online', text: 'Online' });
  assert.equal(at('degraded', 3).tone, 'busy');
  assert.equal(at('maintenance').tone, 'busy');
  assert.deepEqual(at('offline'), { tone: 'offline', text: 'Offline' });
  assert.equal(at('stale').tone, 'quiet');
  assert.equal(statusLine(world()).tone, 'quiet');
});

test('a world on the network is linked or not by the hub’s list of links', () => {
  const links = new Map<string, NetworkWorld>([
    ['coldeve', { slug: 'coldeve', name: 'Coldeve', online: true }],
    ['frost', { slug: 'frost', name: 'Frost', online: false }],
  ]);
  assert.equal(networkState(world({ federation: 'on' }), links), 'linked');
  assert.equal(networkState(world({ slug: 'frost', federation: 'on' }), links), 'unlinked');
  assert.equal(networkState(world({ slug: 'vanity', federation: 'on' }), links), 'unlinked');
  assert.equal(networkState(world({ slug: 'vanity', federation: 'off' }), links), 'off');
  assert.equal(networkState(world({ slug: 'vanity', federation: 'unset' }), links), 'off');
  assert.equal(networkState(world({ federation: 'on' }), null), 'on', 'links unknown');
  assert.equal(networkState(world({ federation: 'unset' }), null), 'off');
});

test('a fixed address is written for a launcher, an IPv6 one in brackets', () => {
  assert.equal(
    connectAddress(
      world({ endpoint: { mode: 'manual', address: 'play.example.org', port: 9000 } }),
    ),
    'play.example.org:9000',
  );
  assert.equal(
    connectAddress(world({ endpoint: { mode: 'manual', address: '2001:db8::1', port: 9000 } })),
    '[2001:db8::1]:9000',
  );
  assert.equal(
    connectAddress(world({ endpoint: { mode: 'observed', address: null, port: 9000 } })),
    null,
  );
});

test('a wait is said in rough words', () => {
  assert.equal(waitText(30), 'a minute');
  assert.equal(waitText(600), 'about 10 minutes');
  assert.equal(waitText(3600), 'about an hour');
  assert.equal(waitText(41230), 'about 11 hours');
});

test('each of the hub’s refusals reads plainly', () => {
  const err = (status: number, code: string, message = '', reason?: string, retry?: number) =>
    new HubError(status, code, message, reason, retry);
  assert.match(
    explain(err(422, 'VERIFICATION_FAILED', 'x', 'token_not_found')),
    /didn.t find the token on that page/,
  );
  assert.match(explain(err(422, 'VERIFICATION_FAILED', 'x', 'expired')), /expired/);
  assert.match(explain(err(422, 'VERIFICATION_FAILED', 'x', 'host_mismatch')), /own host/);
  assert.equal(
    explain(err(422, 'VERIFICATION_FAILED', 'Something new.', 'a_new_reason')),
    'Something new.',
    'a reason this page does not know keeps the hub’s message',
  );
  assert.equal(
    explain(err(429, 'RATE_LIMITED', 'Too many registrations today', undefined, 41230)),
    'Too many registrations today. Try again in about 11 hours.',
  );
  assert.equal(explain(err(429, 'RATE_LIMITED', 'Slow down.')), 'Slow down.');
  assert.match(
    explain(err(422, 'LINK_FAILED', 'x', 'no_such_code')),
    /dn link in game for a new one/,
  );
  assert.match(explain(err(409, 'CONFLICT', 'x', 'too_many_characters')), /Unlink one first/);
  assert.match(explain(err(0, 'NETWORK')), /couldn.t be reached/);
  assert.match(explain(err(401, 'UNAUTHORIZED', 'Not signed in')), /signed out/);
  assert.match(explain(err(503, 'UNAVAILABLE', 'x')), /Sign-in isn.t open/);
  assert.equal(explain(err(409, 'CONFLICT', 'the slug is taken')), 'The slug is taken.');
  assert.equal(
    explain(err(400, 'INVALID_REQUEST', 'slug: use 2-40 lowercase letters')),
    'Slug: use 2-40 lowercase letters.',
  );
  assert.match(explain(err(500, 'INTERNAL_ERROR', 'An internal error occurred')), /had a problem/);
  assert.match(explain(err(502, 'REQUEST_FAILED', 'The hub answered 502.')), /had a problem/);
  assert.match(explain(new Error('boom')), /Reload/);
});

test('an operator’s world stands where its ownership, proof and network put it', () => {
  const op = (extra: Partial<NonNullable<World['operator']>> = {}) => ({
    role: 'owner' as const,
    verification: null,
    key: null,
    locked: null,
    ...extra,
  });
  const verified = {
    method: 'game' as const,
    verifiedAt: '2026-10-11T18:20:40.000Z',
    endpointVerified: true,
    open: false,
    expiresAt: null,
  };
  const managed = { state: 'managed' as const, verifiedAt: verified.verifiedAt };
  assert.equal(
    stage(world({ ownership: { state: 'pending', verifiedAt: null }, operator: op() })),
    'pending',
  );
  assert.equal(
    stage(
      world({
        ownership: { state: 'unclaimed', verifiedAt: null },
        operator: op({ role: 'claimant' }),
      }),
    ),
    'claim',
  );
  assert.equal(
    stage(world({ ownership: managed, operator: op({ locked: { at: 'x', reason: 'y' } }) })),
    'locked',
  );
  assert.equal(
    stage(
      world({
        ownership: managed,
        operator: op({ verification: { ...verified, endpointVerified: false } }),
      }),
    ),
    'reverify',
  );
  assert.equal(
    stage(
      world({ ownership: managed, federation: 'on', operator: op({ verification: verified }) }),
    ),
    'on',
  );
  assert.equal(
    stage(
      world({ ownership: managed, federation: 'unset', operator: op({ verification: verified }) }),
    ),
    'off',
  );
  assert.equal(
    stage(
      world({
        slug: 'coldeve-classic-pve',
        ownership: managed,
        federation: 'unset',
        operator: op({ verification: verified }),
      }),
    ),
    'off-network-slug',
  );
});

test('the form sends the registration body as the hub takes it', () => {
  const fields = {
    slug: ' coldeve ',
    name: 'Coldeve ',
    description: 'A classic PvE world.',
    ruleset: 'PvE',
    region: 'US East',
    maturity: '',
    website: 'https://coldeve.example.org',
    discord: 'https://discord.gg/example',
    isDemo: false,
    mode: 'manual' as const,
    address: 'play.coldeve.example.org',
    port: '9000',
    addressFamily: 'ipv4',
    family: 'ACE',
    version: '1.77',
  };
  assert.deepEqual(toRegistration(fields), {
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
  });
  const observed = toRegistration({
    ...fields,
    mode: 'observed',
    addressFamily: 'ipv6',
    region: ' ',
    website: '',
    discord: '',
    version: '',
  });
  assert.deepEqual(observed.endpoint, { mode: 'observed', port: 9000, addressFamily: 'ipv6' });
  assert.equal(observed.region, 'Unspecified');
  assert.ok(!('website' in observed) && !('discord' in observed), 'blank links are left out');
  assert.deepEqual(observed.emulator, { family: 'ACE' });
});

test('a world’s registration round-trips through the form', () => {
  const listed = world({
    description: 'A classic PvE world.',
    region: 'US East',
    maturity: 'Unspecified',
    website: 'https://coldeve.example.org',
    discord: null,
    isDemo: true,
    endpoint: { mode: 'manual', address: 'play.coldeve.example.org', port: 9000 },
    emulator: { family: 'ACE', version: '1.77' },
  });
  assert.deepEqual(toRegistration(fieldsOf(listed)), {
    slug: 'coldeve',
    name: 'Coldeve',
    description: 'A classic PvE world.',
    ruleset: 'PvE',
    region: 'US East',
    maturity: 'Unspecified',
    website: 'https://coldeve.example.org',
    isDemo: true,
    endpoint: { mode: 'manual', address: 'play.coldeve.example.org', port: 9000 },
    emulator: { family: 'ACE', version: '1.77' },
  });
  assert.equal(fieldsOf(null).family, 'ACE', 'a new world starts as an ACE world');
});

test('a refused federation change says why, and a spent allowance says when', () => {
  const refusal = (status: number, code: string, reason: string, retry?: number) =>
    explain(new HubError(status, code, 'x', reason, retry));
  assert.match(refusal(409, 'CONFLICT', 'not_verified'), /Prove you run the world first/);
  assert.match(refusal(409, 'CONFLICT', 'not_network_slug'), /longer than 12 characters/);
  assert.match(refusal(409, 'CONFLICT', 'locked'), /locked/);
  assert.equal(
    refusal(429, 'RATE_LIMITED', 'rate_limited', 41230),
    'Today’s approvals are used up, so the network stays off for now. Try again in about 11 hours.',
  );
});

test('a report reads as open, or as how it ended', () => {
  assert.deepEqual(reportOutcome({ state: 'open', resolution: null }), {
    tone: 'wait',
    text: 'Open',
  });
  assert.equal(reportOutcome({ state: 'closed', resolution: 'revoked' }).text, 'World revoked');
  assert.equal(reportOutcome({ state: 'closed', resolution: 'dismissed' }).text, 'Dismissed');
  assert.equal(reportOutcome({ state: 'closed', resolution: null }).text, 'Closed');
});

test('the public list says when a verified world’s new address isn’t proven yet', () => {
  const managed = (endpointVerified?: boolean) =>
    world({ ownership: { state: 'managed', verifiedAt: 'x', endpointVerified } });
  assert.equal(addressUnproven(managed(false)), true);
  assert.equal(addressUnproven(managed(true)), false);
  assert.equal(addressUnproven(managed(undefined)), false, 'a hub that does not say');
  assert.equal(
    addressUnproven(
      world({ ownership: { state: 'unclaimed', verifiedAt: null, endpointVerified: false } }),
    ),
    false,
    'a community listing was never proven',
  );
});

test('a world’s history names who did each thing, and what it records', () => {
  const me = 'op_5f0c9a2e41d7b3c8';
  assert.equal(actorText(me, me), 'you');
  assert.equal(actorText('op_9a7e33b0c2d14f68', me), 'another operator');
  assert.equal(actorText('hub', me), 'the hub');
  assert.equal(actorText('world', me), 'the world');
  assert.equal(actorText('hub-operator', me), 'the hub’s operator');
  assert.equal(actorText('earlier-claimant', me), 'an earlier claimant');
  assert.equal(actorText('hub-admin', me), 'a hub admin');
  assert.equal(actorText(me, null), 'another operator');
  assert.equal(
    auditText(
      {
        kind: 'verified',
        at: '2026-10-11T18:20:40.000Z',
        actor: me,
        details: { method: 'game', by: 'Asheron' },
      },
      me,
    ),
    'verified by you (method: game, by: Asheron)',
  );
  assert.equal(
    auditText(
      {
        kind: 'federation_set',
        at: '2026-10-11T18:20:41.000Z',
        actor: 'hub',
        details: { flag: 'on', nested: { ignored: true } },
      },
      me,
    ),
    'federation set by the hub (flag: on)',
  );
  assert.equal(
    auditText(
      { kind: 'key_rotated', at: '2026-10-11T18:20:42.000Z', actor: me, details: null },
      me,
    ),
    'key rotated by you',
  );
});

test('an observed endpoint keeps its address family through the form', () => {
  const observed = world({
    endpoint: { mode: 'observed', address: null, port: 9000, addressFamily: 'ipv6' },
  });
  assert.deepEqual(toRegistration(fieldsOf(observed)).endpoint, {
    mode: 'observed',
    port: 9000,
    addressFamily: 'ipv6',
  });
  const fixed = world({
    endpoint: { mode: 'manual', address: 'play.example.org', port: 9000, addressFamily: null },
  });
  assert.deepEqual(toRegistration(fieldsOf(fixed)).endpoint, {
    mode: 'manual',
    address: 'play.example.org',
    port: 9000,
  });
});

test('a link code is read however it was typed, and anything else is refused', () => {
  for (const typed of ['K7QD-2MXP', 'k7qd-2mxp', ' K7QD 2MXP ', 'k7qd2mxp', 'K7-QD-2M-XP'])
    assert.equal(readLinkCode(typed), 'K7QD-2MXP', typed);
  assert.equal(readLinkCode('ilo0-1111'), '1100-1111');
  for (const bad of ['', 'K7QD-2MX', 'K7QD-2MXPQ', 'K7QD-2MXU', 'K7QD-2MX!', 'K7QD-2MXÉ'])
    assert.equal(readLinkCode(bad), null, bad);
});
