// The landing page's headings: each program's latest release, picked from the repository's list.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latestRelease } from '../src/releases.ts';
import type { Release } from '../src/releases.ts';

const release = (tag: string, extra: Partial<Release> = {}): Release => ({
  tag_name: tag,
  html_url: `https://github.com/dereth-network/dereth/releases/tag/${tag}`,
  ...extra,
});

const list = [
  release('network-hub-v0.2.2'),
  release('empyrean-v0.4.0', { prerelease: true }),
  release('dereth-web-v0.4.5'),
  release('empyrean-v0.3.2'),
  release('dereth-v0.4.4'),
  release('lyceum-v0.1.0', { draft: true }),
  release('dereth-v0.4.3'),
];

test('each program’s newest published release is picked, newest first as GitHub lists them', () => {
  assert.equal(latestRelease(list, 'dereth')?.tag_name, 'dereth-v0.4.4', 'not dereth-web');
  assert.equal(latestRelease(list, 'empyrean')?.tag_name, 'empyrean-v0.3.2', 'no prerelease');
  assert.equal(latestRelease(list, 'lyceum'), null, 'no draft, so none yet');
  assert.equal(latestRelease([], 'dereth'), null);
});
