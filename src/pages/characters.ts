// Your characters: the signed-in person's linked characters (each can be unlinked, and one is
// linked with the code `/dn link` gave it in game), whether they're shown as one person, its
// friends, and forgetting all of it.
import {
  append,
  busy,
  byId,
  errorNotice,
  fill,
  h,
  herePath,
  notice,
  pageHub,
  takeQuery,
} from '../network/dom.ts';
import { explain, readLinkCode, when } from '../network/format.ts';
import { HubError } from '../network/hub.ts';
import type { HubConfig, Person } from '../network/hub.ts';

const hub = pageHub();
const notices = byId('notices');
const signin = byId('signin');
const panels = ['home', 'alts', 'friends', 'forget'].map((id) => byId(id));
const altsForm = byId<HTMLFormElement>('alts-form');
const altsSave = byId<HTMLButtonElement>('alts-save');
const sure = byId<HTMLInputElement>('forget-sure');
const forgetGo = byId<HTMLButtonElement>('forget-go');
const linkForm = byId<HTMLFormElement>('link-form');
const code = byId<HTMLInputElement>('code');
const hint = byId('code-hint');
const linkSend = byId<HTMLButtonElement>('link-send');
const hintStart = [...hint.childNodes].map((n) => n.cloneNode(true));
let config: HubConfig | null = null;

function showSignIn() {
  for (const p of panels) p.hidden = true;
  if (config) byId<HTMLAnchorElement>('signin-link').href = hub.signInUrl(config, herePath());
  signin.hidden = false;
}

/** A refusal: a lapsed session shows the sign-in again. */
function refused(error: unknown) {
  if (error instanceof HubError && error.status === 401) showSignIn();
  fill(notices, errorNotice(error));
}

function render(person: Person) {
  byId('who').textContent = person.name;
  const list = byId('characters');
  if (person.characters.length === 0) {
    fill(list, h('p', { class: 'empty' }, 'No character is linked yet.'));
  } else {
    fill(
      list,
      ...person.characters.map((c) => {
        const unlink = h('button', { class: 'btn small', type: 'button' }, 'Unlink');
        unlink.addEventListener('click', async () => {
          fill(notices);
          try {
            await busy(unlink, () => hub.unlinkCharacter(c.address));
            append(notices, notice('ok', `${c.address} is no longer linked.`));
            await refresh();
          } catch (error) {
            refused(error);
          }
        });
        return h(
          'div',
          { class: 'char-item' },
          h(
            'div',
            {},
            h(
              'p',
              {},
              h('b', {}, c.address),
              h('span', { class: 'muted' }, ` on ${c.world.name ?? c.world.slug}`),
            ),
            h('p', { class: 'when' }, `Linked ${when(c.linkedAt)}`),
          ),
          unlink,
        );
      }),
    );
  }
  byId<HTMLInputElement>(person.alts === 'shown' ? 'alts-shown' : 'alts-hidden').checked = true;
  const friends = byId('friends-list');
  if (person.friends.length === 0) {
    fill(friends, h('p', { class: 'empty' }, 'No friends yet.'));
  } else {
    fill(
      friends,
      ...person.friends.map((f) => {
        const remove = h('button', { class: 'btn small', type: 'button' }, 'Remove');
        remove.addEventListener('click', async () => {
          fill(notices);
          try {
            await busy(remove, () => hub.removePersonFriend(f.handle));
            append(notices, notice('ok', `${f.handle} is no longer your friend.`));
            await refresh();
          } catch (error) {
            refused(error);
          }
        });
        return h(
          'div',
          { class: 'report-item' },
          h('p', {}, h('b', {}, f.handle), ` added from ${f.addedFrom}`),
          h('p', { class: 'small muted' }, `Added ${when(f.addedAt)}`),
          h('div', { class: 'buttons' }, remove),
        );
      }),
    );
  }
  signin.hidden = true;
  for (const p of panels) p.hidden = false;
}

async function refresh() {
  const person = await hub.person();
  if (!person) return showSignIn();
  render(person);
}

function resetHint() {
  hint.className = 'hint';
  hint.replaceChildren(...hintStart.map((n) => n.cloneNode(true)));
}

code.addEventListener('input', () => {
  const read = readLinkCode(code.value);
  code.setAttribute('aria-invalid', String(code.value.trim() !== '' && read === null));
  if (read) {
    hint.className = 'hint good';
    hint.textContent = `Linking with ${read}.`;
  } else resetHint();
});

linkForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const read = readLinkCode(code.value);
  if (!read) {
    fill(
      notices,
      notice('error', 'That isn’t a link code: eight letters and numbers, like K7QD-2MXP.'),
    );
    return;
  }
  fill(notices);
  try {
    const linked = await busy(linkSend, () => hub.linkCharacter(read));
    linkForm.reset();
    resetHint();
    const world = linked.character.world.name ?? linked.character.world.slug;
    render(linked.person);
    append(notices, notice('ok', `${linked.character.address}, on ${world}, is linked.`));
  } catch (error) {
    refused(error);
  }
});

altsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const shown = byId<HTMLInputElement>('alts-shown').checked;
  fill(notices);
  try {
    const { person } = await busy(altsSave, () => hub.setAlts(shown));
    render(person);
    append(notices, notice('ok', shown ? 'Your alts are shown now.' : 'Your alts are hidden now.'));
  } catch (error) {
    refused(error);
  }
});

sure.addEventListener('change', () => {
  forgetGo.disabled = !sure.checked;
});

forgetGo.addEventListener('click', async () => {
  if (!sure.checked) return;
  fill(notices);
  try {
    await busy(forgetGo, () => hub.forgetPerson());
    sure.checked = false;
    forgetGo.disabled = true;
    append(notices, notice('ok', 'Forgotten.'));
    await refresh();
  } catch (error) {
    refused(error);
  }
});

byId('signout').addEventListener('click', async () => {
  try {
    await hub.signOut();
  } catch {
    // Signed out or not, the page offers the sign-in again.
  }
  showSignIn();
});

async function main() {
  const signin = takeQuery('signin');
  try {
    config = await hub.config();
  } catch (error) {
    fill(notices, errorNotice(error));
    return;
  }
  if (!config.authEnabled) {
    fill(
      notices,
      notice('note', 'Linking characters needs a sign-in, which isn’t open on the hub yet.'),
    );
    return;
  }
  if (signin === 'failed')
    append(notices, notice('error', 'Signing in with Discord didn’t finish. Try again.'));
  if (signin === 'busy')
    append(
      notices,
      notice('note', 'Discord asked the hub to wait a moment. Try signing in again shortly.'),
    );
  try {
    await refresh();
  } catch (error) {
    append(notices, errorNotice(error));
  }
}

main().catch((error) => fill(notices, notice('error', explain(error))));
