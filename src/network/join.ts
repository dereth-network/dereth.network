// The join page's reading of a world link: a host sends a friend
// `https://dereth.network/join#host=...&port=...&name=...&game=...`, its world after the `#`,
// which a browser never sends to any server, so the site sees nothing of it. Its `game` is
// `dereth` or `auberean`; a link without one is Dereth's. The page offers to open it in the
// launcher, as `dereth://join?host=...&port=...&name=...` (with `&game=auberean` for Auberean's),
// which opens Add world with the world filled in for the friend to confirm. A link never carries
// an account or a password, and anything else it holds is ignored. The checks are the launcher's
// own for a world added by hand. No DOM here, so all of it can be checked without a browser.
import { GAME_NAMES } from '../games.ts';
import type { Game } from '../games.ts';

/** A world a link names. */
export interface JoinWorld {
  host: string;
  port: number;
  name: string;
  game: Game;
}

/** The most characters of a world's name a link carries. */
export const MAX_NAME = 80;

/** Where either game is downloaded: the launcher plays both. */
export const GET_DERETH = 'https://github.com/dereth-network/dereth/releases';

/** What the page says, naming the link's game. */
export function text(game: Game) {
  const name = GAME_NAMES[game];
  return {
    title: 'Join a world',
    lead: 'A friend sent you a link to their world.',
    open: `Open in ${name}`,
    get: `Get ${name}`,
    how: `${name} opens with the world filled in, ready to add. Nothing connects until you add it.`,
    noWorld: 'This link names no world. Ask your friend for the link again.',
    noApp: `Nothing happened? Get ${name} and open it once, then open this link again.`,
  };
}

/** `key=value` pairs of a fragment, decoded; one that does not decode is skipped. */
function pairs(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of text.split('&')) {
    if (!part) continue;
    const at = part.indexOf('=');
    const [k, v] = at < 0 ? [part, ''] : [part.slice(0, at), part.slice(at + 1)];
    try {
      const key = decodeURIComponent(k.replace(/\+/g, ' ')).toLowerCase();
      if (!out.has(key)) out.set(key, decodeURIComponent(v.replace(/\+/g, ' ')));
    } catch {
      // A broken escape: that pair says nothing.
    }
  }
  return out;
}

/** A world's name from a link: its control characters taken out, trimmed, and cut to
 * {@link MAX_NAME} characters; its host when nothing is left. */
function cleanName(name: string, host: string): string {
  const kept = [...name.replace(/\p{Cc}/gu, '').trim()].slice(0, MAX_NAME).join('').trim();
  return kept || host;
}

/** The world the page's `#...` names, or null when it names none a world can be added with: a
 * host with no space, colon or slash, and a port from 1 to 65535. */
export function worldFromHash(hash: string): JoinWorld | null {
  const fields = pairs(hash.replace(/^#/, ''));
  const host = (fields.get('host') ?? '').trim();
  const port = Number((fields.get('port') ?? '').trim());
  if (!host || /[\s:/]/.test(host)) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const game = fields.get('game')?.trim().toLowerCase() === 'auberean' ? 'auberean' : 'dereth';
  return { host, port, name: cleanName(fields.get('name') ?? '', host), game };
}

/** `text` encoded for a link: letters, digits and `-._~` as they are, every other byte `%XX`. */
function encode(text: string): string {
  return [...new TextEncoder().encode(text)]
    .map((b) =>
      /[A-Za-z0-9\-._~]/.test(String.fromCharCode(b))
        ? String.fromCharCode(b)
        : `%${b.toString(16).toUpperCase().padStart(2, '0')}`,
    )
    .join('');
}

/** The launcher's own link for `world`. */
export function appLink(world: JoinWorld): string {
  const link = `dereth://join?host=${encode(world.host)}&port=${world.port}&name=${encode(world.name)}`;
  return world.game === 'auberean' ? `${link}&game=auberean` : link;
}

/** The world as the page shows it: its name, and where it is. */
export function shown(world: JoinWorld): { name: string; where: string } {
  return { name: world.name, where: `${world.host}:${world.port}` };
}
