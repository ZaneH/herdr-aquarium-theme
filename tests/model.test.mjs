import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { speciesFor, detailsFor, fishAsset, schoolGeometry } from '../mods/aquarium/model.js';

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
