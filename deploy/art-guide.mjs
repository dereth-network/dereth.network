// The art pack guide, /art/ and /art/sources/: Dereth's own docs/art/README.md and sources.md,
// rendered to plain HTML when the page is built (or served by the dev server), so the page holds no
// script or style of its own. The Markdown is the copy in content/art/ (`npm run sync-art --
// <dereth checkout>` refreshes it); the dev server reads a checkout's docs/art/ itself when
// DERETH_TREE names the checkout, and reloads the page when one of its files changes.
//
// Run as a program: `node deploy/art-guide.mjs sync <dereth checkout>` copies the guide's files from
// the checkout into content/art/.
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked, Renderer } from 'marked';

/** The guide's files, each with the site page it becomes. */
export const ART_PAGES = {
  'README.md': '/art/',
  'sources.md': '/art/sources/',
};

/** What a link to one of the guide's pages reads on the site where its words are only the file's
 * name (`[sources.md](sources.md)`). */
export const PAGE_NAMES = {
  '/art/': 'Making an art pack',
  '/art/sources/': 'Art pack sources',
};

/** Where the guide's files sit in a Dereth checkout. */
export const TREE_DOCS = 'docs/art';

/** Where a link into the rest of the Dereth tree goes. */
export const TREE_URL = 'https://github.com/dereth-network/dereth/blob/main';

/** The committed copy of the guide's files. */
export const CONTENT = fileURLToPath(new URL('../content/art/', import.meta.url));

/** The folder the guide's Markdown is read from: the checkout DERETH_TREE names, while the dev
 * server runs, else the committed copy. */
export function guideFolder({ command, tree }) {
  if (command === 'serve' && tree) return resolve(tree, TREE_DOCS);
  return CONTENT;
}

/** A link in `file` (one of the guide's files) as the site should give it: another of the guide's
 * files is its page, anywhere else in the Dereth tree is the file on GitHub, and an address or an
 * anchor stays as it is. */
export function siteLink(href, file) {
  if (!href || href.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//'))
    return href;
  const base = new URL(`${TREE_DOCS}/${file}`, 'tree:/');
  const url = new URL(href, base);
  if (url.protocol !== 'tree:') return href;
  const path = url.pathname.replace(/^\/+/, '');
  const page = path.startsWith(`${TREE_DOCS}/`) && ART_PAGES[path.slice(TREE_DOCS.length + 1)];
  if (page) return page + url.hash;
  return `${TREE_URL}/${path}${url.search}${url.hash}`;
}

/** A heading's anchor, as GitHub makes it, so a link to `README.md#the-manifest` lands there too. */
export function slug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

const textOf = (html) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/** The page's content from one of the guide's files: its title and opening paragraphs, with a list
 * of its sections, in the opening panel, and each section (each `##`) in a panel of its own. */
export function renderGuide(markdown, file) {
  const ids = new Map();
  const unique = (text) => {
    const id = slug(text) || 'section';
    const seen = ids.get(id) ?? 0;
    ids.set(id, seen + 1);
    return seen ? `${id}-${seen}` : id;
  };
  const sections = [];
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        const id = unique(textOf(inner));
        if (depth === 2) sections.push({ id, inner });
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
      // A wide table scrolls in its own box on a narrow screen, never the page.
      table(token) {
        return `<div class="table">${Renderer.prototype.table.call(this, token)}</div>\n`;
      },
    },
  });
  const tokens = marked.lexer(markdown);
  marked.walkTokens(tokens, (token) => {
    if (token.type !== 'link') return;
    token.href = siteLink(token.href, file);
    const name = PAGE_NAMES[token.href.replace(/#.*/, '')];
    if (name && token.text in ART_PAGES)
      token.tokens = [{ type: 'text', raw: name, text: name, escaped: false }];
  });
  // The tokens before the first `##` open the page; each `##` starts a section.
  const groups = [[]];
  for (const token of tokens) {
    if (token.type === 'heading' && token.depth === 2) groups.push([]);
    groups.at(-1).push(token);
  }
  const render = (group) => marked.parser(Object.assign(group, { links: tokens.links }));
  const [opening, ...rest] = groups;
  const titleAt = opening.findIndex((t) => t.type === 'heading' && t.depth === 1);
  const title = titleAt >= 0 ? render(opening.splice(titleAt, 1)) : '';
  const titleId = title.match(/ id="([^"]*)"/)?.[1];
  const intro = render(opening);
  const bodies = rest.map(render);
  const contents = sections
    .map(({ id, inner }) => `<li><a href="#${id}">${inner}</a></li>`)
    .join('');
  const labelled = (id) => (id ? ` aria-labelledby="${id}"` : '');
  return [
    `<section class="panel lead lit prose"${labelled(titleId)}>`,
    title,
    intro,
    contents ? `<nav class="contents" aria-label="On this page"><ol>${contents}</ol></nav>` : '',
    '</section>',
    ...bodies.map(
      (body, i) => `<section class="panel prose"${labelled(sections[i]?.id)}>\n${body}</section>`,
    ),
  ].join('\n');
}

/** The marker a page holds where one of the guide's files goes: `<!-- art-guide README.md -->`. */
const MARKER = /<!--\s*art-guide\s+([\w.-]+)\s*-->/g;

/** The page with each marker replaced by its file, rendered, from `folder`. */
export async function withGuide(html, folder) {
  const files = [...html.matchAll(MARKER)].map((m) => m[1]);
  const rendered = new Map();
  for (const file of files) {
    if (!(file in ART_PAGES)) throw new Error(`art-guide: ${file} is not one of the guide's files`);
    rendered.set(file, renderGuide(await readFile(join(folder, file), 'utf8'), file));
  }
  return html.replace(MARKER, (_, file) => rendered.get(file));
}

/** The Vite plugin: renders the guide into its pages, and in development reloads them when the
 * Markdown they come from changes. */
export function artGuide({ tree = process.env.DERETH_TREE } = {}) {
  let folder = CONTENT;
  return {
    name: 'dereth-art-guide',
    configResolved(config) {
      folder = guideFolder({ command: config.command, tree });
    },
    async configureServer(server) {
      try {
        if (!(await stat(folder)).isDirectory()) throw new Error();
      } catch {
        throw new Error(`DERETH_TREE: there is no ${TREE_DOCS} folder at ${folder}`);
      }
      if (tree) server.config.logger.info(`  art guide: reading ${folder}`);
      server.watcher.add(folder);
      const reload = (file) => {
        const path = relative(folder, resolve(file));
        if (!path.startsWith('..') && !isAbsolute(path) && path in ART_PAGES)
          server.ws.send({ type: 'full-reload', path: '*' });
      };
      server.watcher.on('change', reload);
      server.watcher.on('add', reload);
    },
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => withGuide(html, folder),
    },
  };
}

/** Copies the guide's files from the Dereth checkout at `tree` into content/art/. */
export async function syncArt(tree, to = CONTENT) {
  const from = resolve(tree, TREE_DOCS);
  await mkdir(to, { recursive: true });
  for (const file of Object.keys(ART_PAGES)) {
    await copyFile(join(from, file), join(to, file));
    console.log(`${join(from, file)} -> ${join(to, file)}`);
  }
}

const self = realpathSync(fileURLToPath(import.meta.url));
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === self) {
  const [command, tree] = process.argv.slice(2);
  if (command !== 'sync' || !tree) {
    console.error('Usage: npm run sync-art -- <path to a Dereth checkout>');
    process.exit(2);
  }
  await syncArt(tree);
}
