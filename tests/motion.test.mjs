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

// Independent overlap measure: sample the actual rendered positions of each
// leg and sum rectangle overlap with a neighbor rect inflated by 8 px.
const tank = { seed: 3, x: 0, y: 60, maxX: 600, maxY: 400, width: 156, height: 178, top: 0 };
const neighbor = { address: 'neighbor', x0: 120, y0: 40, x1: 276, y1: 218 };

function trajectory(obstacles, steps = 12) {
  let m = startMotion(tank, null, 0);
  const legs = [];
  for (let i = 0; i < steps; i++) {
    m = advanceMotion(m, tank, m.due, 'slow', true, null, obstacles);
    if (m.phase === 'moving') legs.push(m);
  }
  return legs;
}

function measuredOverlap(legs) {
  let total = 0;
  for (const leg of legs) for (let s = 0; s <= 8; s++) {
    const p = positionAt(leg, leg.started + leg.duration * s / 8);
    const w = Math.min(p.x + tank.width, neighbor.x1 + 8) - Math.max(p.x, neighbor.x0 - 8);
    const h = Math.min(p.y + tank.height, neighbor.y1 + 8) - Math.max(p.y, neighbor.y0 - 8);
    if (w > 0 && h > 0) total += w * h;
  }
  return total;
}

test('soft spacing keeps the exact baseline with no or far obstacles', () => {
  const far = [{ address: 'far', x0: 5000, y0: 5000, x1: 5100, y1: 5100 }];
  for (const speed of ['slow', 'normal']) for (const soft of [false, true]) {
    let plain = startMotion(tank, null, 0), spaced = startMotion(tank, null, 0);
    let empty = startMotion(tank, null, 0);
    for (let i = 0; i < 60; i++) {
      const now = plain.due;
      plain = advanceMotion(plain, tank, now, speed, soft);
      spaced = advanceMotion(spaced, tank, now, speed, soft, null, far);
      empty = advanceMotion(empty, tank, now, speed, soft, null, []);
      assert.deepEqual(spaced, plain);
      assert.deepEqual(empty, plain);
    }
  }
});

test('a crowded leg picks a measured better heading and stays deterministic', () => {
  const base = trajectory([]);
  const spaced = trajectory([neighbor]);
  assert.ok(measuredOverlap([spaced[0]]) < measuredOverlap([base[0]]),
    'less sampled overlap on the same first-leg duration, independent of later turn counts');
  assert.ok(measuredOverlap(spaced) / spaced.length < measuredOverlap(base) / base.length,
    'less mean sampled overlap per moving leg than baseline');
  assert.ok(spaced.some((leg, i) => leg.phase === 'moving' &&
    (base[i].to.x !== leg.to.x || base[i].to.y !== leg.to.y)), 'some leg deviates from baseline');
  assert.deepEqual(trajectory([neighbor]), spaced, 'same obstacles, same trajectory');
});

test('food goals steer exactly as before even with obstacles present', () => {
  const goal = { x: 260, y: 120 };
  let m = startMotion(tank, null, 0);
  for (let i = 0; i < 25; i++) {
    const now = m.due;
    const plain = advanceMotion(m, tank, now, 'slow', true, goal);
    assert.deepEqual(advanceMotion(m, tank, now, 'slow', true, goal, [neighbor]), plain);
    m = plain;
  }
});

test('an unavoidable obstacle keeps the baseline leg and never stalls', () => {
  const wall = [{ address: 'wall', x0: -2000, y0: -2000, x1: 3000, y1: 3000 }];
  let base = startMotion(tank, null, 0), crowded = startMotion(tank, null, 0);
  for (let i = 0; i < 12; i++) {
    const now = base.due;
    base = advanceMotion(base, tank, now, 'normal', false);
    crowded = advanceMotion(crowded, tank, now, 'normal', false, null, wall);
    assert.deepEqual(crowded, base);
    assert.ok(crowded.due > now);
  }
});

test('soft-spaced legs keep bounds, facing and turn phases at both speeds', () => {
  for (const speed of ['slow', 'normal']) for (const soft of [false, true]) {
    let m = startMotion(tank, null, 0);
    let legs = 0;
    for (let i = 0; i < 150; i++) {
      const old = m;
      m = advanceMotion(m, tank, m.due, speed, soft, null, [neighbor]);
      if (m.phase === 'moving') {
        legs++;
        const dx = m.to.x - m.from.x, dy = m.to.y - m.from.y;
        assert.ok(m.from.x >= -1e-9 && m.from.x <= tank.maxX + 1e-9 && m.from.y >= -1e-9 && m.from.y <= tank.maxY + 1e-9);
        assert.ok(m.to.x >= -1e-9 && m.to.x <= tank.maxX + 1e-9 && m.to.y >= -1e-9 && m.to.y <= tank.maxY + 1e-9);
        assert.equal(m.face, dx > 0 ? 'right' : dx < 0 ? 'left' : old.face);
        if (dx || dy) assert.ok(Math.abs(m.heading - Math.atan2(dy, dx)) < 1e-10);
        assert.equal(m.duration, speed === 'slow' ? 8000 : 6000);
        assert.ok(Math.hypot(dx, dy) <= (speed === 'slow' ? 96 : 144) + 1e-8);
      }
      if (m.face !== old.face) {
        assert.deepEqual(m.from, m.to);
        assert.ok(soft ? old.phase === 'fade-out' && old.opacity === 0 : m.phase === 'turn');
      }
    }
    assert.ok(legs > 30);
  }
});
