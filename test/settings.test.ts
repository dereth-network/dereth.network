// The hub's settings its admins change, against a stubbed hub: each setting with its value, its
// default and Save; a value the hub would refuse refused before asking; the change sent and the
// settings after shown; each refusal in plain words, an older hub's too; and their history.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HubError, createHub } from '../src/network/hub.ts';
import type { HubSettings } from '../src/network/hub.ts';
import {
  amount,
  saveSetting,
  settingEventText,
  settingProblem,
  settingsRefusal,
  settingsView,
} from '../src/network/settings.ts';
import { controlsOf, textOf } from '../src/network/view.ts';
import type { View, ViewElement } from '../src/network/view.ts';

const HUB = 'https://hub.example.org';

/** A hub whose every answer is `answers` in turn, and what it was asked. */
function hubAnswering(...answers: Response[]) {
  const asked: { url: string; method: string; body: unknown; credentials?: string }[] = [];
  const hub = createHub(HUB, async (url: string, init: RequestInit = {}) => {
    asked.push({
      url,
      method: init.method ?? 'GET',
      body: init.body === undefined ? undefined : JSON.parse(init.body as string),
      credentials: init.credentials,
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

const refusal = (status: number, code: string, message: string) =>
  json(status, { error: { code, message } });

const settings = (approvals = 500, age = 30, pending = 14): HubSettings => ({
  approvalsPerDay: { value: approvals, default: 500, min: 0, max: 100_000 },
  minAccountAgeDays: { value: age, default: 30, min: 0, max: 3_650 },
  pendingDays: { value: pending, default: 14, min: 1, max: 365 },
});

/** A view's text with its parts' spacing evened out. */
const plain = (view: View) => textOf(view).replace(/\s+/g, ' ');

/** Every element of `tag` a view holds, in order. */
function elementsOf(view: View, tag: string): ViewElement[] {
  if (typeof view !== 'object' || view === null || !('tag' in view)) return [];
  return [...(view.tag === tag ? [view] : []), ...view.children.flatMap((c) => elementsOf(c, tag))];
}

test('each setting shows its value and a Save of its own, within its bounds', () => {
  const view = settingsView(settings(400));
  const forms = controlsOf(view);
  assert.deepEqual(
    forms.map((f) => [f.act, f.attrs['data-name']]),
    [
      ['setting', 'approvalsPerDay'],
      ['setting', 'minAccountAgeDays'],
      ['setting', 'pendingDays'],
    ],
  );
  assert.deepEqual(
    elementsOf(view, 'input').map((i) => [i.attrs.value, i.attrs.min, i.attrs.max, i.attrs.type]),
    [
      ['400', '0', '100000', 'number'],
      ['30', '0', '3650', 'number'],
      ['14', '1', '365', 'number'],
    ],
  );
  assert.deepEqual(
    elementsOf(view, 'button').map((b) => textOf(b)),
    ['Save', 'Save', 'Save'],
  );
  const text = plain(view);
  assert.match(text, /^Daily limit on worlds joining the network: worlds Save/);
  assert.match(text, /Minimum Discord account age for world operators: days Save/);
  assert.match(
    text,
    /World verification deadline: days Save If a world is not verified in this many days it will be removed and its slug freed for use again\.$/,
  );
  assert.doesNotMatch(text, /default/i, 'no default is said');
});

test('a value the hub would refuse is refused before asking, in a plain sentence', async () => {
  const state = settings();
  for (const typed of ['', 'x', '-1', '1.5', '366', '0'])
    assert.equal(
      settingProblem('pendingDays', typed, state.pendingDays),
      'World verification deadline must be a whole number from 1 to 365.',
      typed,
    );
  assert.equal(
    settingProblem('approvalsPerDay', '100001', state.approvalsPerDay),
    'Daily limit on worlds joining the network must be a whole number from 0 to 100,000.',
  );
  for (const typed of ['0', ' 100000 '])
    assert.equal(settingProblem('approvalsPerDay', typed, state.approvalsPerDay), null, typed);
  const { hub, asked } = hubAnswering();
  const out = await saveSetting(hub, 'pendingDays', '0', state);
  assert.equal(out.said.kind, 'error');
  assert.equal(out.state, state);
  assert.deepEqual(asked, [], 'the hub is not asked');
});

test('Save sends the one setting by its name, and the settings after are shown', async () => {
  const { hub, asked } = hubAnswering(json(200, settings(500, 30, 21)));
  const out = await saveSetting(hub, 'pendingDays', ' 21 ', settings());
  assert.deepEqual(asked, [
    {
      url: `${HUB}/v1/admin/settings`,
      method: 'PUT',
      body: { pendingDays: 21 },
      credentials: 'include',
    },
  ]);
  assert.equal(out.state.pendingDays.value, 21);
  assert.deepEqual(out.said, {
    kind: 'ok',
    text: 'World verification deadline: 21 days now. It holds at once.',
  });
  assert.equal(amount('approvalsPerDay', 1), '1 world');
  assert.equal(amount('approvalsPerDay', 1500), '1,500 worlds');
});

test('each refusal of the hub reads as a plain sentence', async () => {
  const state = settings();
  const refused = async (answer: Response) =>
    (await saveSetting(hubAnswering(answer).hub, 'approvalsPerDay', '40', state)).said;
  assert.deepEqual(
    await refused(
      refusal(400, 'INVALID_REQUEST', 'approvalsPerDay: a whole number from 0 to 100000'),
    ),
    {
      kind: 'error',
      text: 'Daily limit on worlds joining the network must be a whole number from 0 to 100,000.',
    },
  );
  assert.equal(
    (await refused(refusal(403, 'FORBIDDEN', 'Admins only'))).text,
    'Only the hub’s admins can change its settings.',
  );
  assert.equal(
    (await refused(refusal(404, 'NOT_FOUND', 'Route not found'))).text,
    'This hub is older than these settings, so they can’t be changed here. Its operator sets them when it starts.',
  );
  const signedOut = await saveSetting(
    hubAnswering(refusal(401, 'UNAUTHORIZED', 'Sign in first')).hub,
    'approvalsPerDay',
    '40',
    state,
  );
  assert.ok(signedOut.error instanceof HubError && signedOut.error.status === 401);
  assert.equal(signedOut.state, state, 'nothing changed');
  assert.equal(
    settingsRefusal(new HubError(404, 'NOT_FOUND', 'Route not found')),
    'This hub is older than these settings, so they can’t be changed here. Its operator sets them when it starts.',
  );
});

test('the settings history says what each change set, from what, and who made it', () => {
  const event = (actor: string, details: Record<string, unknown>) => ({
    kind: 'setting',
    at: '2026-10-13T09:00:00.000Z',
    actor,
    details,
  });
  assert.equal(
    settingEventText(event('op_me', { name: 'approvalsPerDay', value: 300, was: 500 }), 'op_me'),
    'Daily limit on worlds joining the network set to 300 worlds (it was 500 worlds), by you',
  );
  assert.equal(
    settingEventText(event('op_other', { name: 'pendingDays', value: 1, was: 14 }), 'op_me'),
    'World verification deadline set to 1 day (it was 14 days), by another admin',
  );
  assert.equal(
    settingEventText(
      event('hub-operator', {
        name: 'minAccountAgeDays',
        value: 45,
        was: 30,
        flag: '--min-account-age-days',
      }),
      'op_me',
    ),
    'Minimum Discord account age for world operators set to 45 days (it was 30 days), by the hub’s operator, from --min-account-age-days when the hub started',
  );
});
