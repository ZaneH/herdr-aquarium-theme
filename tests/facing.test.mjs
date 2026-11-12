import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionAt, parkMotion, startMotion, advanceMotion } from '../mods/aquarium/motion.js';
import { floatingGeometry, fishAsset, speciesFor } from '../mods/aquarium/model.js';

// Sample actual interpolated displacement, not just the destination metadata.
function checkLeg(m) {
  let previous = positionAt(m, m.started);
  for (const fraction of [0.01, 0.25, 0.5, 0.99, 1, 1.02]) {
    const p = positionAt(m, m.started + m.duration * fraction);
    const dx = p.x - previous.x, dy = p.y - previous.y;
    if (dx) assert.equal(m.face, dx > 0 ? 'right' : 'left');
    if (dx || dy) {
      const heading = Math.atan2(dy, dx);
      assert.ok(Math.abs(Math.atan2(Math.sin(heading - m.heading), Math.cos(heading - m.heading))) < 1e-8);
    }
    previous = p;
  }
}

for (const speed of ['slow', 'normal']) for (const soft of [false, true]) {
  test(`complete reversals and interrupted baselines: ${speed}, smooth=${soft}`, () => {
    const g = { seed: 42, x: 190, y: 100, maxX: 200, maxY: 200 };
    let m = startMotion(g, null, 0);
    const phases = new Set(), directions = new Set();
    let reversals = 0;
    for (let i = 0; i < 100; i++) {
      const old = m;
      m = advanceMotion(m, g, m.due, speed, soft);
      phases.add(m.phase);
      if (m.face !== old.face) {
        reversals++;
        assert.deepEqual(positionAt(old, old.due), positionAt(m, m.started));
        assert.deepEqual(m.from, m.to);
      }
      if (m.phase === 'moving') {
        checkLeg(m);
        directions.add(m.face);
      }
      // Pause/status stops, resize, and option changes all use these same
      // baseline helpers in main.js. Exercise interruption in every phase.
      const now = m.started + m.duration * 0.37;
      for (const bounds of [g, { ...g, maxX: 40, maxY: 30 }]) {
        const parked = parkMotion(bounds, m, now);
        const point = positionAt(m, now);
        assert.deepEqual(parked.from, { x: Math.min(point.x, bounds.maxX), y: Math.min(point.y, bounds.maxY) });
        assert.deepEqual(positionAt(parked, now + 100000), parked.from);
        assert.equal(parked.face, m.face);
        assert.equal(parked.opacity, 1);
        let resumed = startMotion(bounds, parked, now + 1000);
        assert.deepEqual(resumed.from, parked.from);
        assert.equal(resumed.pending, undefined);
        // A changed speed/turn mode must not revive an interrupted pending leg.
        for (let j = 0; j < 4 && resumed.phase !== 'moving'; j++) {
          resumed = advanceMotion(resumed, bounds, resumed.due, speed === 'slow' ? 'normal' : 'slow', !soft);
        }
        assert.equal(resumed.phase, 'moving');
        checkLeg(resumed);
      }
    }
    assert.ok(reversals >= 4);
    assert.deepEqual(directions, new Set(['left', 'right']));
    assert.ok(phases.has('moving'));
    for (const phase of soft ? ['fade-out', 'fade-in'] : ['turn']) assert.ok(phases.has(phase));
  });
}

test('all species: family poses follow sampled travel regardless of child status', () => {
  const species = new Set();
  for (let i = 0; i < 200; i++) {
    const address = `t${i}`;
    species.add(speciesFor(address));
    const g = floatingGeometry(800, 600, address, 3);
    let m = startMotion(g, null, 0);
    const directions = new Set();
    for (let step = 0; step < 40; step++) {
      m = advanceMotion(m, g, m.due, 'normal', true);
      if (m.phase !== 'moving') continue;
      checkLeg(m);
      directions.add(m.face);
      for (const status of ['working', 'idle', 'blocked', 'done']) {
        const asset = fishAsset({ address: 'unrelated-child', status }, false, true, address, true, m.face);
        const species = speciesFor(address);
        const expected = ['clownfish', 'blue_tang', 'koi', 'largemouth_bass', 'rainbow_trout', 'sockeye_salmon', 'piranha', 'swordfish'].includes(species) && ['working', 'idle'].includes(status)
          ? `${species}-tail-${m.face}.webp`
          : `${species}${m.face === 'left' ? '-left' : ''}${status === 'done' ? '-gold' : ''}.png`;
        assert.equal(asset, expected);
      }
    }
    assert.equal(directions.size, 2);
  }
  assert.equal(species.size, 25);
});
