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

/** The rulesets a world of each game may name, as the hub spells them, in the order the pages
 * offer them. An Asheron's Call 2 world says where its players may fight: at peace but for its
 * conflict areas, kingdoms against each other anywhere, or anyone against anyone. */
export const RULESETS: Record<Game, readonly string[]> = {
  dereth: ['PvE', 'PvP', 'PvP-lite', 'Custom'],
  auberean: ['Standard', 'KvK', 'FFA'],
};

/** The rulesets a list of `game`'s worlds (or both games', `any`) may be filtered by. */
export function rulesetsOf(game: Game | 'any'): string[] {
  return game === 'any' ? [...RULESETS.dereth, ...RULESETS.auberean] : [...RULESETS[game]];
}

/** `ruleset` when a world of `game` may name it, else the game's first. */
export function rulesetFor(game: Game, ruleset: string | null | undefined): string {
  return ruleset && RULESETS[game].includes(ruleset) ? ruleset : RULESETS[game][0];
}

/** The era of Asheron's Call a world plays, as the hub spells it: the end of retail, Infiltration
 * (February 2005) or Launch (1999). An Asheron's Call 2 world plays the end of retail alone. */
export type Era = 'eor' | 'infiltration' | 'launch';

export const ERAS: readonly Era[] = ['eor', 'infiltration', 'launch'];

/** What the register form calls each era. */
export const ERA_NAMES: Record<Era, string> = {
  eor: 'End of retail',
  infiltration: 'Infiltration (February 2005)',
  launch: 'Launch (1999)',
};

/** The eras a world of `game` may say it plays. */
export function erasFor(game: Game): readonly Era[] {
  return game === 'auberean' ? ['eor'] : ERAS;
}

export function isEra(value: unknown): value is Era {
  return value === 'eor' || value === 'infiltration' || value === 'launch';
}

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
