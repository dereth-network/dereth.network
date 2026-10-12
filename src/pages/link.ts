// Link a character: the link `@dn link` gives in game opens here with its code after the `#`. The
// code comes out of the address bar at once; signed in, the character is linked; signed out, the
// code waits in the tab while the player signs in with Discord, and is linked on the way back.
// A link opened without its code offers a box for the code instead.
import {
  append,
  busy,
  byId,
  errorNotice,
  fill,
  h,
  notice,
  pageHub,
  takeQuery,
} from '../network/dom.ts';
import { explain, readLinkCode } from '../network/format.ts';
import {
  PAGE,
  TEXT,
  codeFromHash,
  keepCode,
  link,
  nextStep,
  takeKeptCode,
} from '../network/link.ts';
import type { Kept } from '../network/link.ts';
import type { HubConfig } from '../network/hub.ts';

const hub = pageHub();
const notices = byId('notices');
const done = byId('done');
const ask = byId('ask');
const signin = byId('signin');
const signinLink = byId<HTMLAnchorElement>('signin-link');
const form = byId<HTMLFormElement>('code-form');
const box = byId<HTMLInputElement>('code');
const send = byId<HTMLButtonElement>('code-send');
let config: HubConfig | null = null;

/** The tab's storage, if it has one it lets the page use. */
function tabStore(): Kept {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

/** Shows the sign-in button, coming back here. */
function offerSignIn() {
  if (config) signinLink.href = hub.signInUrl(config, PAGE);
  signin.hidden = false;
}

/** Keeps `code` and goes to the hub's sign-in, coming back here. */
function signInWith(code: string) {
  if (!config) return;
  keepCode(tabStore(), code);
  fill(notices, notice('note', TEXT.signingIn));
  location.assign(hub.signInUrl(config, PAGE));
}

/** Links `code`'s character, and says how it went. */
async function linkCode(code: string) {
  fill(notices);
  const linked = await link(hub, code);
  if (linked.ok) {
    ask.hidden = true;
    signin.hidden = true;
    fill(
      done,
      notice('ok', linked.text),
      h(
        'div',
        { class: 'buttons' },
        h('a', { class: 'btn', href: '/characters/' }, 'Your characters'),
      ),
    );
    done.hidden = false;
    return;
  }
  if (linked.signIn) return signInWith(code);
  append(notices, notice('error', linked.text));
  ask.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = readLinkCode(box.value);
  if (!code) {
    fill(notices, notice('error', TEXT.notACode));
    return;
  }
  try {
    const signedIn = (await hub.person()) !== null;
    if (signedIn) await busy(send, () => linkCode(code));
    else signInWith(code);
  } catch (error) {
    fill(notices, errorNotice(error));
  }
});

async function main() {
  // The code comes out of the address bar before anything else: it is the player's to keep.
  const fromLink = location.hash ? codeFromHash(location.hash) : null;
  if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);
  const came = takeQuery('signin');
  try {
    config = await hub.config();
  } catch (error) {
    fill(notices, errorNotice(error));
    return;
  }
  if (!config.authEnabled) {
    fill(notices, notice('note', TEXT.noSignIn));
    return;
  }
  const code = fromLink ?? takeKeptCode(tabStore());
  const signedIn = (await hub.person()) !== null;
  const step = nextStep(code, signedIn, came);
  switch (step.do) {
    case 'link':
      return linkCode(step.code);
    case 'sign-in':
      return signInWith(step.code);
    case 'offer-sign-in':
      if (step.code) keepCode(tabStore(), step.code);
      fill(notices, notice('error', step.problem));
      return offerSignIn();
    case 'ask':
      ask.hidden = false;
      if (!signedIn) offerSignIn();
  }
}

main().catch((error) => fill(notices, notice('error', explain(error))));
