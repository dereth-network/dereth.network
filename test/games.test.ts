// The two games: a world's game, and a list with one game's first.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMULATORS, GAME_NAMES, gameFirst, gameOf, isGame, otherGame } from '../src/games.ts';

test('a world that names no game is Dereth’s', () => {
  assert.equal(gameOf({ game: 'auberean' }), 'auberean');
  assert.equal(gameOf({ game: 'dereth' }), 'dereth');
  assert.equal(gameOf({}), 'dereth');
  assert.equal(gameOf({ game: 'ac3' }), 'dereth', 'a game the site doesn’t know is read as Dereth');
  assert.equal(gameOf(null), 'dereth');
  assert.ok(isGame('auberean') && !isGame('any'));
});

test('each game has its name, and offers its own emulators', () => {
  assert.equal(GAME_NAMES.dereth, 'Dereth');
  assert.equal(GAME_NAMES.auberean, 'Auberean');
  assert.equal(otherGame('dereth'), 'auberean');
  assert.equal(EMULATORS.dereth[0], 'ACE');
  assert.equal(EMULATORS.auberean[0], 'Yalain');
});

test('one game’s come first, each game’s in the order they came', () => {
  const worlds = [
    { slug: 'a', game: 'dereth' },
    { slug: 'b', game: 'auberean' },
    { slug: 'c' },
    { slug: 'd', game: 'auberean' },
  ];
  assert.deepEqual(
    gameFirst(worlds, 'auberean', gameOf).map((w) => w.slug),
    ['b', 'd', 'a', 'c'],
  );
  assert.deepEqual(
    gameFirst(worlds, 'dereth', gameOf).map((w) => w.slug),
    ['a', 'c', 'b', 'd'],
  );
});
