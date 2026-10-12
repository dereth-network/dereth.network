// The operators page: sign in with Discord, then register or claim a world, prove you run it,
// turn the network on or off for it, get it a new key, mirror its rooms into your Discord server,
// follow your reports, and, for the hub's admins, review everyone's and keep the hub's settings.
import {
  append,
  build,
  busy,
  byId,
  copyField,
  errorNotice,
  fill,
  h,
  herePath,
  notice,
  pageHub,
  takeQuery,
} from '../network/dom.ts';
import {
  discordFeatures,
  globalRoomView,
  hubDiscordView,
  keepAfterRefusal,
  mirrorNetworkRoom,
  mirrorRefusal,
  mirrorWorldRoom,
  roomName,
  setAvatar,
  setGlobalRoom,
  stopNetworkMirror,
  stopWorldMirror,
  takeWorldMirror,
  worldMirrorsView,
} from '../network/discord.ts';
import type { MirrorOutcome, Said } from '../network/discord.ts';
import {
  APPROVAL_TEXT,
  REPORT_REASONS,
  STAGE_TEXT,
  auditText,
  explain,
  isNetworkSlug,
  isRegistrySlug,
  needsProof,
  reportOutcome,
  stage,
  when,
} from '../network/format.ts';
import type { Stage } from '../network/format.ts';
import { HubError } from '../network/hub.ts';
import type {
  Approval,
  AuditEvent,
  DiscordAdmin,
  HubConfig,
  HubSettingName,
  HubSettings,
  Operator,
  Report,
  Verification,
  World,
  WorldMirrors,
} from '../network/hub.ts';
import { registrationForm } from '../network/registration-form.ts';
import {
  saveSetting,
  settingEventText,
  settingsRefusal,
  settingsView,
} from '../network/settings.ts';

const hub = pageHub();
const notices = byId('notices');
const sections = {
  signin: byId('signin'),
  home: byId('home'),
  register: byId('register'),
  claim: byId('claim'),
  reports: byId('reports'),
  review: byId('review'),
  hubSettings: byId('hub-settings'),
};
const worldsBox = byId('worlds');

// What the hub shows only once (a world's key, its verification token), kept while the page is
// open and never stored.
const shown = new Map<string, { key?: string; verification?: Verification }>();
// The last thing said about each world, shown in its card.
const messages = new Map<string, HTMLElement>();
const audits = new Map<string, AuditEvent[]>();
const historyOpen = new Set<string>();
// Each world's mirrors into Discord, read when its part is first opened, the last thing said
// about them, and the parts left open.
const worldMirrors = new Map<string, WorldMirrors>();
const mirrorsSaid = new Map<string, Said>();
const mirrorsOpen = new Set<string>();
/** The world cards left open, so a card redrawn after an action stays as it was. */
const cardsOpen = new Set<string>();
let worlds: World[] = [];
let operator: Operator | null = null;
let config: HubConfig | null = null;

const cardId = (slug: string) => `world-${slug}`;
const STAGE_TONE: Record<Stage, string> = {
  locked: 'bad',
  claim: 'wait',
  pending: 'wait',
  reverify: 'wait',
  on: 'on',
  'off-network-slug': '',
  off: '',
};
const METHOD_TEXT: Record<string, string> = {
  page: 'by a page on its host',
  game: 'in game',
  review: 'by the hub’s operator',
};

const signedOutError = (error: unknown) => error instanceof HubError && error.status === 401;

/** The session ended (or never was): back to the sign-in panel. */
function signedOut() {
  operator = null;
  for (const section of Object.values(sections)) section.hidden = true;
  fill(notices, notice('note', 'You’re signed out. Sign in again to carry on.'));
  if (config) showSignIn(config, null);
}

function showSignIn(c: HubConfig, claim: string | null) {
  const signIn = hub.signInUrl(c, herePath());
  byId<HTMLAnchorElement>('signin-link').href = signIn;
  // The steps' Sign in and Register both start with signing in.
  byId<HTMLAnchorElement>('step-signin').href = signIn;
  byId<HTMLAnchorElement>('step-register').href = signIn;
  const claimLine = byId('signin-claim');
  if (claim && isRegistrySlug(claim)) {
    claimLine.textContent = `Sign in to claim @${claim}.`;
    claimLine.hidden = false;
  }
  sections.signin.hidden = false;
}

function upsert(world: World) {
  const i = worlds.findIndex((w) => w.slug === world.slug);
  if (i >= 0) worlds[i] = world;
  else worlds.unshift(world);
}

function renderWorlds() {
  if (worlds.length === 0)
    fill(
      worldsBox,
      h('p', { class: 'empty' }, 'None yet. Register your world, or claim its listing.'),
    );
  else fill(worldsBox, ...worlds.map(worldCard));
}

function redraw(slug: string) {
  const world = worlds.find((w) => w.slug === slug);
  const old = document.getElementById(cardId(slug));
  if (world && old) old.replaceWith(worldCard(world));
  else renderWorlds();
}

/** Runs an action on one world, then redraws its card with what came of it. */
async function act(
  slug: string,
  button: HTMLButtonElement,
  work: () => Promise<HTMLElement | void>,
) {
  messages.delete(slug);
  try {
    const said = await busy(button, work);
    if (said) messages.set(slug, said);
  } catch (error) {
    if (signedOutError(error)) return signedOut();
    messages.set(slug, errorNotice(error));
  }
  redraw(slug);
}

function button(label: string, kind = '') {
  return h('button', { class: kind ? `btn small ${kind}` : 'btn small', type: 'button' }, label);
}

function worldCard(world: World): HTMLElement {
  const s = stage(world);
  const owner = world.operator?.role === 'owner';
  const managed = world.ownership?.state === 'managed';
  const got = shown.get(world.slug);
  const live = owner && managed && s !== 'locked';
  const said = messages.get(world.slug);
  // Closed until opened, except when it has something to say or a key to show once.
  const card = h(
    'details',
    {
      class: 'op-world',
      id: cardId(world.slug),
      open: cardsOpen.has(world.slug) || Boolean(said) || Boolean(got?.key),
    },
    h(
      'summary',
      { class: 'world-head' },
      h('h3', {}, world.name),
      h('code', {}, `@${world.slug}`),
      h('span', { class: `badge ${STAGE_TONE[s]}` }, STAGE_TEXT[s]),
    ),
    said ?? null,
    got?.key ? keyPart(world, got.key) : null,
    s === 'locked' ? lockedPart(world) : null,
    needsProof(world) && s !== 'locked' ? proofPart(world, got?.verification) : null,
    live ? networkPart(world) : null,
    live ? keyRotatePart(world) : null,
    live && discordFeatures(config).mirrors ? globalPart(world) : null,
    live && discordFeatures(config).mirrors ? discordPart(world) : null,
    changePart(world),
    historyPart(world),
  );
  if (card.open) cardsOpen.add(world.slug);
  card.addEventListener('toggle', () => {
    if (card.open) cardsOpen.add(world.slug);
    else cardsOpen.delete(world.slug);
  });
  return card;
}

function keyPart(world: World, key: string): HTMLElement {
  const proven = world.ownership?.state === 'managed' && world.operator?.role === 'owner';
  const done = button('I’ve saved it');
  done.addEventListener('click', () => {
    const got = shown.get(world.slug);
    if (got) got.key = undefined;
    redraw(world.slug);
  });
  return h(
    'div',
    { class: 'secret' },
    h(
      'p',
      {},
      h('b', {}, 'The world’s key. '),
      'This is the only time the hub shows it, so copy it somewhere safe now. ',
      proven
        ? 'If it’s ever lost, get a new one here.'
        : 'If it’s lost before the world is proven, withdraw and start again.',
    ),
    copyField(key, `The key for ${world.name}`),
    h(
      'p',
      { class: 'small muted' },
      'Give it to the world’s server: the ACE mod reads it from the ',
      h('code', {}, 'DERETH_NETWORK_KEY'),
      ' environment variable, Empyrean from the file its ',
      h('code', {}, '[federation] key_file'),
      ' setting names. Keep it out of shared config files and scripts.',
    ),
    done,
  );
}

function lockedPart(world: World): HTMLElement {
  const locked = world.operator?.locked;
  return h(
    'div',
    { class: 'part' },
    notice(
      'error',
      `The hub’s operator locked this world${locked?.at ? ` on ${when(locked.at)}` : ''}`,
      locked?.reason ? `: ${locked.reason}` : '.',
      ' Its network is off and it can’t get a new key. Ask the hub’s operator about it.',
    ),
  );
}

function proofPart(world: World, verification: Verification | undefined): HTMLElement {
  const slug = world.slug;
  const s = stage(world);
  const part = h(
    'div',
    { class: 'part' },
    h(
      'p',
      {},
      s === 'reverify'
        ? 'The world’s address changed since it was proven. Prove it again from the new one.'
        : s === 'claim'
          ? 'Prove you run this world, and the listing becomes yours.'
          : 'Prove you run this world. Until you do, it’s listed nowhere.',
    ),
  );
  if (!verification) {
    const v = world.operator?.verification;
    const get = button('Get a token', 'lit');
    get.addEventListener('click', () =>
      act(slug, get, async () => {
        const { verification: fresh } = await hub.newVerification(slug);
        shown.set(slug, { ...shown.get(slug), verification: fresh });
      }),
    );
    append(
      part,
      h(
        'p',
        { class: 'muted' },
        v?.open
          ? `A token is open until ${when(v.expiresAt)}, but the hub shows a token only once. If you don’t have it, get a new one; it replaces the old.`
          : 'Get a token to start. It lasts a week.',
      ),
      get,
    );
    return part;
  }

  append(
    part,
    h('p', {}, `Your token, good until ${when(verification.expiresAt)}:`),
    copyField(verification.token, 'The verification token'),
    h('h3', {}, 'On a page'),
  );
  const hosts = verification.page?.hosts ?? [];
  if (world.endpoint?.mode === 'observed' || hosts.length === 0) {
    append(
      part,
      h(
        'p',
        { class: 'muted' },
        'This world has no fixed address: players reach it wherever its server connects to the hub from. There is no page to put the token on, so it can only be proven in game.',
      ),
    );
  } else {
    const url = h('input', {
      type: 'url',
      required: true,
      maxlength: '500',
      placeholder: `https://${hosts[hosts.length - 1]}/network.txt`,
      'aria-label': 'The page’s address',
    });
    const check = h('button', { class: 'btn small lit', type: 'submit' }, 'Check the page');
    const form = h('form', { class: 'inline' }, url, check);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      void act(slug, check, async () => {
        const { world: proven, approval } = await hub.verifyPage(slug, url.value.trim());
        upsert(proven);
        shown.set(slug, { ...shown.get(slug), verification: undefined });
        return provenNotice(approval);
      });
    });
    append(
      part,
      h(
        'p',
        {},
        `Put the token anywhere on a page on ${hosts.join(' or ')} (a plain text file will do), then give its address. The hub fetches it once, over http or https, and follows no redirect to another host.`,
      ),
      form,
    );
  }

  const recheck = button('I’ve typed it: check');
  recheck.addEventListener('click', () =>
    act(slug, recheck, async () => {
      const { world: fresh, audit } = await hub.myWorld(slug);
      upsert(fresh);
      audits.set(slug, audit);
      if (needsProof(fresh))
        return notice(
          'note',
          'Not proven yet. The command has to be typed on the world itself, while its server runs with this world’s key; the world shows the hub’s answer.',
        );
      shown.set(slug, { ...shown.get(slug), verification: undefined });
      if (fresh.federation === 'on') return provenNotice('approved');
      return provenNotice(isNetworkSlug(slug) ? null : 'not_network_slug');
    }),
  );
  append(
    part,
    h('h3', {}, 'In game'),
    h(
      'p',
      {},
      'Or, with the world running with its key in place, type this as an Admin character in game (at the server console, the same without the slash):',
    ),
    copyField(verification.game ?? `@dn verify ${verification.token}`, 'The command to type'),
    recheck,
  );
  return part;
}

function provenNotice(approval: Approval | null): HTMLElement {
  return notice(
    approval === 'approved' ? 'ok' : 'note',
    'Proven. ',
    approval ? APPROVAL_TEXT[approval] : 'The network is off for this world; turn it on below.',
  );
}

function networkPart(world: World): HTMLElement {
  const slug = world.slug;
  const s = stage(world);
  const v = world.operator?.verification;
  const proven = v?.verifiedAt
    ? `Proven ${when(v.verifiedAt)}${v.method && METHOD_TEXT[v.method] ? ` ${METHOD_TEXT[v.method]}` : ''}.`
    : '';
  const part = h('div', { class: 'part' });
  if (world.federation === 'on') {
    const off = button('Turn the network off', 'danger');
    off.addEventListener('click', () => {
      if (
        !confirm(
          `Turn the network off for ${world.name}? Its players lose touch with other worlds until you turn it back on.`,
        )
      )
        return;
      void act(slug, off, async () => {
        const answer = await hub.setFederation(slug, 'off');
        world.federation = answer.federation;
        return notice('ok', 'The network is off for this world.');
      });
    });
    append(
      part,
      h(
        'p',
        {},
        'On the network: its players can join with ',
        h('code', {}, '@dn on'),
        '. ',
        proven,
      ),
      off,
    );
  } else if (s === 'off-network-slug') {
    append(
      part,
      h(
        'p',
        {},
        'This world’s slug is longer than 12 characters, or kept back, so it can’t join the network; it stays listed. ',
        proven,
      ),
    );
  } else {
    const on = button('Turn the network on', 'lit');
    on.addEventListener('click', () =>
      act(slug, on, async () => {
        try {
          const answer = await hub.setFederation(slug, 'on');
          world.federation = answer.federation;
          const approval = answer.approval ?? (answer.federation === 'on' ? 'approved' : null);
          return notice(
            approval === 'approved' ? 'ok' : 'note',
            approval ? APPROVAL_TEXT[approval] : 'The network is still off.',
          );
        } catch (error) {
          // A refusal with a reason (not proven, a slug that can't join, locked, today's
          // approvals spent) is a state of the world, not a failure.
          if (error instanceof HubError && error.reason && !signedOutError(error))
            return notice('note', explain(error));
          throw error;
        }
      }),
    );
    append(part, h('p', {}, 'The network is off for this world. ', proven), on);
  }
  return part;
}

function keyRotatePart(world: World): HTMLElement {
  const slug = world.slug;
  const issued = world.operator?.key?.issuedAt;
  const rotate = button('Get a new key');
  rotate.addEventListener('click', () => {
    if (
      !confirm(
        'A new key stops the old one at once: the world drops off the network until its server has the new key. Go ahead?',
      )
    )
      return;
    void act(slug, rotate, async () => {
      const { key } = await hub.rotateKey(slug);
      shown.set(slug, { ...shown.get(slug), key });
      if (world.operator) world.operator.key = { issuedAt: new Date().toISOString() };
      return notice('ok', 'Here’s the new key. The old one has stopped.');
    });
  });
  return h(
    'div',
    { class: 'part' },
    h('p', {}, issued ? `Its key was issued ${when(issued)}.` : 'It has no key yet.'),
    rotate,
  );
}

function changePart(world: World): HTMLElement | null {
  const slug = world.slug;
  const owner = world.operator?.role === 'owner';
  const withdrawable = !owner || world.ownership?.state === 'pending';
  if (!owner && !withdrawable) return null;
  const part = h('div', { class: 'part' });
  if (owner) {
    const details = h('details', {}, h('summary', {}, 'Change the registration'));
    let built = false;
    details.addEventListener('toggle', () => {
      if (!details.open || built) return;
      built = true;
      details.append(
        registrationForm({
          world,
          submit: 'Save',
          onSubmit: async (registration) => {
            try {
              const { world: saved } = await hub.update(slug, registration);
              upsert(saved);
              messages.set(
                slug,
                notice(
                  'ok',
                  'Saved.',
                  needsProof(saved) && !needsProof(world)
                    ? ' The address changed, so prove the world again.'
                    : '',
                ),
              );
              redraw(slug);
            } catch (error) {
              if (signedOutError(error)) signedOut();
              throw error;
            }
          },
        }),
      );
    });
    part.append(details);
  }
  if (withdrawable) {
    const claim = world.operator?.role === 'claimant';
    const withdraw = button(claim ? 'Withdraw the claim' : 'Withdraw this registration', 'danger');
    withdraw.addEventListener('click', () => {
      if (
        !confirm(
          claim
            ? `Withdraw your claim on ${world.name}? Its key goes with it.`
            : `Withdraw ${world.name}? It’s removed, with its key.`,
        )
      )
        return;
      void act(slug, withdraw, async () => {
        await hub.withdraw(slug);
        worlds = worlds.filter((w) => w.slug !== slug);
        shown.delete(slug);
        fill(notices, notice('ok', claim ? 'Claim withdrawn.' : `${world.name} is withdrawn.`));
      });
    });
    part.append(h('div', { class: 'buttons' }, withdraw));
  }
  return part;
}

function historyPart(world: World): HTMLElement {
  const slug = world.slug;
  const body = h('div', {});
  const details = h('details', { open: historyOpen.has(slug) }, h('summary', {}, 'History'), body);
  const show = (events: AuditEvent[]) =>
    fill(
      body,
      events.length === 0
        ? h('p', { class: 'muted' }, 'Nothing yet.')
        : h('table', { class: 'audit' }, h('tbody', {}, ...events.map(auditRow))),
    );
  const load = async () => {
    fill(body, h('p', { class: 'muted' }, 'Loading…'));
    try {
      const { audit } = await hub.myWorld(slug);
      audits.set(slug, audit);
      show(audit);
    } catch (error) {
      if (signedOutError(error)) return signedOut();
      fill(body, errorNotice(error));
    }
  };
  // A details element drawn open also fires its toggle event, so the history is fetched once.
  let started = false;
  const opened = () => {
    historyOpen.add(slug);
    if (started) return;
    started = true;
    const cached = audits.get(slug);
    if (cached) show(cached);
    else void load();
  };
  details.addEventListener('toggle', () => (details.open ? opened() : historyOpen.delete(slug)));
  if (historyOpen.has(slug)) opened();
  return h('div', { class: 'part' }, details);
}

/** Where the world carries cross-world Global chat, read with its mirrors as the card is drawn,
 * and saved as soon as another room is picked; the card is drawn again after, since the Discord
 * mirrors show the room it took over. Nothing on a hub that keeps no such room. */
function globalPart(world: World): HTMLElement {
  const slug = world.slug;
  const part = h('div', { class: 'part' });
  part.hidden = true;
  const show = (state: WorldMirrors) => {
    const view = build(globalRoomView(state));
    if (!view) return;
    fill(part, view);
    part.hidden = false;
    const select = part.querySelector<HTMLSelectElement>('select[name="room"]')!;
    select.addEventListener('change', async () => {
      select.disabled = true;
      const outcome = await setGlobalRoom(hub, slug, select.value, state);
      if (signedOutError(outcome.error)) return signedOut();
      worldMirrors.set(slug, outcome.state);
      messages.set(slug, notice(outcome.said.kind, outcome.said.text));
      redraw(slug);
    });
  };
  const known = worldMirrors.get(slug);
  if (known) show(known);
  else
    void hub
      .worldMirrors(slug)
      .then((state) => {
        worldMirrors.set(slug, state);
        show(state);
      })
      .catch(() => {});
  return part;
}

/** The world's rooms mirrored into Discord: read when first opened, then kept while the page is
 * open, each change redrawing the part alone. */
function discordPart(world: World): HTMLElement {
  const slug = world.slug;
  const body = h('div', {});
  const details = h(
    'details',
    { open: mirrorsOpen.has(slug) },
    h('summary', {}, 'Discord mirrors'),
    body,
  );
  const show = () => {
    const state = worldMirrors.get(slug);
    if (!state) return;
    // Said once: a card drawn again later starts without it.
    const said = h('div', { class: 'notices' }, saidNotice(mirrorsSaid.get(slug)));
    mirrorsSaid.delete(slug);
    fill(body, said, build(worldMirrorsView(world, state)));
    const settle = (outcome: MirrorOutcome<WorldMirrors>, field?: HTMLInputElement) =>
      settled(outcome, said, field, () => {
        worldMirrors.set(slug, outcome.state);
        mirrorsSaid.set(slug, outcome.said);
        show();
        // An admin's list of every world's mirrors holds this one too.
        if (operator?.admin) void loadHubDiscord();
      });
    wireForms(body, 'mirror', async (form, submit) => {
      const room = form.dataset.room ?? '';
      const field = targetOf(form);
      const typed = field.value;
      settle(await busy(submit, () => mirrorWorldRoom(hub, slug, room, typed, state)), field);
    });
    wireButtons(body, 'stop', async (b) => {
      const room = b.dataset.room ?? '';
      if (
        !confirm(
          `Stop mirroring ${roomName(room)} into Discord? Its lines stop reaching the channel until you mirror it again.`,
        )
      )
        return;
      settle(await busy(b, () => stopWorldMirror(hub, slug, room, state)));
    });
  };
  const load = async () => {
    fill(body, h('p', { class: 'muted' }, 'Loading…'));
    try {
      worldMirrors.set(slug, await hub.worldMirrors(slug));
      show();
    } catch (error) {
      if (signedOutError(error)) return signedOut();
      fill(body, notice('error', mirrorRefusal(error)));
    }
  };
  // A details element drawn open also fires its toggle event, so the mirrors are read once.
  let started = false;
  const opened = () => {
    mirrorsOpen.add(slug);
    if (started) return;
    started = true;
    if (worldMirrors.has(slug)) show();
    else void load();
  };
  details.addEventListener('toggle', () => (details.open ? opened() : mirrorsOpen.delete(slug)));
  if (mirrorsOpen.has(slug)) opened();
  return h('div', { class: 'part' }, details);
}

function saidNotice(said: Said | undefined): HTMLElement | null {
  return said ? notice(said.kind, said.text) : null;
}

/** After an action on mirrors or on the hub's settings: a lapsed session signs out; a refusal is
 * said in `said`, the forms left as typed but for `field`, which keeps a channel and nothing else
 * (never a webhook's address); anything else is kept by `done`, which draws the part again. */
function settled<S>(
  outcome: MirrorOutcome<S>,
  said: HTMLElement,
  field: HTMLInputElement | undefined,
  done: () => void,
) {
  if (signedOutError(outcome.error)) return signedOut();
  if (outcome.said.kind !== 'error') return done();
  if (field) field.value = keepAfterRefusal(field.value);
  fill(said, notice('error', outcome.said.text));
  said.scrollIntoView({ block: 'nearest' });
}

/** A mirror form's field for where the mirror goes. */
function targetOf(form: HTMLFormElement): HTMLInputElement {
  return form.querySelector<HTMLInputElement>('input[name="target"]')!;
}

/** Wires each form marked `act` in `box`: `run` is given the form and its submit button. */
function wireForms(
  box: HTMLElement,
  act: string,
  run: (form: HTMLFormElement, submit: HTMLButtonElement) => Promise<void>,
) {
  for (const form of box.querySelectorAll<HTMLFormElement>(`form[data-act="${act}"]`)) {
    const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void run(form, submit);
    });
  }
}

/** Wires each button marked `act` in `box`. */
function wireButtons(box: HTMLElement, act: string, run: (b: HTMLButtonElement) => Promise<void>) {
  for (const b of box.querySelectorAll<HTMLButtonElement>(`button[data-act="${act}"]`))
    b.addEventListener('click', () => void run(b));
}

function auditRow(event: AuditEvent): HTMLElement {
  return h(
    'tr',
    {},
    h('td', {}, when(event.at)),
    h('td', {}, auditText(event, operator?.id ?? null)),
  );
}

// Registering and claiming.

function openRegister() {
  sections.claim.hidden = true;
  const box = byId('register-form');
  fill(
    box,
    registrationForm({
      world: null,
      submit: 'Register',
      onCancel: () => (sections.register.hidden = true),
      onSubmit: async (registration) => {
        try {
          const made = await hub.register(registration);
          shown.set(made.world.slug, { key: made.key, verification: made.verification });
          messages.set(
            made.world.slug,
            notice('ok', 'Registered. Save its key, then prove you run it.'),
          );
          upsert(made.world);
          sections.register.hidden = true;
          renderWorlds();
          document.getElementById(cardId(made.world.slug))?.scrollIntoView({ block: 'start' });
        } catch (error) {
          if (signedOutError(error)) signedOut();
          throw error;
        }
      },
    }),
  );
  sections.register.hidden = false;
  sections.register.scrollIntoView({ block: 'start' });
}

function openClaim(slug = '') {
  sections.register.hidden = true;
  byId<HTMLInputElement>('claim-slug').value = slug;
  sections.claim.hidden = false;
  sections.claim.scrollIntoView({ block: 'start' });
}

function wireClaim() {
  const form = byId<HTMLFormElement>('claim-form');
  const input = byId<HTMLInputElement>('claim-slug');
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const said = h('div', { class: 'notices' });
  form.insertBefore(said, submit.parentElement);
  byId('close-claim').addEventListener('click', () => (sections.claim.hidden = true));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const slug = input.value.trim().toLowerCase();
    fill(said);
    if (!isRegistrySlug(slug)) {
      fill(
        said,
        notice('error', 'That isn’t a slug: 2 to 40 lower-case letters, numbers and hyphens.'),
      );
      return;
    }
    try {
      const made = await busy(submit, () => hub.claim(slug));
      shown.set(slug, { key: made.key, verification: made.verification });
      messages.set(slug, notice('ok', 'Claimed. Save the key, then prove you run the world.'));
      upsert(made.world);
      sections.claim.hidden = true;
      input.value = '';
      renderWorlds();
      document.getElementById(cardId(slug))?.scrollIntoView({ block: 'start' });
    } catch (error) {
      if (signedOutError(error)) return signedOut();
      fill(said, errorNotice(error));
    }
  });
}

// Reports.

function reportItem(report: Report, extra: (HTMLElement | null)[] = []): HTMLElement {
  const reason = REPORT_REASONS[report.reason as keyof typeof REPORT_REASONS] ?? report.reason;
  const outcome = reportOutcome(report);
  const name = report.world?.name;
  return h(
    'div',
    { class: 'report-item' },
    h(
      'p',
      { class: 'badges' },
      h('b', {}, name ? `${name} (@${report.slug})` : `@${report.slug}`),
      h('span', { class: `badge ${outcome.tone}` }, outcome.text),
    ),
    h('p', {}, reason),
    report.details ? h('p', { class: 'details muted' }, report.details) : null,
    h(
      'p',
      { class: 'small muted' },
      `Sent ${when(report.createdAt)}`,
      report.resolvedAt ? `; closed ${when(report.resolvedAt)}` : '',
    ),
    report.note ? h('p', { class: 'small' }, 'Note: ', report.note) : null,
    ...extra,
  );
}

async function loadReports() {
  const list = byId('reports-list');
  sections.reports.hidden = false;
  try {
    const { reports } = await hub.myReports();
    fill(
      list,
      ...(reports.length
        ? reports.map((r) => reportItem(r))
        : [h('p', { class: 'muted' }, 'You haven’t reported a world.')]),
    );
  } catch (error) {
    if (signedOutError(error)) return signedOut();
    fill(list, errorNotice(error));
  }
}

async function loadReview() {
  const list = byId('review-list');
  const all = byId<HTMLInputElement>('review-all').checked;
  sections.review.hidden = false;
  try {
    const { reports } = await hub.adminReports(all ? 'all' : 'open');
    fill(
      list,
      ...(reports.length
        ? reports.map(reviewItem)
        : [h('p', { class: 'muted' }, all ? 'No reports.' : 'No open reports.')]),
    );
  } catch (error) {
    if (signedOutError(error)) return signedOut();
    fill(list, errorNotice(error));
  }
}

function reviewItem(report: Report): HTMLElement {
  const from = report.reporter;
  const extra: HTMLElement[] = [];
  if (from)
    extra.push(h('p', { class: 'small muted' }, `From ${from.name} (Discord ${from.discordId})`));
  if (report.state === 'open') {
    const note = h('input', {
      type: 'text',
      maxlength: '500',
      required: true,
      placeholder: 'A note for the record',
      'aria-label': 'A note for the record',
    });
    const dismiss = button('Dismiss');
    const revoke = button('Revoke the world', 'danger');
    const said = h('div', { class: 'notices' });
    const resolve = (action: 'dismiss' | 'revoke', b: HTMLButtonElement) => async () => {
      fill(said);
      if (!note.value.trim()) {
        fill(said, notice('error', 'Write a note first: it goes in the record.'));
        return;
      }
      if (
        action === 'revoke' &&
        !confirm(
          `Revoke @${report.slug}? Its network goes off, its key stops, its claims close, and it’s locked until the hub’s command line unlocks it.`,
        )
      )
        return;
      try {
        await busy(b, () => hub.resolveReport(report.id, action, note.value.trim()));
        fill(
          notices,
          notice('ok', action === 'revoke' ? `@${report.slug} is revoked.` : 'Report dismissed.'),
        );
        await loadReview();
      } catch (error) {
        if (signedOutError(error)) return signedOut();
        fill(said, errorNotice(error));
      }
    };
    dismiss.addEventListener('click', resolve('dismiss', dismiss));
    revoke.addEventListener('click', resolve('revoke', revoke));
    extra.push(h('div', { class: 'inline' }, note, dismiss, revoke), said);
  }
  return reportItem(report, extra);
}

// The hub's settings, for its admins.

// The last thing said about the hub's Discord settings, and its Discord log, read when first
// opened after each change.
let hubSaid: Said | undefined;
const hubLog: KeptLog = { events: null, open: false };

function loadHubSettings() {
  sections.hubSettings.hidden = false;
  void loadHubRules();
  void loadHubDiscord();
}

async function loadHubDiscord() {
  const box = byId('hub-discord');
  if (!discordFeatures(config).mirrors) {
    fill(
      box,
      h(
        'p',
        { class: 'muted' },
        'This hub has no Discord bot, so it mirrors no room into Discord and carries no tell there.',
      ),
    );
    return;
  }
  fill(box, h('p', { class: 'muted' }, 'Loading…'));
  try {
    showHubDiscord(await hub.discordAdmin());
  } catch (error) {
    if (signedOutError(error)) return signedOut();
    fill(box, notice('error', mirrorRefusal(error)));
  }
}

/** The hub's Discord settings as they stand, each change drawing them again. */
function showHubDiscord(state: DiscordAdmin) {
  const box = byId('hub-discord');
  const said = h('div', { class: 'notices' }, saidNotice(hubSaid));
  hubSaid = undefined;
  // Its folds stay as they were across each redraw.
  const folds = () => box.querySelectorAll<HTMLDetailsElement>('details[data-fold]');
  const open = new Set([...folds()].filter((d) => d.open).map((d) => d.dataset.fold));
  fill(box, said, build(hubDiscordView(state)), hubLogPart());
  for (const d of folds()) d.open = open.has(d.dataset.fold);
  const settle = (outcome: MirrorOutcome<DiscordAdmin>, field?: HTMLInputElement) =>
    settled(outcome, said, field, () => {
      hubSaid = outcome.said;
      // The log has something new to read.
      hubLog.events = null;
      showHubDiscord(outcome.state);
    });
  wireForms(box, 'mirror', async (form, submit) => {
    const room = form.dataset.room ?? '';
    const field = targetOf(form);
    const typed = field.value;
    settle(await busy(submit, () => mirrorNetworkRoom(hub, room, typed, state)), field);
  });
  wireForms(box, 'mirror-channel', async (form, submit) => {
    const room = form.querySelector<HTMLInputElement>('input[name="room"]')!.value;
    const field = targetOf(form);
    const typed = field.value;
    settle(await busy(submit, () => mirrorNetworkRoom(hub, room, typed, state)), field);
  });
  wireButtons(box, 'stop', async (b) => {
    const room = b.dataset.room ?? '';
    if (!confirm(`Stop the network’s mirror of ${roomName(room)}?`)) return;
    settle(await busy(b, () => stopNetworkMirror(hub, room, state)));
  });
  wireButtons(box, 'take-away', async (b) => {
    const slug = b.dataset.world ?? '';
    const room = b.dataset.room ?? '';
    if (
      !confirm(
        `Take away @${slug}’s mirror of ${roomName(room)}? Its lines stop reaching that channel at once.`,
      )
    )
      return;
    const outcome = await busy(b, () => takeWorldMirror(hub, slug, room, state));
    settle(outcome);
    // One of the admin's own worlds is read again.
    if (outcome.said.kind !== 'error' && worldMirrors.delete(slug)) redraw(slug);
  });
  wireForms(box, 'avatar', async (form, submit) => {
    const typed = form.querySelector<HTMLInputElement>('input[name="url"]')!.value;
    settle(await busy(submit, () => setAvatar(hub, typed, state)));
  });
  wireButtons(box, 'avatar-clear', async (b) => {
    settle(await busy(b, () => setAvatar(hub, '', state)));
  });
}

/** One of the hub's own logs, as the page keeps it: what was read (none until it is opened, and
 * again after each change), and whether it is open. */
interface KeptLog {
  events: AuditEvent[] | null;
  open: boolean;
}

/** A log of the hub's own, read with `read` when its fold is opened, each entry in `text`'s words
 * and each refusal in `refusal`'s. */
function logPart(
  title: string,
  kept: KeptLog,
  read: () => Promise<AuditEvent[]>,
  text: (event: AuditEvent) => string,
  refusal: (error: unknown) => string,
): HTMLElement {
  const body = h('div', {});
  const details = h('details', { class: 'fold', open: kept.open }, h('summary', {}, title), body);
  const row = (event: AuditEvent) =>
    h('tr', {}, h('td', {}, when(event.at)), h('td', {}, text(event)));
  const show = (events: AuditEvent[]) =>
    fill(
      body,
      events.length === 0
        ? h('p', { class: 'muted' }, 'Nothing yet.')
        : h('table', { class: 'audit' }, h('tbody', {}, ...events.map(row))),
    );
  // A details element drawn open also fires its toggle event, so the log is read once.
  let started = false;
  const opened = async () => {
    kept.open = true;
    if (started) return;
    started = true;
    if (kept.events) return show(kept.events);
    fill(body, h('p', { class: 'muted' }, 'Loading…'));
    try {
      kept.events = await read();
      show(kept.events);
    } catch (error) {
      if (signedOutError(error)) return signedOut();
      fill(body, notice('error', refusal(error)));
    }
  };
  details.addEventListener('toggle', () => {
    if (details.open) void opened();
    else kept.open = false;
  });
  if (kept.open) void opened();
  return details;
}

/** The hub's own Discord log, read when opened. */
function hubLogPart(): HTMLElement {
  return logPart(
    'Discord history',
    hubLog,
    async () => (await hub.discordLog()).events,
    (event) => auditText(event, operator?.id ?? null),
    (error) => mirrorRefusal(error),
  );
}

// The last thing said about the hub's own settings, and their log, read when first opened after
// each change.
let rulesSaid: Said | undefined;
const rulesLog: KeptLog = { events: null, open: false };

async function loadHubRules() {
  const box = byId('hub-rules');
  fill(box, h('p', { class: 'muted' }, 'Loading…'));
  try {
    showHubRules(await hub.hubSettings());
  } catch (error) {
    if (signedOutError(error)) return signedOut();
    fill(box, notice('error', settingsRefusal(error)));
  }
}

/** The hub's own settings as they stand, each change drawing them again. */
function showHubRules(state: HubSettings) {
  const box = byId('hub-rules');
  const said = h('div', { class: 'notices' }, saidNotice(rulesSaid));
  rulesSaid = undefined;
  fill(
    box,
    said,
    build(settingsView(state)),
    logPart(
      'Settings history',
      rulesLog,
      async () => (await hub.hubSettingsLog()).events,
      (event) => settingEventText(event, operator?.id ?? null),
      (error) => settingsRefusal(error),
    ),
  );
  wireForms(box, 'setting', async (form, submit) => {
    const name = form.dataset.name as HubSettingName;
    const typed = form.querySelector<HTMLInputElement>('input[name="value"]')!.value;
    const outcome = await busy(submit, () => saveSetting(hub, name, typed, state));
    settled(outcome, said, undefined, () => {
      rulesSaid = outcome.said;
      // The log has something new to read.
      rulesLog.events = null;
      showHubRules(outcome.state);
    });
  });
}

// The page.

async function main() {
  const signin = takeQuery('signin');
  const claim = new URLSearchParams(location.search).get('claim');
  try {
    config = await hub.config();
  } catch (error) {
    fill(notices, errorNotice(error));
    return;
  }
  if (!config.authEnabled) {
    fill(notices, notice('note', 'Operator sign-in isn’t open on the hub yet. Check back soon.'));
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
    operator = await hub.operator();
  } catch (error) {
    append(notices, errorNotice(error));
    return;
  }
  if (!operator) return showSignIn(config, claim);

  byId('who').textContent = operator.name;
  sections.home.hidden = false;
  const signout = byId<HTMLButtonElement>('signout');
  signout.addEventListener('click', async () => {
    try {
      await busy(signout, () => hub.signOut());
    } catch (error) {
      if (!signedOutError(error)) {
        fill(notices, errorNotice(error));
        return;
      }
    }
    location.replace(location.pathname);
  });
  byId('open-register').addEventListener('click', openRegister);
  // Signed in, the steps' Sign in points at your worlds, and Register opens the form.
  byId<HTMLAnchorElement>('step-signin').href = '#home';
  byId<HTMLAnchorElement>('step-register').href = '#register';
  byId('step-register').addEventListener('click', (event) => {
    event.preventDefault();
    openRegister();
  });
  byId('open-claim').addEventListener('click', () => openClaim());
  wireClaim();
  byId('review-all').addEventListener('change', () => void loadReview());

  fill(worldsBox, h('p', { class: 'muted' }, 'Loading your worlds…'));
  try {
    worlds = (await hub.myWorlds()).worlds;
    renderWorlds();
  } catch (error) {
    if (signedOutError(error)) return signedOut();
    fill(worldsBox, errorNotice(error));
  }
  void loadReports();
  if (operator.admin) {
    void loadReview();
    loadHubSettings();
  }
  if (claim && isRegistrySlug(claim)) {
    takeQuery('claim');
    openClaim(claim);
  }
}

main().catch((error) => fill(notices, notice('error', explain(error))));
