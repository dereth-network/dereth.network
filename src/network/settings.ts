// The hub's settings its admins change while it runs, in the operators page's Hub settings: the
// daily limit on worlds joining, the age a Discord account needs and the days a world may wait to
// be verified, each with its value and Save, and the history of their changes. Each of the hub's
// refusals is said in plain words. No DOM here, so all of it can be checked without a browser:
// each control is a form marked `data-act`, which the page wires up.
import type { Said } from './discord.ts';
import { actorText, explain } from './format.ts';
import { HubError } from './hub.ts';
import type { AuditEvent, Hub, HubSetting, HubSettingName, HubSettings } from './hub.ts';
import { v } from './view.ts';
import type { View } from './view.ts';

/** Each setting as the page names and explains it, in the order it shows them. */
export const SETTINGS: readonly {
  name: HubSettingName;
  title: string;
  /** What its value counts, after a number. */
  unit: (n: number) => string;
  about: string;
}[] = [
  {
    name: 'approvalsPerDay',
    title: 'Daily limit on worlds joining the network',
    unit: (n) => (n === 1 ? 'world' : 'worlds'),
    about: '',
  },
  {
    name: 'minAccountAgeDays',
    title: 'Minimum Discord account age for world operators',
    unit: (n) => (n === 1 ? 'day' : 'days'),
    about: '',
  },
  {
    name: 'pendingDays',
    title: 'World verification deadline',
    unit: (n) => (n === 1 ? 'day' : 'days'),
    about:
      'If a world is not verified in this many days it will be removed and its slug freed for use again.',
  },
];

function about(name: HubSettingName) {
  return SETTINGS.find((s) => s.name === name)!;
}

/** A setting's value with what it counts: "500 worlds", "1 day". */
export function amount(name: HubSettingName, n: number): string {
  return `${n.toLocaleString('en-US')} ${about(name).unit(n)}`;
}

/** What a setting may be, as a sentence. */
function rangeText(name: HubSettingName, setting: HubSetting | undefined): string {
  const title = about(name).title;
  if (!setting) return `${title} must be a whole number.`;
  const least = setting.min.toLocaleString('en-US');
  const most = setting.max.toLocaleString('en-US');
  return `${title} must be a whole number from ${least} to ${most}.`;
}

/** What is wrong with `typed` as the value of a setting, or null when the hub would take it. */
export function settingProblem(
  name: HubSettingName,
  typed: string,
  setting: HubSetting,
): string | null {
  const t = typed.trim();
  if (!/^\d+$/.test(t)) return rangeText(name, setting);
  const n = Number(t);
  return n < setting.min || n > setting.max ? rangeText(name, setting) : null;
}

/** What the hub refused when asked for its settings or a change to one, in plain words. */
export function settingsRefusal(
  error: unknown,
  name: HubSettingName | null = null,
  state: HubSettings | null = null,
): string {
  if (!(error instanceof HubError)) return explain(error);
  if (error.status === 404)
    return 'This hub is older than these settings, so they can’t be changed here. Its operator sets them when it starts.';
  if (error.status === 403) return 'Only the hub’s admins can change its settings.';
  if (error.status === 400 && name) return rangeText(name, state?.[name]);
  return explain(error);
}

/** What came of a change to a setting: the settings after (unchanged when it was refused), what
 * to say, and the hub's refusal, if it was one. */
export interface SettingOutcome {
  state: HubSettings;
  said: Said;
  error?: unknown;
}

/** Sets one setting to `typed`, refusing what the hub would. */
export async function saveSetting(
  hub: Pick<Hub, 'setHubSettings'>,
  name: HubSettingName,
  typed: string,
  state: HubSettings,
): Promise<SettingOutcome> {
  const problem = settingProblem(name, typed, state[name]);
  if (problem) return { state, said: { kind: 'error', text: problem } };
  const n = Number(typed.trim());
  try {
    const after = await hub.setHubSettings({ [name]: n });
    const text = `${about(name).title}: ${amount(name, after[name].value)} now. It holds at once.`;
    return { state: after, said: { kind: 'ok', text } };
  } catch (error) {
    return { state, said: { kind: 'error', text: settingsRefusal(error, name, state) }, error };
  }
}

/** One setting: what it is, and its value in a field with Save, with a line about it if it
 * needs one. */
function settingRow(name: HubSettingName, setting: HubSetting): View {
  const s = about(name);
  return v(
    'div',
    { class: 'report-item' },
    v(
      'form',
      {
        class: 'setting-form',
        method: 'post',
        autocomplete: 'off',
        'data-act': 'setting',
        'data-name': name,
      },
      v(
        'label',
        { class: 'setting-label' },
        v('b', {}, `${s.title}:`),
        v('input', {
          type: 'number',
          name: 'value',
          value: String(setting.value),
          min: String(setting.min),
          max: String(setting.max),
          step: '1',
          inputmode: 'numeric',
          required: true,
        }),
        v('span', { class: 'muted' }, s.unit(setting.value)),
      ),
      v('button', { class: 'btn small lit', type: 'submit' }, 'Save'),
    ),
    s.about ? v('p', { class: 'small muted' }, s.about) : null,
  );
}

/** The hub's settings, each with its value and Save. */
export function settingsView(state: HubSettings): View {
  return v(
    'div',
    {},
    ...SETTINGS.filter((s) => state[s.name]).map((s) => settingRow(s.name, state[s.name])),
  );
}

/** One entry of the hub's settings history, in words. Its every change is an admin's, but for a
 * value the hub's operator gave when the hub started. */
export function settingEventText(event: AuditEvent, me: string | null): string {
  const details = event.details ?? {};
  const name = details.name as HubSettingName;
  const known = SETTINGS.some((s) => s.name === name);
  const by =
    event.actor === 'hub-operator' || event.actor === me
      ? actorText(event.actor, me)
      : 'another admin';
  if (!known || typeof details.value !== 'number')
    return `${event.kind.replaceAll('_', ' ')} by ${by}`;
  const now = amount(name, details.value);
  const was = typeof details.was === 'number' ? ` (it was ${amount(name, details.was)})` : '';
  const from =
    typeof details.flag === 'string' ? `, from ${details.flag} when the hub started` : '';
  return `${about(name).title} set to ${now}${was}, by ${by}${from}`;
}
