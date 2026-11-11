import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as motion from '../mods/aquarium/motion.js';

// Exercise the actual view scheduler without starting GPUI or its command listener.
const source = readFileSync(new URL('../mods/aquarium/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export default class Aquarium', 'globalThis.Aquarium = class Aquarium');
const g = { seed: 42, x: 20, y: 80, maxX: 500, maxY: 300, width: 156, height: 178 };
const families = [{ leader: { address: 'parent', status: 'working' }, layout: g }];

function fixture() {
  const clock = { now: 0, active: true };
  const tasks = [];
  const cx = { notifications: 0, notify() { this.notifications++; }, timer: {
    after(delay, callback) {
      const task = { delay, callback, cancelled: false, cancel() { this.cancelled = true; } };
      tasks.push(task);
      return task;
    },
  } };
  const Aquarium = runInNewContext(`${source}\nAquarium;`, {
    View: class {}, ...motion, Date: { now: () => clock.now },
    appWindow: () => ({ active: clock.active }),
  });
  const view = new Aquarium();
  Object.assign(view, { motion: new Map(), motionDue: Infinity, motionGeneration: 0 });
  const sync = (enabled = true, members = families) => view.syncMotion(members, enabled, 'slow', true, cx);
  const fire = (now, task = tasks.at(-1)) => { clock.now = now; task.callback(cx); };
  return { clock, tasks, cx, view, sync, fire };
}

test('one deadline serves all families; late callbacks advance only one phase', () => {
  const f = fixture();
  const members = [...families, { leader: { address: 'other', status: 'idle' }, layout: { ...g, seed: 43 } }];
  f.sync(true, members);
  f.sync(true, members);
  assert.equal(f.tasks.length, 1);
  const before = [...f.view.motion.values()].map(entry => entry.state);
  f.fire(100000);
  assert.equal(f.tasks.length, 2);
  for (const [i, entry] of [...f.view.motion.values()].entries()) {
    assert.deepEqual(entry.state, motion.advanceMotion(before[i], entry.geometry, 100000, 'slow', true));
    assert.ok(entry.state.due > 100000);
  }
});

test('pause freezes position and makes a cancelled callback inert', () => {
  const f = fixture();
  f.sync();
  f.fire(250);
  const entry = f.view.motion.get('parent');
  assert.equal(entry.state.phase, 'moving');
  const oldTask = f.tasks.at(-1);
  f.clock.now = 4250;
  const expected = motion.positionAt(entry.state, f.clock.now);
  f.sync(false);
  assert.ok(oldTask.cancelled);
  assert.deepEqual(f.view.motion.get('parent').state.from, expected);
  assert.equal(f.view.motionDue, Infinity);
  const notifications = f.cx.notifications;
  f.fire(99999, oldTask);
  assert.equal(f.cx.notifications, notifications);
  assert.equal(f.view.motion.get('parent').state.phase, 'parked');
});

test('resize clamps the baseline; departed families and close cancel pending work', async () => {
  const f = fixture();
  f.sync();
  const initial = f.tasks.at(-1);
  f.clock.now = 10;
  f.sync(true, [{ ...families[0], layout: { ...g, maxX: 5, maxY: 6 } }]);
  assert.ok(initial.cancelled);
  assert.deepEqual(f.view.motion.get('parent').state.from, { x: 5, y: 6 });
  const resized = f.tasks.at(-1);
  f.sync(true, []);
  assert.ok(resized.cancelled);
  assert.equal(f.view.motion.size, 0);
  f.sync();
  const resumed = f.tasks.at(-1);
  await f.view.close();
  assert.ok(resumed.cancelled);
  assert.equal(f.view.motionDue, Infinity);
  const notifications = f.cx.notifications;
  f.fire(99999, resumed);
  assert.equal(f.cx.notifications, notifications);
});

test('inactive window parks without a replacement task, then can restart', () => {
  const f = fixture();
  f.sync();
  f.clock.active = false;
  f.fire(250);
  assert.equal(f.tasks.length, 1);
  assert.equal(f.view.motion.get('parent').state.phase, 'parked');
  assert.equal(f.view.motionDue, Infinity);
  f.clock.active = true;
  f.sync();
  assert.equal(f.tasks.length, 2);
  assert.equal(f.view.motion.get('parent').state.phase, 'ready');
});

test('speed/turn changes re-prime from the current point; blocked/done leaders park', () => {
  const f = fixture();
  f.sync();
  f.fire(250);
  const previous = f.view.motion.get('parent').state;
  f.clock.now = 1250;
  f.view.syncMotion(families, true, 'normal', false, f.cx);
  const entry = f.view.motion.get('parent');
  assert.deepEqual(entry.state.from, motion.positionAt(previous, f.clock.now));
  assert.equal(entry.state.face, previous.face);
  assert.equal(entry.state.phase, 'ready');
  assert.equal(entry.speed, 'normal');
  assert.equal(entry.soft, false);
  for (const status of ['blocked', 'done']) {
    f.sync(true, [{ ...families[0], leader: { ...families[0].leader, status } }]);
    assert.equal(f.view.motion.get('parent').state.phase, 'parked');
    assert.equal(f.view.motionDue, Infinity);
    assert.equal(f.view.motionTask, null);
  }
});
