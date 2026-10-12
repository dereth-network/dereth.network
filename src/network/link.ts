// The link page's steps: the link `@dn link` gives in game carries a one-time code after its `#`,
// which no server is sent. Opening it links the character to the Discord account signed in,
// signing in first when nobody is, the code kept in the tab meanwhile. No DOM here, so all of it
// can be checked without a browser.
import { explain, readLinkCode } from './format.ts';
import { HubError } from './hub.ts';
import type { Hub, PersonCharacter } from './hub.ts';

/** Where the code waits in the tab while the player signs in with Discord. */
export const KEPT = 'dereth-link-code';

/** The page's own address, which the hub's sign-in comes back to. */
export const PAGE = '/link/';

/** What the page says. */
export const TEXT = {
  noCode: 'Type @dn link in game and open the link it gives you.',
  signingIn: 'Signing you in with Discord…',
  signInFailed: 'Signing in with Discord didn’t finish. Try again.',
  signInBusy: 'Discord asked the hub to wait a moment. Try signing in again shortly.',
  noSignIn: 'Linking characters needs a sign-in, which isn’t open on the hub yet.',
  notACode: 'That isn’t a link code: eight letters and numbers, like K7QD-2MXP.',
  used: 'This link was used already or has expired. Type @dn link in game for a new one.',
};

/** The code a link carries after its `#` (`#K7QD-2MXP`, `#code=k7qd2mxp`), or null. */
export function codeFromHash(hash: string): string | null {
  let text = hash.replace(/^#/, '');
  try {
    text = decodeURIComponent(text);
  } catch {
    return null;
  }
  return readLinkCode(text.replace(/^code=/i, ''));
}

/** What the tab keeps a code in: sessionStorage, which may be missing or refuse. */
export type Kept = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null | undefined;

/** Keeps `code` in the tab while the player signs in; nothing when the tab keeps nothing. */
export function keepCode(store: Kept, code: string): void {
  try {
    store?.setItem(KEPT, code);
  } catch {
    // A tab that keeps nothing (private browsing, storage turned off): the link is opened again.
  }
}

/** The code kept in the tab, taken out of it; null when none is. */
export function takeKeptCode(store: Kept): string | null {
  try {
    const kept = store?.getItem(KEPT) ?? null;
    store?.removeItem(KEPT);
    return kept === null ? null : readLinkCode(kept);
  } catch {
    return null;
  }
}

/** What the page does next. */
export type Step =
  /** Signed in, with a code: link the character. */
  | { do: 'link'; code: string }
  /** A code and nobody signed in: keep the code and go to the hub's sign-in. */
  | { do: 'sign-in'; code: string }
  /** The sign-in came back without one: say why and offer it again, never going round again
   * by itself. */
  | { do: 'offer-sign-in'; code: string | null; problem: string }
  /** No code: say how to get one, and offer a box for one. */
  | { do: 'ask' };

/** The next step for `code` (from the link, or kept while signing in), with someone signed in or
 * not, and `signin` (`failed` or `busy` when the hub's sign-in came back without one). */
export function nextStep(code: string | null, signedIn: boolean, signin: string | null): Step {
  if (code && signedIn) return { do: 'link', code };
  const problem =
    signin === 'failed' ? TEXT.signInFailed : signin === 'busy' ? TEXT.signInBusy : null;
  if (problem && !signedIn) return { do: 'offer-sign-in', code, problem };
  if (code) return { do: 'sign-in', code };
  return { do: 'ask' };
}

/** What linking said. */
export type Linked =
  | { ok: true; character: PersonCharacter; text: string }
  /** The session lapsed: sign in again, with the code kept. */
  | { ok: false; signIn: true }
  | { ok: false; signIn: false; text: string };

/** The line for a character linked. */
export function linkedText(character: PersonCharacter): string {
  const world = character.world.name ?? character.world.slug;
  return `${character.address}, on ${world}, is linked to your Discord account.`;
}

/** A refusal to link, in plain words: a code used, lapsed or never given is one answer. */
export function linkRefusal(error: unknown): string {
  if (error instanceof HubError && error.reason === 'no_such_code') return TEXT.used;
  return explain(error);
}

/** Links the character `code` was given for to the person signed in. */
export async function link(hub: Pick<Hub, 'linkCharacter'>, code: string): Promise<Linked> {
  try {
    const { character } = await hub.linkCharacter(code);
    return { ok: true, character, text: linkedText(character) };
  } catch (error) {
    if (error instanceof HubError && error.status === 401) return { ok: false, signIn: true };
    return { ok: false, signIn: false, text: linkRefusal(error) };
  }
}
