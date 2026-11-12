import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionAt, parkMotion, startMotion, advanceMotion } from '../mods/aquarium/motion.js';

const geometry = { seed: 42, x: 190, y: 100, maxX: 200, maxY: 200 };

for (const speed of ['slow', 'normal']) for (const soft of [false, true]) {
  test(`${speed}, soft=${soft}: displacement, turns and immutable legs`, () => {
    let m = startMotion(geometry, null, 0);
    let legs = 0;
    for (let i = 0; i < 150; i++) {
      const old = m;
      const now = m.due;
      m = advanceMotion(m, geometry, now, speed, soft);
      if (m.phase === 'moving') {
        legs++;
        const dx = m.to.x - m.from.x;
        const dy = m.to.y - m.from.y;
        assert.equal(m.face, dx > 0 ? 'right' : dx < 0 ? 'left' : old.face);
        if (dx || dy) assert.ok(Math.abs(m.heading - Math.atan2(dy, dx)) < 1e-10);
        assert.equal(m.duration, speed === 'slow' ? 8000 : 6000);
        assert.equal(m.due, now + m.duration + 200);
        assert.strictEqual(advanceMotion(m, geometry, m.due - 1, speed, soft), m);
        assert.equal(m.face, advanceMotion(m, geometry, now + 100, speed, soft).face);
        assert.ok(Math.hypot(dx, dy) <= (speed === 'slow' ? 96 : 144) + 1e-8);
      }
      if (m.face !== old.face) {
        assert.deepEqual(m.from, m.to);
        assert.ok(soft ? old.phase === 'fade-out' && old.opacity === 0 : m.phase === 'turn');
      }
      if (m.phase === 'fade-out' || m.phase === 'fade-in' || m.phase === 'turn') {
        assert.deepEqual(m.from, m.to);
        assert.ok(m.pending);
      }
    }
    assert.ok(legs > 30);
  });
}

test('interpolation, pause and resize clamp without changing direction history', () => {
  const m = { phase: 'moving', from: { x: 10, y: 20 }, to: { x: 110, y: 120 },
    started: 100, duration: 1000, due: 1300, face: 'right', heading: 0.7, step: 9 };
  assert.deepEqual(positionAt(m, 0), m.from);
  assert.deepEqual(positionAt(m, 600), { x: 60, y: 70 });
  assert.deepEqual(positionAt(m, 9999), m.to);
  const p = parkMotion({ ...geometry, maxX: 40, maxY: 50 }, m, 600);
  assert.deepEqual(p.from, { x: 40, y: 50 });
  assert.deepEqual(p.from, p.to);
  assert.equal(p.face, m.face);
  assert.equal(p.heading, m.heading);
  assert.equal(p.step, 9);
  assert.equal(p.due, Infinity);
  assert.equal(p.opacity, 1);
  assert.equal(p.duration, 0);
  assert.strictEqual(advanceMotion(p, geometry, 99999), p);
  const ready = startMotion(geometry, p, 1000);
  assert.equal(ready.due, 1250);
  assert.strictEqual(advanceMotion(ready, geometry, 1249), ready);
});

test('late callbacks advance one phase only and carry the pending leg', () => {
  const ready = startMotion({ ...geometry, x: 200 }, null, 0);
  const out = advanceMotion(ready, geometry, 100000, 'normal', true);
  assert.equal(out.phase, 'fade-out');
  const fade = advanceMotion(out, geometry, 200000, 'slow', false);
  assert.equal(fade.phase, 'fade-in');
  assert.equal(fade.due, 200300);
  const moving = advanceMotion(fade, geometry, 300000, 'slow', false);
  assert.equal(moving.phase, 'moving');
  assert.equal(moving.started, 300000);
  assert.equal(moving.duration, 6000);
  assert.deepEqual(moving.to, out.pending.to);
});

test('zero bounds stay stationary and retain face', () => {
  const g = { seed: 1, x: 99, y: -10, maxX: 0, maxY: 0 };
  let m = startMotion(g, null, 0);
  for (let i = 0; i < 10; i++) {
    m = advanceMotion(m, g, m.due);
    assert.deepEqual(positionAt(m, m.started + 200), { x: 0, y: 0 });
    assert.equal(m.face, 'left');
  }
});

test('food goal steers bounded legs toward the target, clamps and parks on arrival', () => {
  const g = { seed: 7, x: 0, y: 0, maxX: 500, maxY: 400 };
  const goal = { x: 480, y: 20 };
  let m = startMotion(g, null, 0);
  let arrived = false;
  for (let i = 0; i < 60 && !arrived; i++) {
    m = advanceMotion(m, g, m.due, 'slow', true, goal);
    const dx = m.to.x - m.from.x, dy = m.to.y - m.from.y;
    if (m.phase !== 'moving') { assert.deepEqual(m.from, m.to); continue; }
    arrived = !dx && !dy;
    if (!arrived) {
      assert.ok(Math.hypot(dx, dy) <= 96 + 1e-8);
      assert.ok(Math.hypot(goal.x - m.from.x, goal.y - m.from.y)
        >= Math.hypot(goal.x - m.to.x, goal.y - m.to.y) - 1e-8);
    }
  }
  assert.ok(arrived);
  assert.deepEqual(positionAt(m, m.started), { x: Math.min(goal.x, 500), y: Math.max(0, goal.y) });
  // A goal outside the bounds aims at the clamped target instead of leaving the tank.
  const bounds = { ...g, x: 480, y: 20 };
  let far = advanceMotion(m, bounds, 9999999, 'normal', false, { x: 99999, y: -50 });
  if (far.phase === 'turn') far = advanceMotion(far, bounds, far.due, 'normal', false, { x: 99999, y: -50 });
  assert.deepEqual(far.to, { x: 500, y: 0 });
  assert.ok(Math.hypot(far.to.x - 480, far.to.y - 20) <= 144 + 1e-8);
});
