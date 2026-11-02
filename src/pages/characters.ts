// Your characters: the signed-in person's linked characters (each can be unlinked; one is linked
// with the link `@dn link` gives it in game, on the link page), where each stands in the
// directory, its friends, how tells reach its Discord, and forgetting all of it. The characters of
// the realm's game come first.
import { GAME_NAMES, gameFirst, gameOf } from '../games.ts';
import type { Game } from '../games.ts';
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
import { characterHref, listingText } from '../network/directory.ts';
import { discordFeatures } from '../network/discord.ts';
import { explain, when } from '../network/format.ts';
import { HubError } from '../network/hub.ts';
import type { HubConfig, Person, PersonCharacter } from '../network/hub.ts';
import { currentGame, onRealm } from '../realm.ts';

const hub = pageHub();
const notices = byId('notices');
const signin = byId('signin');
const panels = ['home', 'friends', 'forget'].map((id) => byId(id));
// The panel shown only on a hub that carries tells into Discord.
const discordPanel = byId('discord');
const sure = byId<HTMLInputElement>('forget-sure');
const forgetGo = byId<HTMLButtonElement>('forget-go');
let config: HubConfig | null = null;
// The person shown, to show again in the other realm's order.
let shown: Person | null = null;
// Each network world's game, by its slug, for a character the hub doesn't name the game of; a
// character's world the network doesn't list is Dereth's.
const worldGames = hub
  .network()
  .then(({ worlds }) => new Map(worlds.map((w) => [w.slug, gameOf(w)])))
  .catch(() => new Map<string, Game>());
let gameOfWorld = new Map<string, Game>();
const characterGame = (c: PersonCharacter): Game =>
  c.game ? gameOf(c) : (gameOfWorld.get(c.world.slug) ?? 'dereth');

function showSignIn() {
  for (const p of panels) p.hidden = true;
  discordPanel.hidden = true;
  if (config) byId<HTMLAnchorElement>('signin-link').href = hub.signInUrl(config, herePath());
  signin.hidden = false;
}

/** A refusal, in the hub's words: a lapsed session shows the sign-in again. */
function refused(error: unknown) {
  if (error instanceof HubError && error.status === 401) showSignIn();
  fill(notices, errorNotice(error));
}

function render(person: Person) {
  shown = person;
  byId('who').textContent = person.name;
  const list = byId('characters');
  const game = currentGame();
  const characters = gameFirst(person.characters, game, characterGame);
  // Both games' characters: each game's under its name.
  const both =
    characters.some((c) => characterGame(c) !== game) &&
    characters.some((c) => characterGame(c) === game);
  let heading: Game | null = null;
  if (characters.length === 0) {
    fill(list, h('p', { class: 'empty' }, 'No character is linked yet.'));
  } else {
    fill(
      list,
      ...characters.flatMap((c) => {
        let head: HTMLElement | null = null;
        if (both && characterGame(c) !== heading) {
          heading = characterGame(c);
          head = h('p', { class: 'group' }, GAME_NAMES[heading]);
        }
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
        const listed = c.listing === 'listed';
        const state = listingText(c.listing);
        const item = h(
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
            h(
              'p',
              { class: 'listed' },
              listed
                ? h(
                    'a',
                    { class: `badge ${state.tone}`, href: characterHref(c.address) },
                    state.text,
                  )
                : h('span', { class: `badge ${state.tone}` }, state.text),
            ),
          ),
          h('div', { class: 'char-actions' }, unlink),
        );
        return head ? [head, item] : [item];
      }),
    );
  }
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
  discordPanel.hidden = !discordFeatures(config).tells;
  signin.hidden = true;
  for (const p of panels) p.hidden = false;
}

async function refresh() {
  const [person, games] = await Promise.all([hub.person(), worldGames]);
  gameOfWorld = games;
  if (!person) return showSignIn();
  render(person);
}

onRealm(() => {
  if (shown && !byId('home').hidden) render(shown);
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
    append(
      notices,
      notice(
        'ok',
        'Forgotten. Your characters are off the Dereth Network, or will be when their worlds are next online.',
      ),
    );
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
