import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { speciesFor, detailsFor, fishAsset, schoolGeometry, newCompletions, schoolFamilies } from '../mods/aquarium/model.js';

test('fish assignment is stable and every selected sprite exists', () => {
  for (let i = 0; i < 100; i++) {
    const address = `machine/t${i}`;
    assert.equal(speciesFor(address), speciesFor(address));
    for (const suffix of ['.png', '-gold.png', '-swim.webp', '-glide.webp']) {
      assert.ok(existsSync(new URL(`../mods/aquarium/assets/${speciesFor(address)}${suffix}`, import.meta.url)));
    }
  }
});

test('missing telemetry is honest, and a remote folder is kept as reported', () => {
  assert.deepEqual(detailsFor({ address: 'remote/t7', status: 'blocked' }),
    ['remote/t7', 'Status: blocked', 'Cache: not reported', 'Thinking: not reported']);
  assert.equal(detailsFor({ address: 't1', status: 'idle' }, { cwd: '/home/me/project' }).at(-1),
    'Folder: /home/me/project');
});

test('motion and status select the right asset, including gold and blocked fish', () => {
  const agent = { address: 't7', status: 'working' };
  assert.ok(fishAsset(agent, true, true).endsWith('.png'));
  assert.ok(fishAsset(agent, false, true).endsWith('-swim.webp'));
  assert.ok(fishAsset(agent, false, false).endsWith('-glide.webp'));
  assert.ok(fishAsset({ ...agent, status: 'idle' }, false, true).endsWith('-swim.webp'));
  assert.ok(fishAsset({ ...agent, status: 'done' }, false, true).endsWith('-gold.png'));
  assert.ok(fishAsset({ ...agent, status: 'blocked' }, false, true).endsWith('.png'));
});

test('sub-agents form families through real parent chains, regardless of input order', () => {
  const leader = { address: 't1', status: 'working' };
  const child = { address: 't2', status: 'working' };
  const grandchild = { address: 't3', status: 'done' };
  const unrelated = { address: 'remote/t1', status: 'idle' };
  const family = schoolFamilies([grandchild, child, unrelated, leader], [
    { address: 't3', parent: 't2' }, { address: 't2', parent: 'bridge' },
    { address: 'bridge', parent: 't1' }, { address: 't1' }, { address: 'remote/t1' },
  ]);
  assert.deepEqual(family, [
    { leader: unrelated, children: [] },
    { leader, children: [{ agent: grandchild, depth: 2 }, { agent: child, depth: 1 }] },
  ]);
  assert.equal(fishAsset(child, false, true, leader.address), fishAsset(leader, false, true));
  assert.equal(fishAsset(grandchild, false, true, leader.address), `${speciesFor(leader.address)}-gold.png`);
  assert.equal(detailsFor(child, { parent: 't1' }).includes('Parent: t1'), true);
});

test('missing parents and cyclic parent records never invent a family or lose fish', () => {
  const school = ['t1', 't2', 'remote/t1'].map(address => ({ address }));
  for (const terminals of [[], [{ address: 't1', parent: 'missing/t1' }], [
    { address: 't1', parent: 't2' }, { address: 't2', parent: 't1' },
  ]]) {
    assert.deepEqual(schoolFamilies(school, terminals), school.map(leader => ({ leader, children: [] })));
  }
  assert.deepEqual(schoolFamilies([], []), []);
});

test('completion shimmer triggers only on entering done, not a redraw or title update', () => {
  const done = { address: 't7', status: 'done', seq: 3 };
  assert.deepEqual(newCompletions(new Map(), [done]), [done]);
  assert.deepEqual(newCompletions(new Map([['t7', 'working']]), [done]), [done]);
  assert.deepEqual(newCompletions(new Map([['t7', 'done']]), [{ ...done, seq: 4 }]), []);
  assert.deepEqual(newCompletions(new Map([['t7', 'done']]), [{ ...done, status: 'idle' }]), []);
  assert.deepEqual(newCompletions(new Map([['t7', 'idle']]), [done]), [done]);
  assert.deepEqual(newCompletions(new Map([['t7', 'done']]), []), []);
});

test('tank geometry handles empty, narrow, and crowded schools without zero divisions', () => {
  for (const width of [120, 320, 700, 1200]) {
    for (const count of [0, 1, 2, 25, 100]) {
      for (const immersive of [true, false]) {
        const size = schoolGeometry(width, 600, count, immersive);
        assert.ok(Number.isFinite(size.lane) && Number.isFinite(size.height));
        assert.ok(size.lane <= width && size.height >= 155);
      }
    }
  }
});
