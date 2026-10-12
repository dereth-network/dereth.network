// What the pages say and offer about Discord: a world's rooms mirrored into its operator's Discord
// server, and the room that carries its Global chat, on the operator's page; and, for the hub's
// admins, the network's mirrors, the picture mirrored lines show, every world's mirrors and the
// tells carried. Each of the hub's refusals is said in plain words. No DOM here, so all of it can be checked without a
// browser: each control is a button or a form marked `data-act`, which the page wires up.
import { explain, roomName, safeLink, waitText, when } from './format.ts';
import { HubError } from './hub.ts';
import type {
  DiscordAdmin,
  DiscordMirror,
  Hub,
  HubConfig,
  MirrorLines,
  MirrorTarget,
  World,
  WorldMirrors,
} from './hub.ts';
import { v } from './view.ts';
import type { View } from './view.ts';

export { roomName };

/** Something a page says after an action: a success, a note or a refusal. */
export interface Said {
  kind: 'ok' | 'note' | 'error';
  text: string;
}

/** What of Discord the hub offers: nothing on a hub without Discord's bot, or without sign-in. */
export function discordFeatures(config: HubConfig | null | undefined): {
  tells: boolean;
  mirrors: boolean;
} {
  const broker = config?.authEnabled ? config.broker : undefined;
  return {
    tells: broker?.discordTells === true,
    mirrors: broker?.mirrors === true,
  };
}

function button(act: string, label: string, kind = '', attrs: Record<string, string> = {}): View {
  return v(
    'button',
    { class: kind ? `btn small ${kind}` : 'btn small', type: 'button', 'data-act': act, ...attrs },
    label,
  );
}

// ---- rooms mirrored into Discord ------------------------------------------------------------------

/** The rooms a world's operator may mirror, the Global room first, for a hub that names none. */
const WORLD_ROOMS = ['global', 'general', 'trade', 'lfg', 'roleplay'];

// The hosts of Discord's links and webhooks' addresses, as the hub takes them.
const DISCORD_HOSTS = ['discord.com', 'discordapp.com'];

function discordHost(host: string): boolean {
  const h = host.toLowerCase();
  return DISCORD_HOSTS.some((d) => h === d || h === `ptb.${d}` || h === `canary.${d}`);
}

const CHANNEL_LINK = /^https:\/\/([^/]+)\/channels\/\d{1,24}\/(\d{1,24})(?:\/\d{1,24})?\/?$/;
const WEBHOOK = /^https:\/\/([^/]+)\/api\/(?:v\d+\/)?webhooks\/\d{1,24}\/[\w-]{1,256}$/;

/** The id of a Discord channel as it is pasted: the id itself, or a link to the channel (or to a
 * message in it). */
export function channelId(typed: string): string | null {
  const t = typed.trim();
  if (/^\d{1,24}$/.test(t)) return t;
  const link = CHANNEL_LINK.exec(t);
  return link && discordHost(link[1]) ? link[2] : null;
}

/** Whether `typed` is the address of a Discord webhook, as the hub takes one. */
export function isWebhookAddress(typed: string): boolean {
  const hook = WEBHOOK.exec(typed.trim());
  return hook !== null && discordHost(hook[1]);
}

// Why a mirror was refused, by the hub's reason, or by this page before asking.
const MIRROR_REASONS: Record<string, string> = {
  bot_cannot_see:
    'The hub’s bot can’t see that channel. Add the bot to the channel’s server with the link under “Add the bot”, then, in the channel’s settings, under Permissions, add the bot and allow it View Channel and Manage Webhooks. If you did, check that you pasted that channel’s link.',
  not_your_channel:
    'The Discord account you signed in with can’t manage that channel’s webhooks, so you can’t mirror a room into it. Use a channel of a server where you have View Channel and Manage Webhooks.',
  channel_taken:
    'That channel mirrors another room already. Use another channel, or stop the other room’s mirror first.',
  carries_global:
    'That room carries cross-world Global chat on this world, so it isn’t one of the world’s own rooms: mirror Global instead.',
  not_a_webhook:
    'That isn’t a Discord webhook’s address. In the channel’s settings, under Integrations, Webhooks, make a webhook, choose Copy Webhook URL, and paste that here.',
  unknown_webhook:
    'Discord has no such webhook: it may have been deleted. In the channel’s settings, under Integrations, Webhooks, make a new one and paste its address here.',
};

const NOT_A_TARGET =
  'That isn’t a Discord channel’s link or id, or a webhook’s address. In Discord, right-click the channel and choose Copy Link, or paste the address of a webhook made in it.';

/** Where a room's form asks its mirror to go, or why it can't be asked. A webhook's address is
 * passed on as typed, and kept nowhere else. */
export function mirrorTarget(typed: string): { target: MirrorTarget } | { problem: string } {
  const t = typed.trim();
  if (!t) return { problem: 'Paste the channel’s link or id, or a webhook’s address.' };
  const channel = channelId(t);
  if (channel) return { target: { channel } };
  if (isWebhookAddress(t)) return { target: { webhook: t } };
  return { problem: /\/webhooks\//i.test(t) ? MIRROR_REASONS.not_a_webhook : NOT_A_TARGET };
}

/** What a room's field keeps after a refusal: a channel's link or id as typed, so it can be tried
 * again; anything else, a webhook's address above all, is cleared. */
export function keepAfterRefusal(typed: string): string {
  return channelId(typed) ? typed.trim() : '';
}

/** A network channel's address as an admin types it (`oldguard`, `Oldguard@channel`), as the hub
 * names it (`oldguard@channel`); null for anything else. */
export function networkChannel(typed: string): string | null {
  const name = typed
    .trim()
    .toLowerCase()
    .replace(/@channel$/, '');
  return name.length >= 2 && name.length <= 20 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)
    ? `${name}@channel`
    : null;
}

/** What the hub refused when asked to set, move or stop a mirror, in plain words. `asked` says
 * how the mirror was to go, when it was being set. */
export function mirrorRefusal(error: unknown, asked: 'channel' | 'webhook' | null = null): string {
  if (!(error instanceof HubError)) return explain(error);
  if (error.reason === 'bot_lacks_permissions') {
    // The hub's message names the permissions the bot lacks.
    const lacks = /lacks (.+?) (?:on|in) this Discord channel/
      .exec(error.message)?.[1]
      ?.replace(/, ([^,]+)$/, ' and $1');
    return `The hub’s bot is in that server, but lacks ${lacks ?? 'a permission it needs'} on the channel. In the channel’s settings, under Permissions, add the bot and allow it View Channel and Manage Webhooks, then try again.`;
  }
  const known = error.reason ? MIRROR_REASONS[error.reason] : undefined;
  if (known) return known;
  if (error.status === 409 && /locked/i.test(error.message))
    return 'The hub’s operator locked this world, so it mirrors no room into Discord.';
  if (error.status === 400 && asked === 'channel')
    return 'That channel can’t mirror a room. Use a text or announcement channel of a Discord server.';
  if (error.code === 'RATE_LIMITED' && /discord/i.test(error.message))
    return `Discord asked the hub to wait. Try again in ${waitText(error.retryAfterSeconds ?? 60)}.`;
  if (error.status === 503)
    return /bot token|mirrors nothing/i.test(error.message)
      ? 'This hub has no Discord bot now, so it mirrors nothing into Discord.'
      : 'The hub can’t reach Discord just now. Try again in a moment.';
  return explain(error);
}

/** What came of an action on mirrors: the state after (unchanged when it was refused), what to
 * say, and the hub's refusal, if it was one. */
export interface MirrorOutcome<S> {
  state: S;
  said: Said;
  error?: unknown;
}

/** What a mirror set says: never a webhook's address, which the hub keeps secret. */
function mirroredText(room: string, target: MirrorTarget): string {
  return 'channel' in target
    ? `${roomName(room)} is mirrored into the channel ${target.channel}, through the bot.`
    : `${roomName(room)} is mirrored through your webhook. The hub keeps its address secret, so it isn’t shown here again.`;
}

/** Sets a mirror of `room` where `typed` says, with `put`, refusing what the hub would. */
async function setMirror<S>(
  state: S,
  room: string,
  typed: string,
  put: (target: MirrorTarget) => Promise<S>,
): Promise<MirrorOutcome<S>> {
  const read = mirrorTarget(typed);
  if ('problem' in read) return { state, said: { kind: 'error', text: read.problem } };
  try {
    const after = await put(read.target);
    return { state: after, said: { kind: 'ok', text: mirroredText(room, read.target) } };
  } catch (error) {
    const asked = 'channel' in read.target ? 'channel' : 'webhook';
    return { state, said: { kind: 'error', text: mirrorRefusal(error, asked) }, error };
  }
}

/** Stops a mirror with `drop`: `without` is the state after. One already gone is no refusal. */
async function dropMirror<S>(
  state: S,
  without: S,
  drop: () => Promise<void>,
  done: string,
  gone: string,
): Promise<MirrorOutcome<S>> {
  try {
    await drop();
    return { state: without, said: { kind: 'ok', text: done } };
  } catch (error) {
    if (error instanceof HubError && error.status === 404)
      return { state: without, said: { kind: 'note', text: gone } };
    return { state, said: { kind: 'error', text: mirrorRefusal(error) }, error };
  }
}

/** Mirrors one of a world's rooms where `typed` says (a channel's link or id, or a webhook's
 * address), or moves its mirror there. */
export function mirrorWorldRoom(
  hub: Pick<Hub, 'setWorldMirror'>,
  slug: string,
  room: string,
  typed: string,
  state: WorldMirrors,
): Promise<MirrorOutcome<WorldMirrors>> {
  return setMirror(state, room, typed, (target) => hub.setWorldMirror(slug, room, target));
}

// ---- the room that carries the Global room ---------------------------------------------------------

/** Where a world may carry the Global room: one of its own rooms, or none. */
export const GLOBAL_ROOM_CHOICES = ['general', 'trade', 'lfg', 'roleplay', 'off'];

/** Why the hub refused to move a world's Global chat, in plain words. */
export function globalRoomRefusal(error: unknown): string {
  if (error instanceof HubError && error.status === 409 && /locked/i.test(error.message))
    return 'The hub’s operator locked this world, so its cross-world Global chat stays where it is.';
  if (error instanceof HubError && error.status === 400)
    return 'Choose one of the world’s rooms, or Off.';
  return explain(error);
}

/** Carries a world's Global chat in `room` (or nowhere, `off`) from now on, and reads its mirrors
 * again, since a mirror of that room becomes the Global room's or goes. */
export async function setGlobalRoom(
  hub: Pick<Hub, 'setGlobalRoom' | 'worldMirrors'>,
  slug: string,
  room: string,
  state: WorldMirrors,
): Promise<MirrorOutcome<WorldMirrors>> {
  if (!GLOBAL_ROOM_CHOICES.includes(room))
    return {
      state,
      said: { kind: 'error', text: 'Choose one of the world’s rooms, or Off.' },
    };
  let globalRoom: string | null;
  try {
    ({ globalRoom } = await hub.setGlobalRoom(slug, room));
  } catch (error) {
    return { state, said: { kind: 'error', text: globalRoomRefusal(error) }, error };
  }
  let after: WorldMirrors;
  try {
    after = await hub.worldMirrors(slug);
  } catch {
    after = { ...state, globalRoom };
  }
  const text =
    globalRoom === 'off'
      ? 'Cross-world Global chat is off now.'
      : `Cross-world Global chat is in ${roomName(globalRoom ?? room)} now.`;
  return { state: after, said: { kind: 'ok', text } };
}

/** Where the world carries cross-world Global chat: one of its rooms, or Off, picked in a form
 * that saves as soon as it changes; nothing for a hub that doesn't keep it. */
export function globalRoomView(state: WorldMirrors): View {
  if (state.globalRoom === undefined) return null;
  const now = state.globalRoom;
  return v(
    'div',
    {},
    form(
      'global-room',
      {},
      v(
        'label',
        { class: 'global-room' },
        v('b', {}, 'Cross-world Global chat:'),
        v(
          'select',
          { name: 'room' },
          now === null
            ? v('option', { value: '', selected: true, disabled: true }, 'Choose a room')
            : null,
          ...GLOBAL_ROOM_CHOICES.map((r) =>
            v('option', { value: r, selected: r === now }, r === 'off' ? 'Off' : roomName(r)),
          ),
        ),
      ),
    ),
    v(
      'p',
      { class: 'small muted' },
      'Select which channel, if any, will hold cross-world Global chat. All chat on this channel will be global across all Dereth Network worlds.',
    ),
  );
}

/** Stops mirroring one of a world's rooms. */
export function stopWorldMirror(
  hub: Pick<Hub, 'stopWorldMirror'>,
  slug: string,
  room: string,
  state: WorldMirrors,
): Promise<MirrorOutcome<WorldMirrors>> {
  return dropMirror(
    state,
    { ...state, mirrors: state.mirrors.filter((m) => m.room !== room) },
    () => hub.stopWorldMirror(slug, room),
    `${roomName(room)} is no longer mirrored into Discord.`,
    `${roomName(room)} wasn’t mirrored.`,
  );
}

/** The admins' own mirror of the Global room or of a network channel, as typed, set where
 * `typed` says, or moved there. */
export function mirrorNetworkRoom(
  hub: Pick<Hub, 'setNetworkMirror'>,
  roomTyped: string,
  typed: string,
  state: DiscordAdmin,
): Promise<MirrorOutcome<DiscordAdmin>> {
  const room = roomTyped.trim().toLowerCase() === 'global' ? 'global' : networkChannel(roomTyped);
  if (!room)
    return Promise.resolve({
      state,
      said: {
        kind: 'error',
        text: 'That isn’t a network channel’s address: 2 to 20 letters, digits and single hyphens, then @channel, like oldguard@channel.',
      },
    });
  return setMirror(state, room, typed, (target) => hub.setNetworkMirror(room, target));
}

/** Stops the admins' own mirror of a room. */
export function stopNetworkMirror(
  hub: Pick<Hub, 'stopNetworkMirror'>,
  room: string,
  state: DiscordAdmin,
): Promise<MirrorOutcome<DiscordAdmin>> {
  return dropMirror(
    state,
    { ...state, mirrors: state.mirrors.filter((m) => m.world != null || m.room !== room) },
    () => hub.stopNetworkMirror(room),
    `${roomName(room)} is no longer mirrored into Discord.`,
    `${roomName(room)} wasn’t mirrored.`,
  );
}

/** Takes a world operator's mirror away. */
export function takeWorldMirror(
  hub: Pick<Hub, 'takeWorldMirror'>,
  slug: string,
  room: string,
  state: DiscordAdmin,
): Promise<MirrorOutcome<DiscordAdmin>> {
  return dropMirror(
    state,
    { ...state, mirrors: state.mirrors.filter((m) => m.world !== slug || m.room !== room) },
    () => hub.takeWorldMirror(slug, room),
    `@${slug}’s mirror of ${roomName(room)} is taken away.`,
    `@${slug} no longer mirrors ${roomName(room)}.`,
  );
}

const AVATAR_PROBLEM =
  'The picture’s address must start with https://, be at most 500 bytes long, and hold no spaces.';

/** Why the hub would refuse `url` as the picture mirrored lines show, or null. */
export function avatarProblem(url: string): string | null {
  const bad =
    !url.startsWith('https://') ||
    new TextEncoder().encode(url).length > 500 ||
    /[\s\p{Cc}]/u.test(url);
  return bad ? AVATAR_PROBLEM : null;
}

/** Sets the picture every mirrored line shows; an empty field leaves each webhook's own. */
export async function setAvatar(
  hub: Pick<Hub, 'setMirrorAvatar'>,
  typed: string,
  state: DiscordAdmin,
): Promise<MirrorOutcome<DiscordAdmin>> {
  const url = typed.trim() || null;
  const problem = url ? avatarProblem(url) : null;
  if (problem) return { state, said: { kind: 'error', text: problem } };
  try {
    const { avatarUrl } = await hub.setMirrorAvatar(url);
    const text = avatarUrl
      ? 'Mirrored lines show that picture now.'
      : 'Mirrored lines show each webhook’s own picture now.';
    return { state: { ...state, avatarUrl }, said: { kind: 'ok', text } };
  } catch (error) {
    const text =
      error instanceof HubError && error.status === 400 ? AVATAR_PROBLEM : mirrorRefusal(error);
    return { state, said: { kind: 'error', text }, error };
  }
}

// ---- the views ------------------------------------------------------------------------------------

/** How a mirror goes, as its badge says it. */
function mirrorBadge(m: DiscordMirror | undefined): View {
  const [tone, text] = !m
    ? ['', 'Not mirrored']
    : m.through === 'webhook'
      ? ['on', 'Through a webhook']
      : m.webhook
        ? ['on', 'Through the bot']
        : ['wait', 'Waiting for the bot'];
  return v('span', { class: tone ? `badge ${tone}` : 'badge' }, text);
}

/** Where a mirror goes and what it carried, with a link to its channel in Discord. */
function mirrorFacts(m: DiscordMirror): View[] {
  const href = safeLink(
    `https://discord.com/channels/${encodeURIComponent(m.server)}/${encodeURIComponent(m.channel)}`,
  );
  return [
    v(
      'p',
      { class: 'small muted' },
      'Into the channel ',
      href ? v('a', { href, rel: 'noopener' }, m.channel) : m.channel,
      ` since ${when(m.setAt)}.`,
    ),
    m.through === 'bot' && !m.webhook
      ? v(
          'p',
          { class: 'small muted' },
          'The bot hasn’t made its webhook in the channel yet, so lines are held back until it does.',
        )
      : null,
    m.through === 'webhook' && m.lines?.notCarried
      ? v(
          'p',
          { class: 'small muted' },
          'Some lines weren’t carried. If the webhook was deleted in Discord, make another and paste its address here.',
        )
      : null,
  ];
}

/** The field a channel's link or id, or a webhook's address, is pasted in. It starts empty
 * always, so no webhook's address is ever shown back. */
function targetField(label: string): View {
  return v('input', {
    type: 'text',
    name: 'target',
    autocomplete: 'off',
    spellcheck: 'false',
    maxlength: '400',
    placeholder: 'A channel’s link or id, or a webhook’s address',
    'aria-label': label,
  });
}

/** A form of this part. It posts, should a page ever send it itself, so that what it holds never
 * lands in an address. */
function form(act: string, attrs: Record<string, string>, ...children: View[]): View {
  return v(
    'form',
    { class: 'mirror-form', method: 'post', autocomplete: 'off', 'data-act': act, ...attrs },
    ...children,
  );
}

/** A room as the world's mirrors name it: cross-world Global chat, or one of the world's own. */
function roomLabel(room: string): string {
  return room === 'global' ? 'Cross-world Global Chat' : `${roomName(room)} Chat`;
}

/** One room: whether and where it's mirrored, what it carried, and the form that sets, moves or
 * stops its mirror. */
function mirrorRow(room: string, m: DiscordMirror | undefined, label = roomName): View {
  const name = label(room);
  return v(
    'div',
    { class: 'report-item' },
    v('p', { class: 'badges' }, v('b', {}, name), mirrorBadge(m)),
    ...(m ? mirrorFacts(m) : []),
    form(
      'mirror',
      { 'data-room': room },
      targetField(m ? `Where to move ${name}’s mirror` : `Where to mirror ${name}`),
      v(
        'button',
        { class: m ? 'btn small' : 'btn small lit', type: 'submit' },
        m ? 'Move' : 'Mirror',
      ),
      m ? button('stop', 'Stop', 'danger', { 'data-room': room }) : null,
    ),
  );
}

/** How to set a channel up for a mirror, either way: through the bot, or through a webhook. */
export function setupView(invite: string | null): View {
  const href = safeLink(invite);
  return v(
    'div',
    { class: 'setup' },
    v('h4', {}, 'Add the bot'),
    v(
      'ol',
      { class: 'steps small' },
      v(
        'li',
        {},
        href ? v('a', { href, rel: 'noopener' }, 'Click this link') : 'Click this link',
        ' to add the bot to your server. It asks for no permissions.',
      ),
      v(
        'li',
        {},
        'For any channel you want to mirror into: Edit Channel, Permissions, add the bot and give it View Channel and Manage Webhooks.',
      ),
      v('li', {}, 'Right-click the channel, Copy Link, and paste it below.'),
    ),
    v('h4', {}, 'Set up a webhook'),
    v(
      'ol',
      { class: 'steps small' },
      v(
        'li',
        {},
        'For any channel you want to mirror into: Edit Channel, Integrations, Webhooks, New Webhook.',
      ),
      v('li', {}, 'Copy Webhook URL and paste it below.'),
    ),
  );
}

/** The rooms of a world's answer in order, the Global room first, with any it mirrors besides,
 * and the world's own room that carries the Global room, in its place among them. */
function worldRooms(state: WorldMirrors): string[] {
  const carrying = carryingRoom(state);
  const rooms = (state.rooms?.length ? [...state.rooms] : [...WORLD_ROOMS]).filter(
    (r) => r !== carrying,
  );
  for (const m of state.mirrors) if (!rooms.includes(m.room)) rooms.push(m.room);
  if (carrying) rooms.push(carrying);
  const order = (r: string) => {
    const i = WORLD_ROOMS.indexOf(r);
    return i < 0 ? WORLD_ROOMS.length : i;
  };
  return rooms.sort((a, b) => order(a) - order(b));
}

/** The world's own room that carries the Global room, if it is one. */
function carryingRoom(state: WorldMirrors): string | null {
  const g = state.globalRoom;
  return g && g !== 'off' && g !== 'global' ? g : null;
}

/** The world's own room that carries cross-world Global chat: it can't be mirrored on its own
 * while it does. */
function carryingRow(room: string): View {
  const name = roomLabel(room);
  return v(
    'div',
    { class: 'report-item' },
    v(
      'p',
      { class: 'badges' },
      v('b', {}, name),
      v('span', { class: 'badge on' }, 'Cross-world Global chat'),
    ),
    v(
      'p',
      { class: 'small muted' },
      `${name} is taken over by cross-world Global chat, so it can’t be mirrored on its own. You can mirror Cross-world Global Chat instead.`,
    ),
  );
}

/** A world's rooms mirrored into its operator's Discord server: a row for each room it may
 * mirror, and how to set a channel up. */
export function worldMirrorsView(world: World, state: WorldMirrors): View {
  const byRoom = new Map(state.mirrors.map((m) => [m.room, m]));
  return v(
    'div',
    {},
    v(
      'p',
      {},
      'Mirror world chat into Discord channels. Mirrors are one-way by default, via webhooks or the Dereth Network bot. Players can chat in on your world via Discord only with the ',
      v('code', {}, '/dn say'),
      ' command, if you add the Dereth Network bot. Dereth Network gains no permissions to read chat in your server either way.',
    ),
    world.federation !== 'on'
      ? v(
          'p',
          { class: 'notice note', role: 'status' },
          'The world is off the network, so its mirrors carry nothing until it’s back on.',
        )
      : null,
    setupView(state.invite),
    v(
      'div',
      {},
      ...worldRooms(state).map((room) =>
        room === carryingRoom(state)
          ? carryingRow(room)
          : mirrorRow(room, byRoom.get(room), roomLabel),
      ),
    ),
  );
}

/** A fold of the hub's Discord settings, its open state kept across redraws by its `key`. */
function fold(key: string, title: string, ...children: View[]): View {
  return v('details', { class: 'fold', 'data-fold': key }, v('summary', {}, title), ...children);
}

/** The network's own mirror of cross-world Global chat. */
export function networkGlobalView(state: DiscordAdmin): View {
  const global = state.mirrors.find((m) => m.world == null && m.room === 'global');
  return mirrorRow('global', global, roomLabel);
}

/** The network channels' mirrors, with the form that mirrors another channel. */
export function channelMirrorsView(state: DiscordAdmin): View {
  const own = state.mirrors.filter((m) => m.world == null && m.room !== 'global');
  return v(
    'div',
    {},
    ...own.sort((a, b) => a.room.localeCompare(b.room)).map((m) => mirrorRow(m.room, m)),
    form(
      'mirror-channel',
      {},
      v('input', {
        type: 'text',
        name: 'room',
        autocomplete: 'off',
        spellcheck: 'false',
        maxlength: '40',
        placeholder: 'oldguard@channel',
        'aria-label': 'The network channel’s address',
      }),
      targetField('Where to mirror the channel'),
      v('button', { class: 'btn small lit', type: 'submit' }, 'Mirror the channel'),
    ),
  );
}

/** The picture every mirrored line shows, with the form that sets it. */
export function avatarView(avatarUrl: string | null): View {
  return v(
    'div',
    {},
    v(
      'p',
      { class: 'small muted' },
      avatarUrl
        ? 'Every mirrored line shows this picture beside its speaker’s name.'
        : 'None is set, so each line shows its webhook’s own picture.',
    ),
    form(
      'avatar',
      {},
      v('input', {
        type: 'url',
        name: 'url',
        value: avatarUrl ?? '',
        maxlength: '500',
        autocomplete: 'off',
        spellcheck: 'false',
        placeholder: 'https://example.org/picture.png',
        'aria-label': 'The picture’s address',
      }),
      v('button', { class: 'btn small lit', type: 'submit' }, 'Save'),
      avatarUrl ? button('avatar-clear', 'Remove', 'danger') : null,
    ),
  );
}

/** Every world operator's mirror, each with Take away. */
export function worldsMirrorsView(state: DiscordAdmin): View {
  const theirs = state.mirrors.filter((m) => m.world != null);
  return v(
    'div',
    {},
    v(
      'p',
      {},
      'Each world’s operator may mirror the Global room and the world’s own rooms into their own server. Taking one away stops it at once; the world’s history says a hub admin did.',
    ),
    theirs.length === 0
      ? v('p', { class: 'empty' }, 'No world mirrors a room.')
      : v(
          'div',
          {},
          ...theirs.map((m) =>
            v(
              'div',
              { class: 'report-item world-mirror' },
              v(
                'p',
                { class: 'badges' },
                v('b', {}, `@${m.world}`),
                v('span', {}, roomName(m.room)),
                mirrorBadge(m),
              ),
              ...mirrorFacts(m),
              button('take-away', 'Take away', 'danger take-away', {
                'data-world': m.world ?? '',
                'data-room': m.room,
              }),
            ),
          ),
        ),
  );
}

/** The Discord part of the hub's settings, for its admins. */
export function hubDiscordView(state: DiscordAdmin): View {
  return v(
    'div',
    {},
    networkGlobalView(state),
    fold('channels', 'Channel Mirrors', channelMirrorsView(state)),
    fold('avatar', 'Default Avatar', avatarView(state.avatarUrl)),
    fold('worlds', 'Worlds’ Mirrors', worldsMirrorsView(state)),
  );
}
