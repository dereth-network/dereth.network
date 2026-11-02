// The two games the Dereth Network carries, each known by its client's name: Dereth for
// Asheron's Call, Auberean for Asheron's Call 2. The same name is the realm the site shows, and the
// hub's `game` for a world, a character and a search. A world that names no game is Dereth's.

export type Game = 'dereth' | 'auberean';

export const GAMES: readonly Game[] = ['dereth', 'auberean'];

/** What the site's lists, headings and choices call each game. */
export const GAME_NAMES: Record<Game, string> = {
  dereth: 'Dereth',
  auberean: 'Auberean',
};

/** The emulators a world of each game may run, offered in the register form (any other may be
 * typed). */
export const EMULATORS: Record<Game, readonly string[]> = {
  dereth: ['ACE', 'Empyrean', 'GDLE'],
  auberean: ['Yalain'],
};

export function isGame(value: unknown): value is Game {
  return value === 'dereth' || value === 'auberean';
}

/** A world's (or a character's) game: the one it names, or Dereth. */
export function gameOf(thing: { game?: string | null } | null | undefined): Game {
  return thing?.game === 'auberean' ? 'auberean' : 'dereth';
}

/** The other game. */
export function otherGame(game: Game): Game {
  return game === 'dereth' ? 'auberean' : 'dereth';
}

/** `items` with those of `game` first, each game's in the order they came. */
export function gameFirst<T>(items: readonly T[], game: Game, of: (item: T) => Game): T[] {
  return [...items.filter((i) => of(i) === game), ...items.filter((i) => of(i) !== game)];
}
