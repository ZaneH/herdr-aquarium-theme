import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { speciesFor, detailsFor, fishAsset, schoolGeometry, newCompletions, schoolFamilies, floatingGeometry, surfaceGeometry } from '../mods/aquarium/model.js';

test('fish assignment is stable and every selected sprite exists', () => {
  for (let i = 0; i < 100; i++) {
    const address = `machine/t${i}`;
    assert.equal(speciesFor(address), speciesFor(address));
    for (const suffix of ['.png', '-left.png', '-gold.png', '-left-gold.png', '-swim.webp', '-glide.webp']) {
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

test('floating poses use explicit family heading, never an independent animation clock', () => {
  const address = 't7';
  for (const paused of [true, false]) for (const turning of [true, false]) {
    for (const status of ['working', 'idle', 'blocked', 'done']) for (const face of ['left', 'right']) {
      const asset = fishAsset({ address: 'child', status }, paused, turning, address, true, face);
      const species = speciesFor(address);
      const active = !paused && ['working', 'idle'].includes(status);
      assert.equal(asset, active && ['clownfish', 'blue_tang', 'koi', 'largemouth_bass', 'rainbow_trout', 'sockeye_salmon', 'piranha', 'swordfish', 'bluefin_tuna', 'channel_catfish', 'anglerfish'].includes(species)
        ? `${species}-tail-${face}.webp`
        : `${species}${face === 'left' ? '-left' : ''}${status === 'done' ? '-gold' : ''}.png`);
      assert.ok(existsSync(new URL(`../mods/aquarium/assets/${asset}`, import.meta.url)));
    }
  }
});

test('in-place tail pilots loop only when active and never own facing or a travel route', () => {
  for (const species of ['clownfish', 'blue_tang', 'koi', 'largemouth_bass', 'rainbow_trout', 'sockeye_salmon', 'piranha', 'swordfish', 'bluefin_tuna', 'channel_catfish', 'anglerfish']) {
    for (const face of ['left', 'right']) for (const turning of [true, false]) {
      for (const status of ['working', 'idle', 'blocked', 'done', 'unknown']) {
        for (const paused of [true, false]) {
          const asset = fishAsset({ address: 'child', status }, paused, turning, 'leader', true, face, species);
          const active = !paused && ['working', 'idle'].includes(status);
          assert.equal(asset, active ? `${species}-tail-${face}.webp`
            : `${species}${face === 'left' ? '-left' : ''}${status === 'done' ? '-gold' : ''}.png`);
          assert.ok(existsSync(new URL(`../mods/aquarium/assets/${asset}`, import.meta.url)));
        }
      }
    }
    assert.equal(fishAsset({ address: 'child', status: 'working' }, false, true, 'leader', false, 'left', species), `${species}-swim.webp`);
  }
});

test('floating families use bounded whole-tank paths and fit children without clipping', () => {
  for (const width of [104, 240, 260, 800, 1600]) {
    for (const height of [178, 300, 800]) {
      for (const children of [0, 1, 2, 6, 30]) {
        for (const address of ['t1', 't2', 'remote/t3']) {
          const g = floatingGeometry(width, height, address, children);
          assert.deepEqual(g, floatingGeometry(width, height, address, children));
          assert.ok(g.width <= width);
          for (const x of [g.x, g.maxX]) assert.ok(x >= 0 && x + g.width <= width + 0.00001);
          for (const y of [g.y, g.maxY]) assert.ok(y >= 0 && y + g.height <= Math.max(height, g.height) + 0.00001);
        }
      }
    }
  }
  const g = floatingGeometry(1200, 800, 't1', 0);
  assert.ok(g.maxX > 700);
  assert.ok(g.maxY > 300);
});

test('surface tiles overscan both ends throughout the whole wave movement', () => {
  for (const width of [104, 400, 720, 1172, 1600, 2560, 8000]) {
    const g = surfaceGeometry(width);
    assert.equal(g.tileWidth / g.height, 400 / 48);
    for (const left of [-g.travel, -g.travel / 2, 0]) {
      assert.ok(left <= 0);
      assert.ok(left + g.count * g.tileWidth >= width);
    }
  }
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
    { leader, children: [{ agent: grandchild, depth: 3 }, { agent: child, depth: 2 }] },
  ]);
  assert.equal(fishAsset(child, false, true, leader.address), fishAsset(leader, false, true));
  assert.equal(fishAsset(grandchild, false, true, leader.address), `${speciesFor(leader.address)}-gold.png`);
  assert.equal(detailsFor(child, { parent: 't1' }).includes('Parent: t1'), true);
});

test('moray eel: floating body wave from mirrored canonical side art, stills matched', () => {
  for (const face of ['left', 'right']) for (const turning of [true, false]) {
    for (const status of ['working', 'idle', 'blocked', 'done', 'unknown']) for (const paused of [true, false]) {
      const asset = fishAsset({ address: 'child', status }, paused, turning, 'leader', true, face, 'moray_eel');
      const active = !paused && ['working', 'idle'].includes(status);
      assert.equal(asset, active ? `moray_eel-body-${face}.webp`
        : `moray_eel-inplace-${status === 'done' ? `gold-${face}` : face}.png`);
      assert.ok(existsSync(new URL(`../mods/aquarium/assets/${asset}`, import.meta.url)));
    }
  }
  // Organized travelling clips are untouched for the eel.
  for (const turning of [true, false]) for (const paused of [true, false]) {
    assert.equal(fishAsset({ address: 'child', status: 'working' }, paused, turning, 'leader', false, 'left', 'moray_eel'),
      paused ? 'moray_eel.png' : `moray_eel-${turning ? 'swim' : 'glide'}.webp`);
  }
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
