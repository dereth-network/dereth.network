// The form that registers a world, or changes its registration. Its fields follow the hub's
// registration body; the hub checks them again and says what it refuses.
import { busy, errorNotice, fill, h } from './dom.ts';
import { RULESETS, fieldsOf, slugAdvice, toRegistration } from './format.ts';
import type { RegistrationFields } from './format.ts';
import type { Registration, World } from './hub.ts';

let forms = 0;

export interface RegistrationFormOptions {
  /** The world as it stands, to change it; null to register a new one. */
  world: World | null;
  submit: string;
  onSubmit: (registration: Registration) => Promise<void>;
  onCancel?: () => void;
}

export function registrationForm(options: RegistrationFormOptions): HTMLFormElement {
  const n = ++forms;
  const start = fieldsOf(options.world);
  const editing = options.world !== null;
  const text = (name: string, value: string, attrs: Record<string, string | boolean> = {}) =>
    h('input', { type: 'text', name, value, autocomplete: 'off', id: `reg${n}-${name}`, ...attrs });
  const field = (label: string, control: HTMLElement, hint?: HTMLElement | string, wide = false) =>
    h(
      'label',
      { class: wide ? 'field wide' : 'field' },
      h('span', {}, label),
      control,
      typeof hint === 'string' ? h('span', { class: 'hint' }, hint) : (hint ?? null),
    );

  const slug = text('slug', start.slug, {
    required: true,
    minlength: '2',
    maxlength: '40',
    pattern: '[a-z0-9]+(-[a-z0-9]+)*',
    spellcheck: 'false',
    placeholder: 'leafcull',
    disabled: editing,
  });
  const slugHint = h('span', { class: 'hint' });
  const showSlugAdvice = () => {
    const advice = slugAdvice(slug.value);
    slugHint.className = advice ? `hint ${advice.ok ? 'good' : 'bad'}` : 'hint';
    slugHint.textContent = advice
      ? advice.text
      : 'Up to 12 lower-case letters and numbers to join the network: it’s the world in Name@world.';
  };
  showSlugAdvice();
  slug.addEventListener('input', showSlugAdvice);

  const name = text('name', start.name, { required: true, minlength: '2', maxlength: '80' });
  const ruleset = h(
    'select',
    { name: 'ruleset' },
    ...RULESETS.map((r) => h('option', { value: r, selected: r === start.ruleset }, r)),
  );
  const region = text('region', start.region, { maxlength: '60', placeholder: 'US East' });
  // The community list's own maturities, offered; any other may be typed.
  const maturities = h(
    'datalist',
    { id: `reg${n}-maturities` },
    ...['Stable', 'Development', 'Experimental'].map((m) => h('option', { value: m })),
  );
  const maturity = text('maturity', start.maturity, {
    maxlength: '60',
    placeholder: 'Unspecified',
    list: `reg${n}-maturities`,
  });
  const website = h('input', {
    type: 'url',
    name: 'website',
    value: start.website,
    maxlength: '500',
    placeholder: 'https://',
  });
  const discord = h('input', {
    type: 'url',
    name: 'discord',
    value: start.discord,
    maxlength: '500',
    placeholder: 'https://discord.gg/',
  });
  const description = h('textarea', { name: 'description', maxlength: '2000', rows: '3' });
  description.value = start.description;

  // Where players connect: a fixed address, or the one the world's server reports from.
  const radio = (value: 'manual' | 'observed', label: string) => {
    const input = h('input', {
      type: 'radio',
      name: `reg${n}-mode`,
      value,
      checked: start.mode === value,
    });
    return { input, label: h('label', { class: 'choice' }, input, h('span', {}, label)) };
  };
  const manual = radio('manual', 'A fixed address');
  const observed = radio('observed', 'The address its server reports from');
  const address = text('address', start.address, {
    maxlength: '253',
    spellcheck: 'false',
    placeholder: 'play.leafcull.example.org',
  });
  const port = h('input', {
    type: 'number',
    name: 'port',
    value: start.port,
    min: '1',
    max: '65535',
    required: true,
  });
  const family = h(
    'select',
    { name: 'addressFamily' },
    h('option', { value: 'ipv4', selected: start.addressFamily !== 'ipv6' }, 'IPv4'),
    h('option', { value: 'ipv6', selected: start.addressFamily === 'ipv6' }, 'IPv6'),
  );
  const addressField = field(
    'Address',
    address,
    'The host name or public IP address players connect to.',
  );
  const familyField = field('Reported over', family);
  const showMode = () => {
    const fixed = manual.input.checked;
    addressField.hidden = !fixed;
    address.required = fixed;
    familyField.hidden = fixed;
  };
  showMode();
  manual.input.addEventListener('change', showMode);
  observed.input.addEventListener('change', showMode);

  const emulators = h(
    'datalist',
    { id: `reg${n}-emulators` },
    ...['ACE', 'Empyrean', 'GDLE'].map((e) => h('option', { value: e })),
  );
  const emulator = text('family', start.family, {
    required: true,
    maxlength: '60',
    list: `reg${n}-emulators`,
  });
  const version = text('version', start.version, { maxlength: '60', placeholder: '1.77' });
  const demo = h('input', { type: 'checkbox', name: 'isDemo', checked: start.isDemo });

  const messages = h('div', { class: 'notices' });
  const submit = h('button', { class: 'btn lit', type: 'submit' }, options.submit);
  const cancel = options.onCancel ? h('button', { class: 'btn', type: 'button' }, 'Cancel') : null;
  cancel?.addEventListener('click', () => options.onCancel?.());

  const form = h(
    'form',
    { class: 'form' },
    h(
      'div',
      { class: 'form-grid' },
      field('Slug', slug, slugHint),
      field('Name', name, 'As players see it, up to 80 characters.'),
      field('Rules', ruleset),
      field('Region', region),
      field('Website', website),
      field('Discord invite', discord),
      field('Maturity', maturity),
      maturities,
      field('Description', description, undefined, true),
    ),
    h(
      'fieldset',
      {},
      h('legend', {}, 'Where players connect'),
      manual.label,
      observed.label,
      h('div', { class: 'form-grid' }, addressField, familyField, field('Port', port)),
      h(
        'p',
        { class: 'hint' },
        'A world whose address is the one it reports from can only be proven in game.',
      ),
    ),
    h(
      'div',
      { class: 'form-grid' },
      field('Emulator', emulator),
      field('Its version', version),
      emulators,
    ),
    h('label', { class: 'choice' }, demo, h('span', {}, 'A demo or test world')),
    editing
      ? h(
          'p',
          { class: 'hint' },
          'Changing the address means proving the world again from the new one.',
        )
      : null,
    messages,
    h('div', { class: 'buttons' }, submit, cancel),
  );

  const read = (): RegistrationFields => ({
    slug: slug.value,
    name: name.value,
    description: description.value,
    ruleset: ruleset.value,
    region: region.value,
    maturity: maturity.value,
    website: website.value,
    discord: discord.value,
    isDemo: demo.checked,
    mode: observed.input.checked ? 'observed' : 'manual',
    address: address.value,
    port: port.value,
    addressFamily: family.value,
    family: emulator.value,
    version: version.value,
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    fill(messages);
    try {
      await busy(submit, () => options.onSubmit(toRegistration(read())));
    } catch (error) {
      fill(messages, errorNotice(error));
    }
  });
  return form;
}
