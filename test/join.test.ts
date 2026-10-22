// The join page's reading of a world link: the world after the `#`, checked as the launcher checks
// a world added by hand, and the launcher's own link for it, which the launcher reads back to the
// same world.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_NAME, appLink, shown, worldFromHash } from '../src/network/join.ts';

test('a link names its world after the #, in any order, with escapes', () => {
  const want = { host: 'play.example.org', port: 9000, name: 'Coldeve & Friends' };
  for (const hash of [
    '#host=play.example.org&port=9000&name=Coldeve%20%26%20Friends',
    '#name=Coldeve+%26+Friends&port=9000&host=play.example.org',
    '#HOST=play.example.org&Port=9000&name=Coldeve%20%26%20Friends',
    'host=play.example.org&port=9000&name=Coldeve%20%26%20Friends&extra=1',
  ])
    assert.deepEqual(worldFromHash(hash), want, hash);
  assert.deepEqual(shown(want), { name: 'Coldeve & Friends', where: 'play.example.org:9000' });
});

test('a link whose host or port a world cannot be added with names no world', () => {
  for (const hash of [
    '',
    '#',
    '#port=9000',
    '#host=a%20b&port=9000',
    '#host=a:b&port=9000',
    '#host=a%2Fb&port=9000',
    '#host=a.example&port=0',
    '#host=a.example&port=65536',
    '#host=a.example&port=x',
    '#host=a.example',
    '#host=%E0%A4%A&port=9000',
  ])
    assert.equal(worldFromHash(hash), null, hash);
});

test('a link never carries an account or a password, and its name is cleaned', () => {
  const world = worldFromHash(
    '#host=a.example&port=9000&name=%0D%0AHi%07%20there&account=bob&password=hunter2',
  );
  assert.deepEqual(world, { host: 'a.example', port: 9000, name: 'Hi there' });
  const long = worldFromHash(`#host=a.example&port=9000&name=${'x'.repeat(200)}`);
  assert.equal(long?.name.length, MAX_NAME);
  assert.equal(worldFromHash('#host=a.example&port=9000')?.name, 'a.example');
});

test('the launcher’s link carries the same world, every reserved character escaped', () => {
  const world = { host: '192.0.2.10', port: 9050, name: 'Ünïcode, "quotes" & #hash' };
  const link = appLink(world);
  const name = '%C3%9Cn%C3%AFcode%2C%20%22quotes%22%20%26%20%23hash';
  assert.equal(link, `dereth://join?host=192.0.2.10&port=9050&name=${name}`);
  assert.deepEqual(worldFromHash(`#${link.slice(link.indexOf('?') + 1)}`), world);
});
