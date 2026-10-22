# dereth.network

The website for Dereth Network: the landing page for the Dereth client and the Empyrean server,
and the Dereth Network's pages for players and world operators.

- `index.html`, `src/style.css`, and `src/main.ts` (the before-and-after sliders).
- The network's pages, each a folder with its `index.html` and a script in `src/pages/`:
  - `/network/`: what the network is, and its in-game commands;
  - `/worlds/`: the hub's list of worlds, searched and filtered;
  - `/operators/`: sign in with Discord, register or claim a world, prove you run it, turn the
    network on or off, get a new key, mirror the world's rooms and the Global room into channels
    of your Discord server (where the hub has Discord's bot), and follow reports; for the hub's
    admins, review them, and keep the hub's settings: the approvals a day, the Discord account
    age and the days a world may wait to be proven (each with its default, and their history),
    the network's own mirrors, the picture mirrored lines show, every world's mirrors (take any
    away), and the tells carried into Discord;
  - `/report/`: report a world;
  - `/link/`: the link `@dn link` gives a character in game opens here, its one-time code after
    the `#`, which no server is sent; signed in with Discord (the page signs you in first, the
    code kept in the tab meanwhile), it links the character to your account at once. A link
    opened without its code offers a box for the code;
  - `/join/`: a world a friend's launcher links to, its host, port and name after the `#`, which
    no server is sent: it offers to open the world in Dereth (`dereth://join?...`, which fills in
    Add world there, nothing more) or to get Dereth. It calls nothing, the hub included;
  - `/characters/`: your linked characters (unlink any) and where each stands in the directory,
    your friends, how tells to them reach your Discord while you aren't playing (where the hub
    has Discord's bot), and forgetting all of it;
  - `/directory/`: the characters on the Dereth Network (`@dn on` lists one, `@dn off` takes it
    out), searched by name, world, level, heritage and allegiance, by latest change or by level;
    `/directory/character/?a=Name@world`, a listed character's profile and its allegiance's
    listed members, linked to each other's pages; and `/directory/allegiance/?w=world&k=key`, an
    allegiance's listed members. Every address the directory doesn't show gets the same page.
    Search engines are asked to keep out of all of them (`noindex` in each page, the
    `X-Robots-Tag` header, and `public/robots.txt`).

  They call the hub's API from the browser (`src/network/hub.ts`); the site has no server of its
  own beyond `server.mjs`. `src/network.css` is their stylesheet on top of `src/style.css`. The
  directory's pages, and the Discord parts of `/operators/`, are described as plain data
  (`src/network/view.ts`, `directory.ts`, `discord.ts`) before they become elements, and the
  link page's steps are plain functions (`src/network/link.ts`), so the tests read what each
  page shows and offers; `src/network/game.ts` holds the game's names for the skill, augmentation, heritage and rank numbers a profile carries.

- `public/media/`: the screenshots, the launcher's painting, the icons, and the two fonts, Cinzel
  and EB Garamond, under the SIL Open Font Licence (`public/media/fonts/OFL-*.txt`). Files in
  `public/` keep their names, so they live under `/media/`, not `/assets/`, which the server
  caches for a year for Vite's hashed files.
- The server's content-security policy allows no inline styles or scripts, so none go in any
  page, and lets the pages connect only to the site and the hub. The build's check refuses a
  page that breaks either.

```text
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # builds dist/ and checks every page
npm test           # the API client, the server, and every page built and checked
npm run deploy     # builds, checks, and deploys dist/ to Cloudflare Pages
```

`server.mjs` serves `dist/` (Node, no dependencies), with `/healthz` for the release check.

## Cloudflare Pages

The site is static, so a static host serves it as well as `server.mjs` does. The build writes
`dist/_headers` (the server's headers and policy, and the year-long caching of `/assets/`) and
`dist/_redirects` (the moved pages) from the same rules `server.mjs` follows, so the two never
differ. Pages answers any other page address with the home page, as the server does, because the
site has no `404.html`.

```sh
npm ci
npm run deploy     # npm run build, then:
                   # npx wrangler@4 pages deploy dist --project-name dereth-network --branch main
```

The first deploy asks you to sign in to Cloudflare (`npx wrangler@4 login`) and creates the
project. Give it its domain under the project's Custom domains (`dereth.network`); Cloudflare then
points the domain's record at Pages. A deploy from any other `--branch` is a preview at its own
`*.pages.dev` address: its pages read the hub, but signing in works only under `dereth.network`
itself, the hub's site origin. The hub needs no change while the site keeps its address.

## The hub

The pages call `https://hub.dereth.network`. To try them against another hub (one on this
machine, say), set `DERETH_HUB_URL` for the build or the dev server, and for `npm start`, which
lets the pages reach it:

```text
DERETH_HUB_URL=http://127.0.0.1:8650 npm run dev
DERETH_HUB_URL=http://127.0.0.1:8650 npm run build && DERETH_HUB_URL=http://127.0.0.1:8650 npm start
```

The hub answers its operator routes only for the site's origin, so start it with that origin
(`--site-origin http://127.0.0.1:5173` for the dev server, `http://127.0.0.1:3000` for
`npm start`).

To try the pages against the public hub, signed in, serve the dev server under the site's own
domain through a Cloudflare tunnel (for example `dev.dereth.network` → `http://localhost:5173`), add
that origin to the hub as another `--site-origin` (after `https://dereth.network`, which stays
first), and run `DERETH_DEV_HOSTS=dev.dereth.network DERETH_HUB_URL=https://hub.dereth.network npm
run dev`. A sign-in started there comes back there. The hub trusts every site origin it lists to
act for whoever is signed in, so list only hosts you alone serve.

Without a tunnel, signing in needs a hub of your own too: the public hub sends Discord sign-ins back to the public
site, and its session cookie belongs to `hub.dereth.network`, which a page on `127.0.0.1` never
sends. To try sign-in locally:

1. In Discord's developer portal, add the redirect `http://127.0.0.1:8650/v1/auth/discord/callback`
   to the application (loopback addresses may use plain http).
2. Run a hub on this machine with that origin and the application's id and secret:

   ```text
   dereth-network-hub serve --db ./dev-hub.sqlite --public-url http://127.0.0.1:8650      --site-origin http://127.0.0.1:5173 --discord-client-id <id>      --discord-client-secret-file ./discord-secret --admin <your Discord id>
   ```

3. `DERETH_HUB_URL=http://127.0.0.1:8650 npm run dev`, and open `http://127.0.0.1:5173` (not
   `localhost`, so the page and the hub are the same site and the session cookie is sent).

## Notices

Asheron's Call and all related names, marks, and artwork are the property of their respective
owners; this is an unaffiliated, non-commercial fan project and claims no rights to them.
