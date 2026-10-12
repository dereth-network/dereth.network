// What the pages show and do about Discord, against a stubbed hub: a world's rooms mirrored into
// its operator's Discord server and the room that carries its Global chat, the hub's settings its admins keep, each refusal in plain words, a
// webhook's address never shown back, and none of it on a hub without Discord's bot.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  avatarProblem,
  avatarView,
  channelId,
  discordFeatures,
  globalRoomView,
  hubDiscordView,
  keepAfterRefusal,
  mirrorNetworkRoom,
  mirrorTarget,
  mirrorWorldRoom,
  networkChannel,
  channelMirrorsView,
  networkGlobalView,
  setAvatar,
  setGlobalRoom,
  stopNetworkMirror,
  stopWorldMirror,
  takeWorldMirror,
  worldMirrorsView,
  worldsMirrorsView,
} from '../src/network/discord.ts';
import { auditText } from '../src/network/format.ts';
import { HubError, createHub } from '../src/network/hub.ts';
import type {
  DiscordAdmin,
  DiscordMirror,
  HubConfig,
  World,
  WorldMirrors,
} from '../src/network/hub.ts';
import { controlsOf, linksOf, textOf } from '../src/network/view.ts';
import type { View, ViewElement } from '../src/network/view.ts';

const HUB = 'https://hub.example.org';

/** A hub whose every answer is `answers` in turn, and what it was asked. */
function hubAnswering(...answers: Response[]) {
  const asked: { url: string; method: string; body: unknown }[] = [];
  const hub = createHub(HUB, async (url: string, init: RequestInit = {}) => {
    asked.push({
      url,
      method: init.method ?? 'GET',
      body: init.body === undefined ? undefined : JSON.parse(init.body as string),
    });
    return answers.shift() ?? new Response(null, { status: 204 });
  });
  return { hub, asked };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const refusal = (status: number, code: string, message: string, extra: object = {}) =>
  json(status, { error: { code, message, ...extra } });

const config = (broker?: HubConfig['broker'], authEnabled = true): HubConfig => ({
  baseDomain: 'dereth.network',
  heartbeatTtlSeconds: 180,
  authEnabled,
  signIn: '/v1/auth/discord',
  ...(broker ? { broker } : {}),
});

const BROKER = { discordTells: true, mirrors: true };

const acts = (view: View) => controlsOf(view).map((c) => c.act);

/** A view's text with its parts' spacing evened out. */
const plain = (view: View) => textOf(view).replace(/\s+/g, ' ');

/** Every element of `tag` a view holds, in order. */
function elementsOf(view: View, tag: string): ViewElement[] {
  if (typeof view !== 'object' || view === null || !('tag' in view)) return [];
  return [...(view.tag === tag ? [view] : []), ...view.children.flatMap((c) => elementsOf(c, tag))];
}

// ---- none of it without Discord's bot ------------------------------------------------------------

test('a hub without Discord’s bot offers no tells or mirrors, so the pages show none', () => {
  const none = { tells: false, mirrors: false };
  assert.deepEqual(discordFeatures(config()), none, 'a hub older than the bot');
  assert.deepEqual(
    discordFeatures(config({ discordTells: false, mirrors: false })),
    none,
    'a hub that has no bot token',
  );
  assert.deepEqual(discordFeatures(config(BROKER, false)), none, 'a hub without sign-in');
  assert.deepEqual(discordFeatures(null), none, 'before the hub answered');
  assert.deepEqual(discordFeatures(config(BROKER)), { tells: true, mirrors: true });
  assert.deepEqual(
    discordFeatures(config({ ...BROKER, discordTells: false })),
    { tells: false, mirrors: true },
    'a bot that carries no tells still mirrors rooms',
  );
});

// ---- rooms mirrored into Discord ------------------------------------------------------------------

const CHANNEL = '1558376951000000101';
const SERVER = '1558376951000000000';
const TOKEN = 'Xy-12_secretTOKEN';
const WEBHOOK = `https://discord.com/api/webhooks/1558376954619629701/${TOKEN}`;

const world: World = { slug: 'coldeve', name: 'Coldeve', ruleset: 'PvE', federation: 'on' };

const mirror = (room: string, extra: Partial<DiscordMirror> = {}): DiscordMirror => ({
  room,
  channel: CHANNEL,
  server: SERVER,
  through: 'bot',
  webhook: '1558376954619629700',
  setAt: '2026-10-12T18:20:40.000Z',
  lines: { toDiscord: 108, heldBackToDiscord: 0, notCarried: 1 },
  ...extra,
});

const INVITE = 'https://discord.com/oauth2/authorize?client_id=1&scope=bot&permissions=0';

const mirrors = (...list: DiscordMirror[]): WorldMirrors => ({
  mirrors: list,
  rooms: ['global', 'general', 'trade', 'lfg', 'roleplay'],
  invite: INVITE,
});

const TELLS = {
  toDiscord: 12,
  fromDiscord: 4,
  heldBackToDiscord: 1,
  heldBackFromDiscord: 0,
  notCarried: 2,
  replyWindows: 3,
};

const admin = (...list: DiscordMirror[]): DiscordAdmin => ({
  invite: INVITE,
  avatarUrl: null,
  mirrors: list,
  tells: TELLS,
});

/** Asks to mirror `room` of the world where `typed` says, with the hub answering `answer`: what
 * the page says, the state left as it was. */
async function refusedWith(answer: Response, typed = CHANNEL, state = mirrors()) {
  const { hub } = hubAnswering(answer);
  const outcome = await mirrorWorldRoom(hub, 'coldeve', 'global', typed, state);
  assert.equal(outcome.said.kind, 'error');
  assert.equal(outcome.state, state, 'the mirrors as they were');
  assert.ok(outcome.error instanceof HubError);
  return outcome.said.text;
}

test('a channel is taken by its id or a link to it, and a webhook by its address', () => {
  assert.equal(channelId(` ${CHANNEL} `), CHANNEL);
  for (const host of ['discord.com', 'ptb.discord.com', 'canary.discordapp.com', 'Discord.com'])
    assert.equal(channelId(`https://${host}/channels/${SERVER}/${CHANNEL}`), CHANNEL, host);
  assert.equal(channelId(`https://discord.com/channels/${SERVER}/${CHANNEL}/1234`), CHANNEL);
  assert.equal(channelId('#general'), null);
  assert.equal(channelId(`https://discord.com/channels/@me/${CHANNEL}`), null, 'a direct message');
  assert.equal(channelId(`https://example.org/channels/${SERVER}/${CHANNEL}`), null);
  assert.deepEqual(mirrorTarget(` ${WEBHOOK} `), { target: { webhook: WEBHOOK } });
  const versioned = `https://canary.discord.com/api/v10/webhooks/1558376954619629701/${TOKEN}`;
  assert.deepEqual(mirrorTarget(versioned), { target: { webhook: versioned } });
  assert.deepEqual(mirrorTarget(`https://discord.com/channels/${SERVER}/${CHANNEL}`), {
    target: { channel: CHANNEL },
  });
});

test('a field that names no channel or webhook is refused before the hub is asked', async () => {
  const problems = {
    '': /Paste the channel’s link or id, or a webhook’s address/,
    general: /isn’t a Discord channel’s link or id, or a webhook’s address/,
    [`https://example.org/api/webhooks/1/${TOKEN}`]: /isn’t a Discord webhook’s address/,
    [`${WEBHOOK}?wait=true`]: /isn’t a Discord webhook’s address/,
    [WEBHOOK.replace('https:', 'http:')]: /isn’t a Discord webhook’s address/,
  };
  for (const [typed, said] of Object.entries(problems)) {
    const { hub, asked } = hubAnswering();
    const outcome = await mirrorWorldRoom(hub, 'coldeve', 'global', typed, mirrors());
    assert.equal(outcome.said.kind, 'error', typed);
    assert.match(outcome.said.text, said, typed);
    assert.doesNotMatch(outcome.said.text, new RegExp(TOKEN), 'the address is not said back');
    assert.deepEqual(asked, [], `nothing sent for ${typed}`);
  }
});

test('mirroring a room through the bot asks the hub for its channel, and shows its answer', async () => {
  const after = mirrors(mirror('global', { webhook: null }));
  const { hub, asked } = hubAnswering(json(200, after));
  const link = `https://discord.com/channels/${SERVER}/${CHANNEL}`;
  const outcome = await mirrorWorldRoom(hub, 'coldeve', 'global', link, mirrors());
  assert.deepEqual(asked, [
    {
      url: `${HUB}/v1/operator/worlds/coldeve/discord/mirrors/global`,
      method: 'PUT',
      body: { channel: CHANNEL },
    },
  ]);
  assert.deepEqual(outcome.state, after);
  assert.deepEqual(outcome.said, {
    kind: 'ok',
    text: `Global is mirrored into the channel ${CHANNEL}, through the bot.`,
  });
});

test('a webhook’s address is sent once and never shown back: not said, not in the redrawn view', async () => {
  const after = mirrors(mirror('general', { through: 'webhook', webhook: '1558376954619629701' }));
  const { hub, asked } = hubAnswering(json(200, after));
  const outcome = await mirrorWorldRoom(hub, 'coldeve', 'general', WEBHOOK, mirrors());
  assert.deepEqual(asked[0].body, { webhook: WEBHOOK });
  assert.equal(outcome.said.kind, 'ok');
  assert.match(outcome.said.text, /keeps its address secret, so it isn’t shown here again/);
  const view = worldMirrorsView(world, outcome.state);
  for (const shown of [outcome.said.text, JSON.stringify(view)]) {
    assert.ok(!shown.includes(WEBHOOK), 'no address');
    assert.ok(!shown.includes(TOKEN), 'no token');
  }
  assert.match(textOf(view), /General Chat Through a webhook Into the channel/);
  const fields = elementsOf(view, 'input').filter((i) => i.attrs.name === 'target');
  assert.equal(fields.length, 5, 'one for each room');
  for (const field of fields) {
    assert.equal(field.attrs.value, undefined, 'each starts empty');
    assert.equal(field.attrs.autocomplete, 'off', 'and the browser keeps nothing typed in it');
  }
  for (const form of elementsOf(view, 'form'))
    assert.equal(form.attrs.method, 'post', 'a form never puts its fields in an address');
});

test('after a refusal a field keeps a channel to try again, and never a webhook’s address', () => {
  assert.equal(keepAfterRefusal(` ${CHANNEL} `), CHANNEL);
  const link = `https://discord.com/channels/${SERVER}/${CHANNEL}`;
  assert.equal(keepAfterRefusal(link), link);
  assert.equal(keepAfterRefusal(WEBHOOK), '');
  assert.equal(keepAfterRefusal(`${WEBHOOK}?wait=true`), '');
  assert.equal(keepAfterRefusal('anything else'), '');
});

test('a channel the bot cannot see says how to add the bot and grant it the channel', async () => {
  const text = await refusedWith(
    refusal(409, 'CONFLICT', 'The hub’s bot cannot see this Discord channel', {
      reason: 'bot_cannot_see',
    }),
  );
  assert.match(text, /^The hub’s bot can’t see that channel\. Add the bot to the channel’s server/);
  assert.match(
    text,
    /under Permissions, add the bot and allow it View Channel and Manage Webhooks/,
  );
});

test('a channel the operator may not manage says to use one they may', async () => {
  const text = await refusedWith(
    refusal(403, 'FORBIDDEN', 'You may not manage this Discord channel’s webhooks', {
      reason: 'not_your_channel',
    }),
  );
  assert.match(text, /can’t manage that channel’s webhooks/);
  assert.match(text, /Use a channel of a server where you have View Channel and Manage Webhooks/);
});

test('a bot lacking permissions is told which, and where to grant them', async () => {
  const text = await refusedWith(
    refusal(
      409,
      'CONFLICT',
      "The hub's bot lacks View Channel, Manage Webhooks on this Discord channel: give it them there (the channel's settings, Permissions)",
      { reason: 'bot_lacks_permissions' },
    ),
  );
  assert.match(text, /lacks View Channel and Manage Webhooks on the channel\./);
  assert.match(text, /In the channel’s settings, under Permissions, add the bot/);
  const one = await refusedWith(
    refusal(409, 'CONFLICT', "The hub's bot lacks Manage Webhooks on this Discord channel", {
      reason: 'bot_lacks_permissions',
    }),
  );
  assert.match(one, /lacks Manage Webhooks on the channel\./);
});

test('a channel mirroring another room says to use another', async () => {
  const text = await refusedWith(
    refusal(409, 'CONFLICT', 'This Discord channel mirrors another room already', {
      reason: 'channel_taken',
    }),
  );
  assert.equal(
    text,
    'That channel mirrors another room already. Use another channel, or stop the other room’s mirror first.',
  );
});

test('a webhook the hub will not take says how to make one, and never says its address', async () => {
  const notOne = await refusedWith(
    refusal(400, 'INVALID_REQUEST', 'Not a Discord webhook’s address', { reason: 'not_a_webhook' }),
    WEBHOOK,
  );
  assert.match(
    notOne,
    /isn’t a Discord webhook’s address\. In the channel’s settings, under Integrations, Webhooks/,
  );
  const unknown = await refusedWith(
    refusal(409, 'CONFLICT', 'Discord has no such webhook', { reason: 'unknown_webhook' }),
    WEBHOOK,
  );
  assert.match(
    unknown,
    /Discord has no such webhook: it may have been deleted\. .* make a new one/,
  );
  for (const text of [notOne, unknown]) assert.ok(!text.includes(TOKEN));
});

test('a locked world, a channel of the wrong kind, a wait and Discord out of reach are explained', async () => {
  assert.equal(
    await refusedWith(refusal(409, 'CONFLICT', "The hub's operator has locked this world")),
    'The hub’s operator locked this world, so it mirrors no room into Discord.',
  );
  assert.equal(
    await refusedWith(
      refusal(
        400,
        'INVALID_REQUEST',
        "A room is mirrored into a server's text or announcement channel",
      ),
    ),
    'That channel can’t mirror a room. Use a text or announcement channel of a Discord server.',
  );
  assert.equal(
    await refusedWith(
      refusal(429, 'RATE_LIMITED', 'Discord asks the hub to wait before it looks at the channel', {
        retryAfterSeconds: 600,
      }),
    ),
    'Discord asked the hub to wait. Try again in about 10 minutes.',
  );
  assert.equal(
    await refusedWith(
      refusal(429, 'RATE_LIMITED', 'Too many requests', { retryAfterSeconds: 120 }),
    ),
    'Too many requests. Try again in about 2 minutes.',
    'the hub’s own limit is not Discord’s',
  );
  assert.equal(
    await refusedWith(refusal(503, 'UNAVAILABLE', 'Discord: the request failed')),
    'The hub can’t reach Discord just now. Try again in a moment.',
  );
  assert.equal(
    await refusedWith(
      refusal(503, 'UNAVAILABLE', 'This hub mirrors nothing into Discord: it has no bot token'),
    ),
    'This hub has no Discord bot now, so it mirrors nothing into Discord.',
  );
});

test('a refusal this page does not know keeps the hub’s words, and a lapsed session is kept for the page', async () => {
  assert.equal(
    await refusedWith(refusal(403, 'FORBIDDEN', 'Verify your claim before you manage this world')),
    'Verify your claim before you manage this world.',
  );
  const { hub } = hubAnswering(refusal(401, 'UNAUTHORIZED', 'Sign in first'));
  const outcome = await mirrorWorldRoom(hub, 'coldeve', 'global', CHANNEL, mirrors());
  assert.equal((outcome.error as HubError).status, 401, 'the page signs out on it');
});

test('stopping a mirror takes it off the room, and one already stopped is no refusal', async () => {
  const state = mirrors(mirror('global'), mirror('general', { channel: '2' }));
  const { hub, asked } = hubAnswering(new Response(null, { status: 204 }));
  const stopped = await stopWorldMirror(hub, 'coldeve', 'general', state);
  assert.deepEqual(asked, [
    {
      url: `${HUB}/v1/operator/worlds/coldeve/discord/mirrors/general`,
      method: 'DELETE',
      body: undefined,
    },
  ]);
  assert.deepEqual(
    stopped.state.mirrors.map((m) => m.room),
    ['global'],
  );
  assert.deepEqual(stopped.said, {
    kind: 'ok',
    text: 'General is no longer mirrored into Discord.',
  });
  const gone = hubAnswering(refusal(404, 'NOT_FOUND', 'This room is not mirrored'));
  const again = await stopWorldMirror(gone.hub, 'coldeve', 'general', state);
  assert.deepEqual(
    again.state.mirrors.map((m) => m.room),
    ['global'],
  );
  assert.deepEqual(again.said, { kind: 'note', text: 'General wasn’t mirrored.' });
});

test('a world’s card has a row for each room it may mirror, the Global room first', () => {
  const view = worldMirrorsView(world, {
    ...mirrors(
      mirror('trade', {
        webhook: null,
        lines: { toDiscord: 0, heldBackToDiscord: 4, notCarried: 0 },
      }),
      mirror('general', {
        through: 'webhook',
        webhook: '9',
        lines: { toDiscord: 7, heldBackToDiscord: 0, notCarried: 2 },
      }),
      mirror('global'),
    ),
    rooms: ['general', 'trade', 'lfg', 'roleplay', 'global'],
  });
  const rows = elementsOf(view, 'div')
    .filter((d) => d.attrs.class === 'report-item')
    .map((row) => plain(row));
  assert.deepEqual(
    rows.map((r) => r.split(' ').slice(0, 3).join(' ')),
    [
      'Cross-world Global Chat',
      'General Chat Through',
      'Trade Chat Waiting',
      'LFG Chat Not',
      'Roleplay Chat Not',
    ],
  );
  assert.match(
    rows[0],
    new RegExp(
      `^Cross-world Global Chat Through the bot Into the channel ${CHANNEL} since .+\\. Move Stop$`,
    ),
  );
  assert.doesNotMatch(rows.join(' '), /Lines since the hub started/);
  assert.match(
    rows[1],
    /Through a webhook .* Some lines weren’t carried\. If the webhook was deleted in Discord, make another/,
  );
  assert.match(
    rows[2],
    /Waiting for the bot .* The bot hasn’t made its webhook in the channel yet/,
  );
  assert.equal(rows[3], 'LFG Chat Not mirrored Mirror');
  assert.deepEqual(
    controlsOf(view).map((c) => [c.act, c.attrs['data-room'] ?? null, c.text]),
    [
      ['mirror', 'global', 'Move Stop'],
      ['stop', 'global', 'Stop'],
      ['mirror', 'general', 'Move Stop'],
      ['stop', 'general', 'Stop'],
      ['mirror', 'trade', 'Move Stop'],
      ['stop', 'trade', 'Stop'],
      ['mirror', 'lfg', 'Mirror'],
      ['mirror', 'roleplay', 'Mirror'],
    ],
  );
  assert.ok(
    linksOf(view).some(
      (l) => l.href === `https://discord.com/channels/${SERVER}/${CHANNEL}` && l.text === CHANNEL,
    ),
    'each channel opens in Discord',
  );
});

test('a world’s card says mirrors go one way, that /dn say needs the bot, and how to set a channel up either way', () => {
  const view = worldMirrorsView(world, mirrors());
  const text = plain(view);
  assert.match(
    text,
    /^Mirror world chat into Discord channels\. Mirrors are one-way by default, via webhooks or the Dereth Network bot\./,
  );
  assert.match(text, /only with the \/dn say command, if you add the Dereth Network bot\./);
  assert.match(
    text,
    /Dereth Network gains no permissions to read chat in your server either way\./,
  );
  assert.doesNotMatch(text, /discord_mirrors|DiscordMirrors/);
  assert.match(
    text,
    /Add the bot Click this link to add the bot to your server\. It asks for no permissions\./,
  );
  assert.match(
    text,
    /Edit Channel, Permissions, add the bot and give it View Channel and Manage Webhooks\./,
  );
  assert.match(
    text,
    /Set up a webhook For any channel you want to mirror into: Edit Channel, Integrations, Webhooks, New Webhook\./,
  );
  assert.match(text, /Copy Webhook URL and paste it below\./);
  assert.deepEqual(
    linksOf(view).filter((l) => l.href === INVITE),
    [{ href: INVITE, text: 'Click this link' }],
    'the bot added with no permissions',
  );
  assert.deepEqual(elementsOf(view, 'details'), [], 'the steps are always shown');
  assert.doesNotMatch(text, /lobby|lobbies|provisional/i);
});

test('a world off the network is told its mirrors carry nothing until it’s back', () => {
  assert.match(
    textOf(worldMirrorsView({ ...world, federation: 'off' }, mirrors())),
    /off the network/,
  );
  assert.doesNotMatch(textOf(worldMirrorsView(world, mirrors())), /off the network/);
});

test('a hub that names no rooms for a world gets the five it may mirror', () => {
  const view = worldMirrorsView(world, { mirrors: [], rooms: [], invite: null });
  assert.deepEqual(
    controlsOf(view).map((c) => c.attrs['data-room']),
    ['global', 'general', 'trade', 'lfg', 'roleplay'],
  );
  assert.match(
    plain(view),
    /Click this link to add the bot to your server/,
    'the steps without the link',
  );
  assert.deepEqual(linksOf(view), []);
});

// ---- the room that carries the Global room ---------------------------------------------------------

test('cross-world Global chat is picked from the world’s rooms or Off, on its own, and not at all on a hub that keeps none', () => {
  const view = globalRoomView({ ...mirrors(), globalRoom: 'roleplay' });
  assert.match(plain(view), /^Cross-world Global chat:/);
  assert.equal(controlsOf(view)[0].act, 'global-room');
  assert.deepEqual(
    elementsOf(elementsOf(view, 'select')[0], 'option').map((o) => [
      o.attrs.value,
      textOf(o),
      o.attrs.selected,
    ]),
    [
      ['general', 'General', false],
      ['trade', 'Trade', false],
      ['lfg', 'LFG', false],
      ['roleplay', 'Roleplay', true],
      ['off', 'Off', false],
    ],
  );
  const unknown = globalRoomView({ ...mirrors(), globalRoom: null });
  assert.deepEqual(
    elementsOf(elementsOf(unknown, 'select')[0], 'option')
      .filter((o) => o.attrs.selected)
      .map((o) => [o.attrs.value, textOf(o)]),
    [['', 'Choose a room']],
    'no room is chosen for an unknown one',
  );
  assert.equal(globalRoomView(mirrors()), null, 'a hub that keeps none shows nothing');
  assert.doesNotMatch(
    plain(worldMirrorsView(world, { ...mirrors(), globalRoom: 'roleplay' })),
    /Global chat:/,
    'the Discord mirrors don’t pick it',
  );
});

test('the mirror rows put Global first, then the world’s own rooms but the one carrying Global, which says so', () => {
  const view = worldMirrorsView(world, {
    ...mirrors(mirror('global')),
    rooms: ['global', 'general', 'trade', 'lfg'],
    globalRoom: 'roleplay',
  });
  const rows = elementsOf(view, 'div')
    .filter((d) => d.attrs.class === 'report-item')
    .map((row) => plain(row));
  assert.deepEqual(
    rows.map((r) => r.split(' ').slice(0, 3).join(' ')),
    [
      'Cross-world Global Chat',
      'General Chat Not',
      'Trade Chat Not',
      'LFG Chat Not',
      'Roleplay Chat Cross-world',
    ],
  );
  assert.match(
    rows[4],
    /^Roleplay Chat Cross-world Global chat Roleplay Chat is taken over by cross-world Global chat, so it can’t be mirrored on its own\. You can mirror Cross-world Global Chat instead\./,
  );
  assert.deepEqual(
    controlsOf(view)
      .filter((c) => c.act === 'mirror')
      .map((c) => c.attrs['data-room']),
    ['global', 'general', 'trade', 'lfg'],
    'no form mirrors the room carrying Global',
  );
  const off = worldMirrorsView(world, { ...mirrors(), globalRoom: 'off' });
  assert.deepEqual(
    controlsOf(off)
      .filter((c) => c.act === 'mirror')
      .map((c) => c.attrs['data-room']),
    ['global', 'general', 'trade', 'lfg', 'roleplay'],
    'carried nowhere, every own room may be mirrored',
  );
});

test('moving Global chat asks the hub, reads the mirrors again, and says where it is now', async () => {
  const after = {
    ...mirrors(mirror('global')),
    rooms: ['global', 'general', 'lfg', 'roleplay'],
    globalRoom: 'trade',
  };
  const { hub, asked } = hubAnswering(json(200, { globalRoom: 'trade' }), json(200, after));
  const state = { ...mirrors(), globalRoom: 'roleplay' };
  const outcome = await setGlobalRoom(hub, 'coldeve', 'trade', state);
  assert.deepEqual(asked, [
    {
      url: `${HUB}/v1/operator/worlds/coldeve/global-room`,
      method: 'PUT',
      body: { room: 'trade' },
    },
    { url: `${HUB}/v1/operator/worlds/coldeve/discord/mirrors`, method: 'GET', body: undefined },
  ]);
  assert.deepEqual(outcome.state, after, 'a mirror that followed the room shows at once');
  assert.deepEqual(outcome.said, {
    kind: 'ok',
    text: 'Cross-world Global chat is in Trade now.',
  });
  const none = await setGlobalRoom(
    hubAnswering(json(200, { globalRoom: 'off' }), json(200, { ...mirrors(), globalRoom: 'off' }))
      .hub,
    'coldeve',
    'off',
    state,
  );
  assert.deepEqual(none.said, {
    kind: 'ok',
    text: 'Cross-world Global chat is off now.',
  });
  const unasked = hubAnswering();
  const bad = await setGlobalRoom(unasked.hub, 'coldeve', 'global', state);
  assert.equal(bad.said.kind, 'error');
  assert.equal(bad.state, state);
  assert.deepEqual(unasked.asked, [], 'a room that is none of the world’s is not sent');
});

test('a refusal to move Global chat, or to mirror the room carrying it, says what to do', async () => {
  const state = { ...mirrors(), globalRoom: 'roleplay' };
  const locked = await setGlobalRoom(
    hubAnswering(refusal(409, 'CONFLICT', 'The hub’s operator has locked this world')).hub,
    'coldeve',
    'trade',
    state,
  );
  assert.deepEqual(locked.said, {
    kind: 'error',
    text: 'The hub’s operator locked this world, so its cross-world Global chat stays where it is.',
  });
  assert.equal(locked.state, state);
  assert.equal(
    await refusedWith(
      refusal(409, 'CONFLICT', 'roleplay carries the Global room on this world', {
        reason: 'carries_global',
      }),
    ),
    'That room carries cross-world Global chat on this world, so it isn’t one of the world’s own rooms: mirror Global instead.',
  );
});

// ---- the hub's settings, for its admins ----------------------------------------------------------

test('the network’s mirrors show the Global room and each channel mirrored, and a form for another channel', () => {
  const state = admin(
    mirror('oldguard@channel', { world: null, channel: '3' }),
    mirror('global', { world: null }),
    mirror('arcanum@channel', { world: null, channel: '4' }),
    mirror('global', { world: 'coldeve', channel: '5' }),
  );
  const global = networkGlobalView(state);
  assert.deepEqual(
    controlsOf(global).map((c) => [c.act, c.attrs['data-room'] ?? null]),
    [
      ['mirror', 'global'],
      ['stop', 'global'],
    ],
  );
  assert.match(textOf(global), /^Cross-world Global Chat Through the bot/);
  const view = channelMirrorsView(state);
  assert.deepEqual(
    controlsOf(view).map((c) => [c.act, c.attrs['data-room'] ?? null]),
    [
      ['mirror', 'arcanum@channel'],
      ['stop', 'arcanum@channel'],
      ['mirror', 'oldguard@channel'],
      ['stop', 'oldguard@channel'],
      ['mirror-channel', null],
    ],
  );
  assert.deepEqual(acts(networkGlobalView(admin())), ['mirror'], 'Global, not mirrored yet');
  assert.deepEqual(acts(channelMirrorsView(admin())), ['mirror-channel'], 'no channel yet');
});

test('an admin mirrors a network channel by its address, as typed', async () => {
  assert.equal(networkChannel(' Oldguard '), 'oldguard@channel');
  assert.equal(networkChannel('oldguard@channel'), 'oldguard@channel');
  assert.equal(networkChannel('old guard'), null);
  assert.equal(networkChannel('x'), null);
  const after = admin(mirror('oldguard@channel', { world: null }));
  const { hub, asked } = hubAnswering(json(200, after));
  const outcome = await mirrorNetworkRoom(hub, 'Oldguard@channel', CHANNEL, admin());
  assert.deepEqual(asked, [
    {
      url: `${HUB}/v1/admin/discord/mirrors/oldguard%40channel`,
      method: 'PUT',
      body: { channel: CHANNEL },
    },
  ]);
  assert.deepEqual(outcome.state, after);
  assert.equal(
    outcome.said.text,
    `oldguard@channel is mirrored into the channel ${CHANNEL}, through the bot.`,
  );
  const global = hubAnswering(json(200, after));
  await mirrorNetworkRoom(global.hub, 'global', WEBHOOK, admin());
  assert.deepEqual(global.asked[0].body, { webhook: WEBHOOK });
  assert.equal(global.asked[0].url, `${HUB}/v1/admin/discord/mirrors/global`);
  const bad = hubAnswering();
  const refused = await mirrorNetworkRoom(bad.hub, 'old guard', CHANNEL, admin());
  assert.match(refused.said.text, /isn’t a network channel’s address/);
  assert.deepEqual(bad.asked, []);
});

test('the admins’ view after a webhook is set never shows its address', async () => {
  const after = admin(mirror('global', { world: null, through: 'webhook', webhook: '77' }));
  const { hub } = hubAnswering(json(200, after));
  const outcome = await mirrorNetworkRoom(hub, 'global', WEBHOOK, admin());
  const shown = outcome.said.text + JSON.stringify(hubDiscordView(outcome.state));
  assert.ok(!shown.includes(TOKEN));
  assert.ok(!shown.includes(WEBHOOK));
});

test('stopping the network’s mirror leaves the worlds’ mirrors of the same room', async () => {
  const state = admin(mirror('global', { world: null }), mirror('global', { world: 'coldeve' }));
  const { hub, asked } = hubAnswering(new Response(null, { status: 204 }));
  const outcome = await stopNetworkMirror(hub, 'global', state);
  assert.deepEqual(
    asked.map((a) => [a.method, a.url]),
    [['DELETE', `${HUB}/v1/admin/discord/mirrors/global`]],
  );
  assert.deepEqual(
    outcome.state.mirrors.map((m) => m.world),
    ['coldeve'],
  );
});

test('every world’s mirror is listed with Take away, which takes that one alone', async () => {
  const state = admin(
    mirror('global', { world: null }),
    mirror('global', { world: 'coldeve' }),
    mirror('general', { world: 'coldeve' }),
    mirror('global', { world: 'frost' }),
  );
  const view = worldsMirrorsView(state);
  assert.deepEqual(
    controlsOf(view).map((c) => [c.act, c.attrs['data-world'], c.attrs['data-room']]),
    [
      ['take-away', 'coldeve', 'global'],
      ['take-away', 'coldeve', 'general'],
      ['take-away', 'frost', 'global'],
    ],
  );
  assert.match(textOf(view), /@coldeve Global Through the bot Into the channel/);
  assert.match(textOf(worldsMirrorsView(admin())), /No world mirrors a room/);
  const { hub, asked } = hubAnswering(new Response(null, { status: 204 }));
  const outcome = await takeWorldMirror(hub, 'coldeve', 'global', state);
  assert.deepEqual(
    asked.map((a) => [a.method, a.url]),
    [['DELETE', `${HUB}/v1/admin/discord/worlds/coldeve/mirrors/global`]],
  );
  assert.deepEqual(
    outcome.state.mirrors.map((m) => `${m.world}/${m.room}`),
    ['null/global', 'coldeve/general', 'frost/global'],
  );
  assert.equal(outcome.said.text, '@coldeve’s mirror of Global is taken away.');
  const gone = hubAnswering(refusal(404, 'NOT_FOUND', 'This room is not mirrored'));
  const again = await takeWorldMirror(gone.hub, 'coldeve', 'global', state);
  assert.deepEqual(again.said, { kind: 'note', text: '@coldeve no longer mirrors Global.' });
});

test('the picture mirrored lines show is set, checked as the hub checks it, and removed', async () => {
  assert.equal(avatarProblem('https://dereth.network/media/art/emblem.png'), null);
  for (const bad of [
    'http://x.example/a.png',
    'https://x.example/a b.png',
    `https://${'a'.repeat(500)}`,
  ])
    assert.match(avatarProblem(bad) ?? '', /must start with https:\/\//, bad);
  const url = 'https://dereth.network/media/art/emblem.png';
  const { hub, asked } = hubAnswering(
    json(200, { avatarUrl: url }),
    json(200, { avatarUrl: null }),
  );
  const set = await setAvatar(hub, ` ${url} `, admin());
  assert.deepEqual(asked[0], {
    url: `${HUB}/v1/admin/discord/avatar`,
    method: 'PUT',
    body: { url },
  });
  assert.equal(set.state.avatarUrl, url);
  assert.equal(set.said.text, 'Mirrored lines show that picture now.');
  const removed = await setAvatar(hub, '', set.state);
  assert.deepEqual(asked[1].body, { url: null });
  assert.equal(removed.state.avatarUrl, null);
  assert.match(removed.said.text, /each webhook’s own picture/);
  const local = hubAnswering();
  assert.equal((await setAvatar(local.hub, 'ftp://x', admin())).said.kind, 'error');
  assert.deepEqual(local.asked, []);
  assert.deepEqual(acts(avatarView(url)), ['avatar', 'avatar-clear']);
  assert.equal(elementsOf(avatarView(url), 'input')[0].attrs.value, url);
  assert.deepEqual(acts(avatarView(null)), ['avatar']);
  assert.match(
    textOf(avatarView(null)),
    /None is set, so each line shows its webhook’s own picture/,
  );
});

test('the hub’s Discord settings hold Global’s mirror, then folds for the channels, the default avatar and the worlds’ mirrors', () => {
  const view = hubDiscordView(admin());
  assert.match(textOf(view), /^Cross-world Global Chat Not mirrored/);
  assert.deepEqual(
    elementsOf(view, 'summary').map((s) => textOf(s)),
    ['Channel Mirrors', 'Default Avatar', 'Worlds’ Mirrors'],
  );
  assert.doesNotMatch(textOf(view), /Tells into Discord|Mirrors go one way|Add the bot/);
});

test('Global chat moved, and a mirror that followed it, read plainly in a history', () => {
  const at = '2026-10-12T18:20:40.000Z';
  assert.equal(
    auditText(
      {
        kind: 'global-room',
        at,
        actor: 'world',
        details: { room: 'roleplay', was: null, seed: true },
      },
      'op_1',
    ),
    'Cross-world Global chat carried in Roleplay, as the world’s settings said, by the world',
  );
  assert.equal(
    auditText(
      { kind: 'global-room', at, actor: 'op_1', details: { room: 'off', was: 'trade' } },
      'op_1',
    ),
    'Cross-world Global chat carried in no room (from Trade), by you',
  );
  assert.equal(
    auditText(
      {
        kind: 'discord-mirror',
        at,
        actor: 'hub',
        details: {
          room: 'global',
          mirrored: true,
          channel: CHANNEL,
          server: SERVER,
          through: 'bot',
          was: 'roleplay',
        },
      },
      'op_1',
    ),
    `Global mirrored into the Discord channel ${CHANNEL}, through the bot, by the hub: Roleplay’s mirror, since Roleplay carries Global`,
  );
  assert.equal(
    auditText(
      {
        kind: 'discord-mirror',
        at,
        actor: 'hub',
        details: { room: 'general', mirrored: false, carriesGlobal: true },
      },
      'op_1',
    ),
    'General no longer mirrored into Discord, by the hub: General carries Global, which is mirrored already',
  );
});

test('a mirror set, stopped or taken away, and the picture, read plainly in a history', () => {
  const at = '2026-10-12T18:20:40.000Z';
  assert.equal(
    auditText(
      {
        kind: 'discord-mirror',
        at,
        actor: 'op_1',
        details: {
          room: 'general',
          mirrored: true,
          channel: CHANNEL,
          server: SERVER,
          through: 'bot',
        },
      },
      'op_1',
    ),
    `General mirrored into the Discord channel ${CHANNEL}, through the bot, by you`,
  );
  assert.equal(
    auditText(
      {
        kind: 'discord-mirror',
        at,
        actor: 'hub-admin',
        details: { room: 'global', mirrored: false },
      },
      'op_1',
    ),
    'Global no longer mirrored into Discord, by a hub admin',
  );
  assert.equal(
    auditText(
      {
        kind: 'discord-mirror',
        at,
        actor: 'op_2',
        details: {
          room: 'oldguard@channel',
          mirrored: true,
          channel: CHANNEL,
          server: SERVER,
          through: 'webhook',
          webhook: '9',
        },
      },
      'op_1',
    ),
    `oldguard@channel mirrored into the Discord channel ${CHANNEL}, through a webhook, by another operator`,
  );
  assert.equal(
    auditText(
      { kind: 'discord-avatar', at, actor: 'op_1', details: { url: 'https://x.example/a.png' } },
      'op_1',
    ),
    'The picture mirrored lines show set to https://x.example/a.png, by you',
  );
  assert.equal(
    auditText(
      { kind: 'discord-avatar', at, actor: 'hub-operator', details: { url: null } },
      'op_1',
    ),
    'The picture mirrored lines show removed, by the hub’s operator',
  );
});
