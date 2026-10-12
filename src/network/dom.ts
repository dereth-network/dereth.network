// Building the pages' parts. Everything the hub sends is set as text, never as markup, and
// nothing is styled inline: the site's policy allows neither.
import { createHub } from './hub.ts';
import { explain } from './format.ts';
import type { View } from './view.ts';

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | boolean | undefined | null>;

/** An element with attributes (a `true` boolean sets it, `false` or none leaves it out) and
 * children, where a string child is text. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === 'style' || name.startsWith('on')) throw new Error(`No inline ${name}`);
    el.setAttribute(name, value === true ? '' : value);
  }
  append(el, ...children);
  return el;
}

export function append(el: Element, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

/** Replaces an element's children. */
export function fill(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, ...children);
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no #${id}`);
  return el as T;
}

/** The hub this page was built to call, from its `dereth-hub` meta tag. */
export function pageHub() {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="dereth-hub"]');
  return createHub(meta?.content || 'https://hub.dereth.network');
}

/** A notice: an error, a success or a plain note, read out by screen readers as it appears. */
export function notice(kind: 'error' | 'ok' | 'note', ...children: Child[]): HTMLElement {
  return h(
    'p',
    { class: `notice ${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    ...children,
  );
}

/** A refusal from the hub as a notice, with its code for anyone asking for help. */
export function errorNotice(error: unknown): HTMLElement {
  const code = (error as { code?: unknown })?.code;
  return notice(
    'error',
    explain(error),
    typeof code === 'string' ? h('span', { class: 'code' }, code) : null,
  );
}

/** Runs `work` with `button` disabled, so nothing is sent twice. */
export async function busy<T>(button: HTMLButtonElement, work: () => Promise<T>): Promise<T> {
  button.disabled = true;
  try {
    return await work();
  } finally {
    button.disabled = false;
  }
}

/** A field holding something to copy (a key, a token, a command), with its copy button. */
export function copyField(value: string, label: string): HTMLElement {
  const input = h('input', {
    class: 'copy-value',
    type: 'text',
    readonly: true,
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-label': label,
  });
  input.value = value;
  const button = h('button', { class: 'btn small', type: 'button' }, 'Copy');
  const said = h('span', { class: 'copied', role: 'status' });
  input.addEventListener('focus', () => input.select());
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(value);
      said.textContent = 'Copied';
    } catch {
      // No clipboard (an older browser, or permission refused): leave it selected to copy by hand.
      input.focus();
      input.select();
      said.textContent = 'Press Ctrl+C to copy';
    }
  });
  return h('div', { class: 'copy' }, input, button, said);
}

/** The elements a view describes (view.ts). */
export function build(view: View): Node | null {
  if (view === null || view === undefined || view === false) return null;
  if (typeof view === 'string') return document.createTextNode(view);
  if ('copy' in view) return copyField(view.copy, view.label);
  const el = h(view.tag as keyof HTMLElementTagNameMap, view.attrs);
  for (const child of view.children) {
    const node = build(child);
    if (node) el.append(node);
  }
  return el;
}

/** The site's own path and query, to come back to after signing in. */
export function herePath(): string {
  return location.pathname + location.search;
}

/** Takes `name` out of the address bar's query without reloading, returning its value. */
export function takeQuery(name: string): string | null {
  const url = new URL(location.href);
  const value = url.searchParams.get(name);
  if (value !== null) {
    url.searchParams.delete(name);
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  return value;
}
