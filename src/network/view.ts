// A page's parts as plain data: what a page shows can be checked without a browser, and dom.ts
// builds the elements from it. Text is always text, never markup.

export type Attrs = Record<string, string | boolean | undefined | null>;

/** An element: its tag, attributes and children. */
export interface ViewElement {
  tag: string;
  attrs: Attrs;
  children: View[];
}

/** A field holding something to copy, with its copy button. */
export interface ViewCopy {
  copy: string;
  label: string;
}

export type View = ViewElement | ViewCopy | string | null | undefined | false;

/** An element with attributes and children, where a string child is text. */
export function v(tag: string, attrs: Attrs = {}, ...children: View[]): ViewElement {
  return { tag, attrs, children };
}

/** Something to copy, shown in a field with a copy button. */
export function copyable(copy: string, label: string): ViewCopy {
  return { copy, label };
}

function isElement(view: View): view is ViewElement {
  return typeof view === 'object' && view !== null && 'tag' in view;
}

/** The text a view shows, its parts joined by spaces, for reading in tests. */
export function textOf(view: View): string {
  if (!view) return '';
  if (typeof view === 'string') return view;
  if (!isElement(view)) return view.copy;
  return view.children
    .map(textOf)
    .filter((t) => t !== '')
    .join(' ');
}

/** Every link a view holds, in order: where it goes and what it says. */
export function linksOf(view: View): { href: string; text: string }[] {
  if (!isElement(view)) return [];
  const own =
    view.tag === 'a' && typeof view.attrs.href === 'string'
      ? [{ href: view.attrs.href, text: textOf(view) }]
      : [];
  return [...own, ...view.children.flatMap(linksOf)];
}

/** Every control a view holds that a page wires up (marked `data-act`), in order: what it does,
 * what it says, and its attributes. */
export function controlsOf(view: View): { act: string; text: string; attrs: Attrs }[] {
  if (!isElement(view)) return [];
  const own =
    typeof view.attrs['data-act'] === 'string'
      ? [{ act: view.attrs['data-act'], text: textOf(view), attrs: view.attrs }]
      : [];
  return [...own, ...view.children.flatMap(controlsOf)];
}
