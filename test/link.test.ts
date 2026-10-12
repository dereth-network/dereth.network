// The link page's steps, against a stubbed hub: the code the link carries after its `#`, kept in
// the tab while the player signs in and taken back once, what the page does next in each case
// (never signing in again by itself after a sign-in came back without one), and how linking ends.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HubError, createHub } from '../src/network/hub.ts';
import {
  KEPT,
  PAGE,
  TEXT,
  codeFromHash,
  keepCode,
  link,
  linkedText,
  nextStep,
  takeKeptCode,
} from '../src/network/link.ts';

const HUB = 'https://hub.example.org';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

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

/** A tab's storage, as a map. */
function store() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  };
}

const ANN = {
  address: 'Ann@coldeve',
  world: { slug: 'coldeve', name: 'Coldeve' },
  linkedAt: '2026-10-13T09:14:03.000Z',
};

test('the code a link carries is read after its #, however it was written', () => {
  for (const hash of ['#K7QD-2MXP', '#k7qd2mxp', '#code=K7QD-2MXP', '#K7QD%202MXP', 'K7QD-2MXP'])
    assert.equal(codeFromHash(hash), 'K7QD-2MXP', hash);
  for (const hash of ['', '#', '#K7QD', '#not-a-code!', '#%E0%A4%A'])
    assert.equal(codeFromHash(hash), null, hash);
});

test('a code waits in the tab while the player signs in, and is taken back once', () => {
  const tab = store();
  keepCode(tab, 'K7QD-2MXP');
  assert.equal(tab.items.get(KEPT), 'K7QD-2MXP');
  assert.equal(takeKeptCode(tab), 'K7QD-2MXP');
  assert.equal(takeKeptCode(tab), null, 'taken once');
  tab.items.set(KEPT, 'something else');
  assert.equal(takeKeptCode(tab), null, 'only a code');
  assert.equal(tab.items.size, 0);
});

test('a tab that keeps nothing loses the code quietly', () => {
  const refusing = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
    removeItem: () => {
      throw new Error('denied');
    },
  };
  assert.doesNotThrow(() => keepCode(refusing, 'K7QD-2MXP'));
  assert.equal(takeKeptCode(refusing), null);
  assert.equal(takeKeptCode(null), null);
  assert.doesNotThrow(() => keepCode(undefined, 'K7QD-2MXP'));
});

test('a link opened signed in links at once, and signed out signs in first', () => {
  assert.deepEqual(nextStep('K7QD-2MXP', true, null), { do: 'link', code: 'K7QD-2MXP' });
  assert.deepEqual(nextStep('K7QD-2MXP', false, null), { do: 'sign-in', code: 'K7QD-2MXP' });
  assert.deepEqual(nextStep(null, true, null), { do: 'ask' });
  assert.deepEqual(nextStep(null, false, null), { do: 'ask' });
  assert.equal(PAGE, '/link/', 'the sign-in comes back to this page');
});

test('a sign-in that came back without one is offered again, never tried again by itself', () => {
  assert.deepEqual(nextStep('K7QD-2MXP', false, 'failed'), {
    do: 'offer-sign-in',
    code: 'K7QD-2MXP',
    problem: TEXT.signInFailed,
  });
  assert.deepEqual(nextStep(null, false, 'busy'), {
    do: 'offer-sign-in',
    code: null,
    problem: TEXT.signInBusy,
  });
  assert.deepEqual(
    nextStep('K7QD-2MXP', true, 'failed'),
    { do: 'link', code: 'K7QD-2MXP' },
    'signed in after all',
  );
});

test('linking says which character, on which world, is linked', async () => {
  const { hub, asked } = hubAnswering(json(200, { character: ANN, person: {} }));
  const linked = await link(hub, 'K7QD-2MXP');
  assert.deepEqual(asked, [
    { url: `${HUB}/v1/person/link`, method: 'POST', body: { code: 'K7QD-2MXP' } },
  ]);
  assert.deepEqual(linked, {
    ok: true,
    character: ANN,
    text: 'Ann@coldeve, on Coldeve, is linked to your Discord account.',
  });
  assert.equal(
    linkedText({ ...ANN, world: { slug: 'coldeve', name: null } }),
    'Ann@coldeve, on coldeve, is linked to your Discord account.',
  );
});

test('a used or lapsed link says so and how to get a new one', async () => {
  const { hub } = hubAnswering(
    json(422, {
      error: {
        code: 'LINK_FAILED',
        reason: 'no_such_code',
        message: 'That code is not one the hub gave, or it has been used or has lapsed',
      },
    }),
    json(409, {
      error: { code: 'CONFLICT', reason: 'too_many_characters', message: 'x' },
    }),
  );
  assert.deepEqual(await link(hub, 'K7QD-2MXP'), {
    ok: false,
    signIn: false,
    text: 'This link was used already or has expired. Type @dn link in game for a new one.',
  });
  const full = await link(hub, 'K7QD-2MXP');
  assert.ok(!full.ok && !full.signIn && /Unlink one first/.test(full.text), JSON.stringify(full));
});

test('a session that lapsed while linking signs in again, the code kept', async () => {
  const { hub } = hubAnswering(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }));
  assert.deepEqual(await link(hub, 'K7QD-2MXP'), { ok: false, signIn: true });
  assert.ok(new HubError(401, 'UNAUTHORIZED', 'x') instanceof Error);
});

test('the page says, in plain words, how to get a link', () => {
  assert.equal(TEXT.noCode, 'Type @dn link in game and open the link it gives you.');
  for (const line of Object.values(TEXT)) {
    assert.doesNotMatch(line, /\/dn|alts|listed|visible|reachable/i, line);
    assert.equal(line, line.trim());
    assert.doesNotMatch(line, / {2}/);
  }
});
