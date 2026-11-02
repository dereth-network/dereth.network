// The portals beside the lockup, as the launcher has them: one for each game, the one picked
// glowing in its own colour with its vortex turning. Picking the other changes the realm the
// whole site is about: the page's words (whatever is marked `data-realm-only`), its accent, and
// its painting, which opens out from the portal picked. The site keeps the realm for the next
// page and the next visit. /realm.js set it before the page was drawn.
import { GAME_NAMES, isGame } from './games.ts';
import type { Game } from './games.ts';

const root = document.documentElement;
const KEY = 'dereth.realm';
const listeners: ((realm: Game) => void)[] = [];

export function currentRealm(): Game {
  return root.dataset.realm === 'auberean' ? 'auberean' : 'dereth';
}

/** The realm's game: the same name. */
export function currentGame(): Game {
  return currentRealm();
}

/** Calls `then` with the new realm each time it changes. */
export function onRealm(then: (realm: Game) => void): void {
  listeners.push(then);
}

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// The home page, at /, /dereth/ or /auberean/: one page in either game.
const HOME = /^\/((dereth|auberean)\/?)?$/;

/** The home page's window title names its game, as /dereth/'s and /auberean/'s do. */
function titleHome() {
  if (HOME.test(location.pathname))
    document.title = `${GAME_NAMES[currentRealm()]} · Dereth Network`;
}

function markPortals() {
  for (const pick of document.querySelectorAll<HTMLElement>('[data-realm-pick]')) {
    const picked = pick.dataset.realmPick === currentRealm();
    pick.setAttribute('aria-checked', String(picked));
    // Tab reaches the group once, at the portal picked; the arrows move within it.
    pick.tabIndex = picked ? 0 : -1;
  }
}

// The new realm's painting comes in over the one shown, opening out from `from` (a point on the
// page) as through a portal, and the old one goes once it is covered.
let turning: Animation | null = null;
function turnPainting(realm: Game, from: { x: number; y: number } | null) {
  const vista = document.querySelector<HTMLElement>('.vista');
  const next = vista?.querySelector<HTMLElement>(`[data-realm-of="${realm}"]`);
  if (!vista || !next || still()) return;
  turning?.cancel();
  vista.classList.add('turning');
  next.classList.add('coming');
  turning = next.animate(
    from
      ? [
          { clipPath: `circle(0 at ${from.x}px ${from.y}px)` },
          { clipPath: `circle(150vmax at ${from.x}px ${from.y}px)` },
        ]
      : [{ opacity: 0 }, { opacity: 1 }],
    { duration: 640, easing: 'cubic-bezier(0.55, 0, 0.25, 1)' },
  );
  const mine = turning;
  const settle = () => {
    if (turning !== mine) return;
    turning = null;
    vista.classList.remove('turning');
    next.classList.remove('coming');
  };
  mine.finished.then(settle, settle);
}

/** Changes the realm, opening its painting out from `from`; `now` changes it at once, with
 * nothing easing over, as a page opening in another realm should. */
export function setRealm(
  realm: Game,
  from: { x: number; y: number } | null = null,
  now = false,
): void {
  if (realm === currentRealm()) return;
  try {
    localStorage.setItem(KEY, realm);
  } catch {
    // Kept for this page only.
  }
  // An address that asked for the other realm would bring it back on reload. On the home page, the
  // address becomes the new game's own home page (/dereth/, /auberean/), ready to share.
  const url = new URL(location.href);
  const before = url.href;
  url.searchParams.delete('realm');
  if (HOME.test(url.pathname)) url.pathname = `/${realm}/`;
  if (url.href !== before) history.replaceState(history.state, '', url);
  if (now) {
    root.classList.add('still');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('still')));
  } else turnPainting(realm, from);
  root.dataset.realm = realm;
  markPortals();
  titleHome();
  if (!now && !still())
    for (const part of document.querySelectorAll('.page > :not(.top)'))
      part.animate(
        [
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'none' },
        ],
        {
          duration: 320,
          easing: 'ease-out',
        },
      );
  for (const then of listeners) then(realm);
}

for (const pick of document.querySelectorAll<HTMLElement>('[data-realm-pick]')) {
  pick.addEventListener('click', () => {
    const realm = pick.dataset.realmPick;
    if (!isGame(realm)) return;
    const portal = pick.querySelector('.portal')?.getBoundingClientRect();
    setRealm(
      realm,
      portal ? { x: portal.left + portal.width / 2, y: portal.top + portal.height / 2 } : null,
    );
  });
  // Arrow keys move between the portals, as in any group of radio buttons.
  pick.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const other = pick.parentElement?.querySelector<HTMLElement>(
      `[data-realm-pick]:not([data-realm-pick="${pick.dataset.realmPick}"])`,
    );
    if (!other) return;
    event.preventDefault();
    other.focus();
    other.click();
  });
}
markPortals();
titleHome();

// The other realm's painting waits until the page has loaded, then comes in quietly, ready to open
// out the moment its portal is picked.
addEventListener('load', () => {
  for (const img of document.querySelectorAll<HTMLImageElement>('.vista img'))
    img.loading = 'eager';
});
