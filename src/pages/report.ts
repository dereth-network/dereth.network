// The report page: a signed-in visitor reports a world to the people who run the network.
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
import { REPORT_REASONS, explain, isRegistrySlug } from '../network/format.ts';
import { HubError } from '../network/hub.ts';
import type { HubConfig, ReportReason } from '../network/hub.ts';

const hub = pageHub();
const notices = byId('notices');
const signin = byId('signin');
const panel = byId('form-panel');
const done = byId('done');
const form = byId<HTMLFormElement>('form');
const slug = byId<HTMLInputElement>('slug');
const slugHint = byId('slug-hint');
const details = byId<HTMLTextAreaElement>('details');
const counter = byId('counter');
const send = byId<HTMLButtonElement>('send');
const slugHintStart = [...slugHint.childNodes].map((n) => n.cloneNode(true));
let config: HubConfig | null = null;

for (const [value, label] of Object.entries(REPORT_REASONS))
  byId('reasons').append(
    h(
      'label',
      { class: 'choice' },
      h('input', { type: 'radio', name: 'reason', value, required: true }),
      h('span', {}, label),
    ),
  );

details.addEventListener('input', () => {
  counter.textContent = `${details.value.length} / 2000`;
});

// The world the slug names, by its name, so nobody reports the wrong one.
let looking: ReturnType<typeof setTimeout> | undefined;
async function showWorld() {
  const wanted = slug.value.trim().toLowerCase();
  if (!isRegistrySlug(wanted)) {
    slugHint.className = 'hint';
    slugHint.replaceChildren(...slugHintStart.map((n) => n.cloneNode(true)));
    return;
  }
  try {
    const world = await hub.world(wanted);
    if (slug.value.trim().toLowerCase() !== wanted) return;
    slugHint.className = 'hint good';
    slugHint.textContent = `Reporting ${world.name}.`;
  } catch (error) {
    if (slug.value.trim().toLowerCase() !== wanted) return;
    slugHint.className = 'hint bad';
    slugHint.textContent =
      error instanceof HubError && error.status === 404
        ? 'The hub has no world by that slug.'
        : explain(error);
  }
}
slug.addEventListener('input', () => {
  clearTimeout(looking);
  looking = setTimeout(showWorld, 300);
});

function showSignIn() {
  panel.hidden = true;
  if (config) byId<HTMLAnchorElement>('signin-link').href = hub.signInUrl(config, herePath());
  signin.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const wanted = slug.value.trim().toLowerCase();
  if (!isRegistrySlug(wanted)) {
    fill(
      notices,
      notice(
        'error',
        'That isn’t a world’s slug: 2 to 40 lower-case letters, numbers and hyphens.',
      ),
    );
    return;
  }
  const reason = (form.elements.namedItem('reason') as RadioNodeList).value as ReportReason;
  fill(notices);
  try {
    await busy(send, () => hub.report({ slug: wanted, reason, details: details.value.trim() }));
    form.reset();
    counter.textContent = '0 / 2000';
    void showWorld();
    panel.hidden = true;
    done.hidden = false;
  } catch (error) {
    if (error instanceof HubError && error.status === 401) showSignIn();
    fill(notices, errorNotice(error));
  }
});

byId('another').addEventListener('click', () => {
  done.hidden = true;
  panel.hidden = false;
  slug.focus();
});

async function main() {
  const signin = takeQuery('signin');
  const world = new URLSearchParams(location.search).get('world');
  if (world && isRegistrySlug(world)) {
    slug.value = world;
    void showWorld();
  }
  try {
    config = await hub.config();
  } catch (error) {
    fill(notices, errorNotice(error));
    return;
  }
  if (!config.authEnabled) {
    fill(
      notices,
      notice(
        'note',
        'Reports need a sign-in, which isn’t open on the hub yet. Until it is, tell your world’s staff.',
      ),
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
  let signedIn;
  try {
    signedIn = await hub.operator();
  } catch (error) {
    append(notices, errorNotice(error));
    return;
  }
  if (!signedIn) return showSignIn();
  panel.hidden = false;
}

main().catch((error) => fill(notices, notice('error', explain(error))));
