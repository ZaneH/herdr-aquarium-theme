#!/usr/bin/env node
// Source-description benchmark, NOT GPUI/native rendering. No dependencies.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as presentation from '../mods/aquarium/presentation.js';
import { performance } from 'node:perf_hooks';
import { cpus, release, platform } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import * as model from '../mods/aquarium/model.js';
import * as motion from '../mods/aquarium/motion.js';
const source = readFileSync(new URL('../mods/aquarium/main.js', import.meta.url), 'utf8');
let nodes = 0;
// Allocate descriptions and retain children/arguments; never execute event/style callbacks.
function element(kind, args) {
  nodes++;
  const data = { kind, args, items: [], calls: [] };
  let proxy;
  proxy = new Proxy(data, { get(target, key) {
    if (key === 'when') return (yes, fn) => yes ? fn(proxy) : proxy;
    if (key === 'child') return child => { data.items.push(child); return proxy; };
    if (key === 'children') return children => { data.items.push(...children); return proxy; };
    if (key in target) return target[key];
    return (...args) => { data.calls.push([key, args]); return proxy; };
  } });
  return proxy;
}
function fixture(count, nested, free, hidden = false) {
  const school = Array.from({ length: count }, (_, i) => ({ address: `t${i}`, title: `Fish ${i}`, status: ['working', 'idle', 'blocked', 'done'][i % 4], program: { name: 'fixture' }, space_name: 'fixture', tab_name: 'fixture' }));
  // Bounded-depth broods: ten fish each, two generations. No agents are launched.
  const terminals = school.map((a, i) => ({ address: a.address, cwd: '/fixture', parent: nested && i % 10 ? `t${i - (i % 10 > 5 ? 1 : i % 10)}` : null }));
  for (const [i, terminal] of terminals.entries()) Object.assign(terminal, {
    state: 'live', program: { name: 'fixture', agent: true, shell: false },
    status: ['working', 'idle', 'blocked', 'done'][i % 4], name: `Fish ${i}`,
  });
  const listed = hidden ? school.filter((_, i) => i % 10 === 0) : school;
  let now = 10000;
  const pending = new Set();
  const cx = { spawn() {}, notify() {}, timer: { after(delay, callback) {
    const task = { due: now + delay, callback, cancel() { pending.delete(task); } };
    pending.add(task);
    return task;
  } } };
  const factory = kind => (...args) => element(kind, args);
  const widget = kind => ({ new: factory(kind) });
  const Aquarium = runInNewContext(source.replace(/^import .*;\n/gm, '').replace('export default class Aquarium', 'globalThis.Aquarium = class Aquarium') + '\nAquarium;', {
    ...model, ...motion, ...presentation, View: class {}, div: factory('div'), image: factory('image'), h_flex: factory('h_flex'), v_flex: factory('v_flex'),
    ...Object.fromEntries(['Button', 'Switch', 'Radio', 'RadioGroup', 'Popover'].map(k => [k, widget(k)])),
    agents: () => listed, terminals: () => terminals, spaces: () => [], theme: () => ({}), props: () => ({ immersive: false }), focused: () => null,
    shared: key => key === 'aquarium.paused' ? false : key === 'aquarium.free' ? free : undefined,
    setShared() {}, run() {}, appWindow: () => ({ active: true }), window: { viewport_size: () => ({ width: 900, height: 500 }) }, Date: { now: () => now },
  });
  const view = new Aquarium(); view.init({}, cx);
  return { view, cx, listed, school, terminals, pending, render() { nodes = 0; const tree = view.render(cx); return { tree, nodes }; }, tick() {
    let next;
    for (const task of pending) if (!next || task.due < next.due) next = task;
    if (!next) return false;
    pending.delete(next);
    now = next.due;
    next.callback(cx);
    return true;
  } };
}
if (process.argv.includes('--self-check')) {
  const f = fixture(20, true, true, true);
  // A live raw child survives independently after its parent exits/disappears.
  f.terminals.push({ address: 'orphan', parent: 'departed', state: 'live',
    program: { name: 'fixture', agent: true, shell: false }, status: 'working' });
  assert.equal(f.listed.length, 2);
  const result = f.render();
  function fishCount(node) { if (!node || typeof node !== 'object') return 0; return (node.kind === 'Button' && String(node.args[0]).startsWith('fish-') ? 1 : 0) + (node.items ?? []).reduce((n, child) => n + fishCount(child), 0); }
  assert.equal(fishCount(result.tree), 21, 'render must discover 18 hidden children and the raw orphan');
  assert.ok(f.view.motion.has('orphan'), 'orphan must be an independent family');
  assert.equal(f.view.motion.size, 3);
  assert.deepEqual([...f.view.motion.entries()].filter(([, e]) => e.state.phase !== 'parked').map(([a]) => a), ['orphan'], 'blocked descendants must park every fixture family (only the orphan moves)');
  f.view.stopMotion(); assert.equal(f.view.motionDue, Infinity);
  while (f.pending.size) assert.ok(f.tick(), 'parked scene must still drain transient expiry');
  assert.equal(f.pending.size, 0, 'parked scene must leave an empty queue, not a silent scheduler failure');
  const concurrent = fixture(8, false, true);
  concurrent.render(); // Listed t3/t7 are done; working roots also schedule motion.
  const firstExpiry = concurrent.view.shimmers.get('t3');
  const secondExpiry = concurrent.view.shimmers.get('t7');
  assert.ok(concurrent.pending.has(firstExpiry));
  assert.ok(concurrent.pending.has(secondExpiry));
  assert.ok(concurrent.pending.has(concurrent.view.motionTask));
  assert.equal(concurrent.pending.size, 3);
  firstExpiry.cancel();
  assert.ok(concurrent.pending.has(secondExpiry), 'one cancellation must not drop another expiry');
  assert.ok(concurrent.tick(), 'earliest motion deadline must dispatch');
  assert.ok(concurrent.pending.has(secondExpiry), 'motion dispatch must retain expiry');
  concurrent.view.motionTask.cancel();
  assert.equal(concurrent.pending.size, 1, 'motion cancellation must retain only the uncancelled expiry');
  assert.ok(concurrent.tick());
  assert.ok(!concurrent.view.shimmers.has('t7'), 'remaining expiry callback must execute');
  assert.equal(concurrent.tick(), false, 'empty queue must not claim a dispatch');
  concurrent.view.stopMotion();
  const live = fixture(6, false, true); // Flat working/idle roots keep swimming.
  live.render();
  assert.ok([...live.view.motion.values()].some(e => e.state.phase !== 'parked' && Number.isFinite(e.state.due)), 'moving scene must retain active families');
  for (let i = 0; i < 5; i++) assert.ok(live.tick(), 'moving scene must keep dispatching motion');
  assert.ok(live.view.motionTask, 'moving scene must reschedule motion after every dispatch');
  live.view.stopMotion();
  console.log('self-check: hidden descendants/orphan retained; concurrent shimmer and motion deadlines dispatch and cancel independently; parked nested scenes drain transient expiry to an empty queue; moving scenes keep scheduling');
  process.exit(0);
}
const repeats = 7, iterations = 100, warmup = 30;
const measure = fn => Array.from({ length: repeats }, () => { const start = performance.now(); for (let i = 0; i < iterations; i++) fn(); return (performance.now() - start) / iterations; });
const describeIds = tree => { const ids = new Set(); (function walk(node) { if (!node || typeof node !== 'object') return;
  for (const [key, args] of node.calls ?? []) if (key === 'id') ids.add(String(args[0]));
  for (const child of node.items ?? []) walk(child); })(tree); return ids; };
const benchmarkMetadata = (scope, mode) => ({ date: new Date().toISOString(), node: process.version, v8: process.versions.v8, os: `${platform()} ${release()}`, cpu: cpus()[0].model, cores: cpus().length, revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' }).trim(), hashes, repeats, iterations, warmup, size: '900x500', units: 'milliseconds per call', ...(mode ? { mode } : {}), scope });
const hashes = Object.fromEntries(['main', 'model', 'motion', 'presentation'].map(name => [name, createHash('sha256').update(readFileSync(new URL(`../mods/aquarium/${name}.js`, import.meta.url))).digest('hex')]));
// Bounded feed comparison: same synthetic fixture, no-food render versus actual dropFood-driven
// food pellet + feeding halo + goal-directed motion descriptions. Source-only, never native.
if (process.argv.includes('--feed')) {
  console.log(JSON.stringify({ metadata: benchmarkMetadata('Node source descriptions with proxy builders; feed mode compares a no-food baseline render against the same fixture after dropFood, so the delta is the food pellet + feeding halo + feeding-goal motion descriptions only; no native materialization, layout, paint, CPU, GPU or FPS is measured', 'feed: food+feedback versus no food') }));
  for (const count of [2, 5, 10]) {
    const f = fixture(count, false, true); // Ordinary flat free-floating scene.
    for (let i = 0; i < warmup; i++) f.render();
    const baseline = f.render();
    const baselineIds = describeIds(baseline.tree);
    assert.ok(!baselineIds.has('aquarium-food') && !baselineIds.has('aquarium-food-halo'), 'baseline must not render food or halo');
    const baselineQueue = f.pending.size;
    const baselineRender = measure(() => f.render());
    f.view.dropFood(f.cx);
    assert.ok(f.view.food, 'dropFood must place one pellet');
    assert.equal(f.pending.size, baselineQueue + 1, 'feeding must add exactly one expiry task, no per-frame timer');
    assert.ok(f.pending.has(f.view.food.task), 'the single added task must be the food expiry');
    for (let i = 0; i < 3; i++) f.render();
    assert.equal(f.pending.size, baselineQueue + 1, 'repeated food renders must not add timers');
    for (let i = 0; i < warmup; i++) f.render();
    const food = f.render();
    const foodIds = describeIds(food.tree);
    assert.ok(foodIds.has('aquarium-food') && foodIds.has('aquarium-food-halo'), 'feeding render must contain pellet and halo');
    const foodTask = f.view.food.task;
    const foodRender = measure(() => f.render());
    let ticks = 0;
    while (f.view.food) assert.ok(f.tick() && ++ticks < 2000, 'food must expire by dispatching its single timer');
    assert.ok(!f.pending.has(foodTask), 'food expiry must remove its task from the queue');
    const expiredIds = describeIds(f.render().tree);
    assert.ok(!expiredIds.has('aquarium-food') && !expiredIds.has('aquarium-food-halo'), 'expiry must clean up pellet and halo');
    f.view.dropFood(f.cx);
    const secondTask = f.view.food.task;
    assert.ok(f.view.food && f.pending.has(secondTask), 'a second pellet must re-arm one expiry');
    f.view.suspended = true; // Pause/suspension must clear live food without waiting for expiry.
    f.render();
    assert.ok(!f.view.food && !f.pending.has(secondTask), 'suspension must cancel food and its task');
    const pausedIds = describeIds(f.render().tree);
    assert.ok(!pausedIds.has('aquarium-food') && !pausedIds.has('aquarium-food-halo'), 'suspension must remove pellet and halo');
    f.view.stopMotion();
    for (const samples of [baselineRender, foodRender]) for (const sample of samples) assert.ok(Number.isFinite(sample), 'all samples must be finite');
    const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
    console.log(JSON.stringify({ mode: 'feed', count, comparison: 'dropFood-driven food+feedback render versus no-food baseline in the same source fixture; source descriptions only, not native halo/CPU/FPS/GPU', baselineNodes: baseline.nodes, foodNodes: food.nodes, baselineQueue, queueWithFood: baselineQueue + 1, baselineRender, foodRender, baselineMedian: med(baselineRender), foodMedian: med(foodRender), renderDeltaMedian: med(foodRender) - med(baselineRender) }));
  }
  process.exit(0);
}
console.log(JSON.stringify({ metadata: benchmarkMetadata('Node source descriptions with proxy builders; scheduler samples include synthetic queue selection plus dispatched callbacks (including early shimmer expiry); no native materialization, layout, image decode or paint') }));
for (const count of [0, 2, 5, 10, 100, 250]) for (const shape of ['flat', 'nested', 'hidden']) for (const free of [false, true]) {
  const f = fixture(count, shape !== 'flat', free, shape === 'hidden');
  const initial = f.render();
  const fishIds = [];
  const visit = node => { if (!node || typeof node !== 'object') return;
    if (node.kind === 'Button' && String(node.args[0]).startsWith('fish-')) fishIds.push(node.args[0]);
    for (const child of node.items ?? []) visit(child);
  };
  visit(initial.tree);
  assert.equal(new Set(fishIds).size, count, `${shape}: discovery must retain requested fish count`);
  for (let i = 0; i < warmup; i++) f.render();
  const render = measure(() => f.render());
  const discovered = model.schoolAgents(f.listed, f.terminals);
  const discovery = measure(() => model.schoolAgents(f.listed, f.terminals));
  const families = measure(() => model.schoolFamilies(discovered, f.terminals));
  // Skip non-motion cases; never report empty-tick overhead as callback cost.
  const movingFamilies = () => [...f.view.motion.values()].filter(e => e.state.phase !== 'parked' && Number.isFinite(e.state.due)).length;
  let tick = null, schedulerNote;
  if (free && count > 0) {
    if (movingFamilies() > 0) {
      tick = measure(() => assert.ok(f.tick(), 'moving scene must keep dispatching scheduler callbacks'));
    } else {
      // Legitimately parked scene (blocked descendants/done leaders): drain transient expiry, do not time it.
      const transient = f.pending.size;
      while (f.pending.size) assert.ok(f.tick(), 'transient expiry must dispatch');
      assert.equal(movingFamilies(), 0, 'drained scene must have no moving families left');
      schedulerNote = `no persistent moving families (${transient} transient expiry tasks drained)`;
    }
  }
  console.log(JSON.stringify({ count, shape, listed: f.listed.length, discovered: discovered.length, discovery, arrangement: free ? 'free' : 'organized', nodes: f.render().nodes, families: f.view.motion.size, render, grouping: families, scheduler: tick, ...(schedulerNote ? { schedulerNote } : {}) }));
  f.view.stopMotion();
}
