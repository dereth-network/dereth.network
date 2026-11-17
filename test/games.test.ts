// The two games: a world's game, and a list with one game's first.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EMULATORS,
  GAME_NAMES,
  RULESETS,
  gameFirst,
  gameOf,
  isGame,
  otherGame,
  rulesetFor,
  rulesetsOf,
} from '../src/games.ts';

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

test('each game offers its own rulesets, and a world keeps one of its game’s', () => {
  assert.deepEqual(RULESETS.dereth, ['PvE', 'PvP', 'PvP-lite', 'Custom']);
  assert.deepEqual(RULESETS.auberean, ['Standard', 'KvK', 'FFA']);
  assert.deepEqual(rulesetsOf('auberean'), ['Standard', 'KvK', 'FFA']);
  assert.deepEqual(rulesetsOf('any'), [...RULESETS.dereth, ...RULESETS.auberean]);
  assert.equal(rulesetFor('auberean', 'KvK'), 'KvK');
  assert.equal(rulesetFor('auberean', 'PvE'), 'Standard', 'another game’s is the game’s first');
  assert.equal(rulesetFor('dereth', 'FFA'), 'PvE');
  assert.equal(rulesetFor('dereth', null), 'PvE');
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
