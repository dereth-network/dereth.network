// What a link to the site shows where it is shared (Discord, chat apps, social sites): the Open
// Graph tags each page carries, made from its own title and description, with a picture. Those
// readers don't run scripts, so a page's realm can't change them; each game's home page is a page
// of its own, /dereth/ and /auberean/, the home page with that game's tags (and realm.js opens it in
// that game).

/** Where the site lives: Open Graph pictures are named by their whole address. */
export const SITE = 'https://dereth.network';

/** The picture a shared link shows: the network's emblem. */
export const NETWORK_CARD = `${SITE}/media/art/network-card.png`;

/** Each game's home page: its address, title, description and picture. */
export const GAME_HOMES = {
  dereth: {
    path: 'dereth/index.html',
    title: 'Dereth · Dereth Network',
    description:
      "Dereth is a modern, open-source Asheron's Call client for Windows, macOS, Linux and the browser, with Empyrean, its server, and Lyceum, its world builder, on the Dereth Network.",
    card: `${SITE}/media/art/dereth-card.png`,
  },
  auberean: {
    path: 'auberean/index.html',
    title: 'Auberean · Dereth Network',
    description:
      "Auberean is a modern, open-source Asheron's Call 2 client, with Yalain, its server, and Athenaeum, its world builder, on the Dereth Network.",
    card: `${SITE}/media/art/auberean-card.png`,
  },
};

const escape = (text) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescape = (text) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** A page's title and description, as its markup gives them. */
export function pageText(html) {
  const title = unescape(html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? 'Dereth Network');
  const description = unescape(
    html.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1]?.trim() ?? '',
  );
  return { title, description };
}

/** The page with its Open Graph tags, from its own title and description, before `</head>`. */
export function withOpenGraph(html, image = NETWORK_CARD) {
  const { title, description } = pageText(html);
  const tags = [
    ['og:site_name', 'Dereth Network'],
    ['og:type', 'website'],
    ['og:title', title],
    ['og:description', description],
    ['og:image', image],
  ]
    .filter(([, content]) => content)
    .map(([property, content]) => `<meta property="${property}" content="${escape(content)}" />`);
  return html.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`);
}

/** The home page as `game`'s (`dereth` or `auberean`): its title, description and picture. */
export function gameHome(html, game) {
  const home = GAME_HOMES[game];
  const page = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(home.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${escape(home.description)}$2`)
    .replace(/\n\s*<meta property="og:[^>]*\/>/g, '');
  return withOpenGraph(page, home.card);
}

/** The page with its preview pictures named under `origin` in place of the site's own: for a
 * page served elsewhere than the site (the dev server, through a tunnel). */
export function servedFrom(html, origin) {
  return html.replace(
    /(<meta property="og:image" content=")https:\/\/dereth\.network(\/)/g,
    `$1${origin.replace(/\/+$/, '')}$2`,
  );
}
