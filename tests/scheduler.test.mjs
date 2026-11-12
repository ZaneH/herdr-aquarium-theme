import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as motion from '../mods/aquarium/motion.js';
import * as presentation from '../mods/aquarium/presentation.js';
import { newCompletions } from '../mods/aquarium/model.js';

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
    View: class {}, ...motion, ...presentation, newCompletions, Date: { now: () => clock.now },
    appWindow: () => clock.missingWindow ? null : ({ active: clock.active }),
  });
  const view = new Aquarium();
  Object.assign(view, { motion: new Map(), motionDue: Infinity, motionGeneration: 0,
    previous: new Map(), shimmers: new Map() });
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

test('hovering a child parks only its family at its current point; leaving resumes from there', () => {
  const f = fixture();
  const members = [{ ...families[0], children: [{ agent: { address: 'child' } }] },
    { leader: { address: 'other', status: 'working' }, layout: { ...g, seed: 44 } }];
  f.sync(true, members);
  f.fire(250);
  f.clock.now = 4250;
  const before = f.view.motion.get('parent').state;
  const expected = motion.positionAt(before, f.clock.now);
  f.view.hovered = 'child';
  f.sync(true, members);
  const held = f.view.motion.get('parent').state;
  assert.equal(held.phase, 'parked');
  assert.deepEqual(held.from, expected);
  assert.deepEqual(held.to, expected);
  assert.equal(held.face, before.face);
  assert.equal(f.view.motion.get('other').state.phase, 'moving');
  // Other families keep their scheduler; its next wake cannot move the held family.
  f.fire(8450);
  assert.equal(f.view.motion.get('parent').state, held);
  f.view.hovered = null;
  f.sync(true, members);
  const resumed = f.view.motion.get('parent').state;
  assert.equal(resumed.phase, 'ready');
  assert.deepEqual(resumed.from, expected);
  assert.equal(resumed.face, held.face);
});

test('leader hover cancels its only deadline; leaving never overrides pause or blocked state', () => {
  const f = fixture();
  f.sync();
  f.fire(250);
  const pending = f.tasks.at(-1);
  f.clock.now = 1000;
  f.view.hovered = 'parent';
  f.sync();
  assert.ok(pending.cancelled);
  assert.equal(f.view.motionDue, Infinity);
  const held = f.view.motion.get('parent').state;
  f.fire(99999, pending);
  assert.equal(f.view.motion.get('parent').state, held);
  f.view.hovered = null;
  f.sync(false);
  assert.equal(f.view.motion.get('parent').state.phase, 'parked');
  f.sync(true, [{ ...families[0], leader: { address: 'parent', status: 'blocked' } }]);
  assert.equal(f.view.motion.get('parent').state.phase, 'parked');
  assert.equal(f.view.motionDue, Infinity);
});

test('a blocked descendant holds its working family; resolving attention resumes unless hovered', () => {
  const f = fixture();
  const child = { address: 'child', status: 'working' };
  const members = [{ ...families[0], children: [{ agent: child, depth: 2 }] }];
  f.sync(true, members);
  f.fire(250);
  f.clock.now = 1000;
  const expected = motion.positionAt(f.view.motion.get('parent').state, f.clock.now);
  child.status = 'blocked';
  f.sync(true, members);
  assert.equal(f.view.motion.get('parent').state.phase, 'parked');
  assert.deepEqual(f.view.motion.get('parent').state.to, expected);
  child.status = 'working';
  f.view.hovered = 'child';
  f.sync(true, members);
  assert.equal(f.view.motion.get('parent').state.phase, 'parked');
  f.view.hovered = null;
  f.sync(true, members);
  assert.equal(f.view.motion.get('parent').state.phase, 'ready');
  assert.deepEqual(f.view.motion.get('parent').state.from, expected);
});

test('open species picker holds only its captured family and closing respects pause', () => {
  const f = fixture();
  f.sync();
  f.fire(250);
  f.view.pickerTarget = { address: 'parent', key: 'verified-choice' };
  f.clock.now = 1000;
  f.sync();
  assert.equal(f.view.motion.get('parent').state.phase, 'parked');
  f.view.pickerTarget = null;
  f.sync(false);
  assert.equal(f.view.motion.get('parent').state.phase, 'parked');
  f.sync();
  assert.equal(f.view.motion.get('parent').state.phase, 'ready');
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
  f.view.pickerTarget = { address: 'parent', key: 'verified-choice' };
  await f.view.close();
  assert.equal(f.view.pickerTarget, null);
  assert.ok(resumed.cancelled);
  assert.equal(f.view.motionDue, Infinity);
  const notifications = f.cx.notifications;
  f.fire(99999, resumed);
  assert.equal(f.cx.notifications, notifications);
});

test('departing oversized family re-primes a reassigned band from the interpolated local point', () => {
  const f = fixture();
  // Two oversized families can still move horizontally within their own bands.
  const local = { ...g, height: 1000, maxY: 0, y: 0 };
  const first = { leader: { address: 'first', status: 'working' }, layout: { ...local, top: 0 } };
  const second = { leader: { address: 'second', status: 'working' }, layout: { ...local, top: 1008 } };
  f.sync(true, [first, second]);
  f.fire(250);
  const before = f.view.motion.get('second');
  assert.equal(before.state.phase, 'moving');
  const stale = f.tasks.at(-1);
  f.clock.now = 4250;
  const expected = motion.positionAt(before.state, f.clock.now);
  assert.notDeepEqual(expected, before.state.to);
  f.sync(true, [{ ...second, layout: { ...local, top: 0 } }]);
  const after = f.view.motion.get('second');
  assert.equal(f.view.motion.size, 1);
  assert.equal(after.state.phase, 'ready');
  assert.deepEqual(after.state.from, expected);
  assert.deepEqual(after.state.to, expected);
  assert.equal(after.version, before.version + 1);
  assert.equal(after.geometry.top, 0);
  assert.ok(stale.cancelled);
  const notifications = f.cx.notifications;
  f.fire(99999, stale);
  assert.equal(f.view.motion.get('second'), after);
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

test('absent native window is inactive during timer dispatch and reconciliation', () => {
  const f = fixture();
  f.sync();
  f.clock.missingWindow = true;
  f.fire(250);
  f.sync();
  assert.equal(f.view.motion.get('parent').state.phase, 'parked');
  assert.equal(f.view.motionDue, Infinity);
  f.view.syncCompletions([{ address: 'child', status: 'done' }], false, f.cx);
  assert.equal(f.view.shimmers.size, 0);
  f.clock.missingWindow = false;
  f.sync();
  assert.equal(f.view.motion.get('parent').state.phase, 'ready');
});

test('suspension is a scheduler invariant, including stale callbacks and attempted resync', () => {
  const f = fixture();
  f.sync();
  f.fire(250);
  const pending = f.tasks.at(-1);
  f.view.suspended = true;
  f.view.stopMotion(); // immersive fish-open path, before layout.select
  f.sync(); // enabled=true cannot override terminal-open suspension
  assert.ok(pending.cancelled);
  assert.equal(f.view.motion.get('parent').state.phase, 'parked');
  assert.equal(f.view.motionDue, Infinity);
  const notifications = f.cx.notifications;
  f.fire(99999, pending);
  assert.equal(f.cx.notifications, notifications);
  assert.equal(f.tasks.length, 2);
  f.view.suspended = false; // resume command delivered to tank copy
  f.sync();
  assert.equal(f.tasks.length, 3);
  assert.equal(f.view.motion.get('parent').state.phase, 'ready');
});

test('inactive render cannot restart scheduling and close is terminal', async () => {
  const f = fixture();
  f.clock.active = false;
  f.sync();
  assert.equal(f.tasks.length, 0);
  assert.equal(f.view.motion.get('parent').state.phase, 'parked');
  f.clock.active = true;
  f.sync();
  const pending = f.tasks.at(-1);
  await f.view.close();
  const notifications = f.cx.notifications;
  f.sync();
  f.view.scheduleMotion(f.cx);
  f.fire(99999, pending);
  assert.equal(f.tasks.length, 1);
  assert.equal(f.cx.notifications, notifications);
  assert.equal(f.view.motionDue, Infinity);
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


test('completion expiry cancels on departure, restart, pause and close; stale callbacks stay inert', async () => {
  const f = fixture();
  const sync = (status, paused = false) => f.view.syncCompletions(
    status ? [{ address: 'child', status }] : [], paused, f.cx);
  sync('working');
  sync('done');
  const first = f.tasks.at(-1);
  assert.equal(first.delay, 3000);
  sync('done');
  assert.equal(f.tasks.length, 1);
  sync('working');
  assert.ok(first.cancelled);
  sync('done');
  const second = f.tasks.at(-1);
  f.fire(3000, first);
  assert.equal(f.cx.notifications, 0);
  assert.equal(f.view.shimmers.get('child'), second);
  sync(null);
  assert.ok(second.cancelled);
  sync('done');
  const third = f.tasks.at(-1);
  sync('done', true);
  assert.ok(third.cancelled);
  sync('done');
  assert.equal(f.view.shimmers.size, 0);
  sync('working');
  sync('done');
  const last = f.tasks.at(-1);
  await f.view.close();
  assert.ok(last.cancelled);
  f.fire(6000, last);
  assert.equal(f.cx.notifications, 0);
  assert.equal(f.view.shimmers.size, 0);
});

test('completion expiry removes only its current shimmer and notifies once', () => {
  const f = fixture();
  f.view.syncCompletions([{ address: 'child', status: 'done' }], false, f.cx);
  const task = f.tasks.at(-1);
  f.fire(3000, task);
  f.fire(3001, task);
  assert.equal(f.view.shimmers.size, 0);
  assert.equal(f.cx.notifications, 1);
});


test('explicit suspension cancels expiry and hidden reconciliation cannot recreate it', () => {
  const f = fixture();
  const school = status => [{ address: 'child', status }];
  f.view.syncCompletions(school('done'), false, f.cx);
  const old = f.tasks.at(-1);
  // Same lifecycle sequence used before immersive select and layout-switch navigation.
  f.view.suspended = true;
  f.view.stopMotion();
  assert.ok(old.cancelled);
  f.view.syncCompletions(school('working'), false, f.cx);
  f.view.syncCompletions(school('done'), false, f.cx);
  assert.equal(f.tasks.length, 1);
  assert.equal(f.view.shimmers.size, 0);
  f.fire(3000, old);
  assert.equal(f.cx.notifications, 0);
  f.view.suspended = false;
  f.view.syncCompletions(school('done'), false, f.cx);
  assert.equal(f.tasks.length, 1); // no replay of a hidden completion
  f.view.syncCompletions(school('working'), false, f.cx);
  f.view.syncCompletions(school('done'), false, f.cx);
  assert.equal(f.tasks.length, 2);
});

test('inactive window reconciliation cancels expiry and consumes completions without replay', () => {
  const f = fixture();
  const school = status => [{ address: 'child', status }];
  f.view.syncCompletions(school('done'), false, f.cx);
  const old = f.tasks.at(-1);
  f.clock.active = false;
  f.view.syncCompletions(school('done'), false, f.cx);
  assert.ok(old.cancelled);
  f.view.syncCompletions(school('working'), false, f.cx);
  f.view.syncCompletions(school('done'), false, f.cx);
  f.fire(3000, old);
  assert.equal(f.cx.notifications, 0);
  f.clock.active = true;
  f.view.syncCompletions(school('done'), false, f.cx);
  assert.equal(f.tasks.length, 1);
  assert.equal(f.view.shimmers.size, 0);
});
