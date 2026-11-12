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
    agents: () => listed, terminals: () => terminals, theme: () => ({}), props: () => ({ immersive: false }), focused: () => null,
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
  f.tick(); f.view.stopMotion(); assert.equal(f.view.motionDue, Infinity);
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
  console.log('self-check: hidden descendants/orphan retained; concurrent shimmer and motion deadlines dispatch and cancel independently');
  process.exit(0);
}
const repeats = 7, iterations = 100, warmup = 30;
const hashes = Object.fromEntries(['main', 'model', 'motion'].map(name => [name, createHash('sha256').update(readFileSync(new URL(`../mods/aquarium/${name}.js`, import.meta.url))).digest('hex')]));
console.log(JSON.stringify({ metadata: { date: new Date().toISOString(), node: process.version, v8: process.versions.v8, os: `${platform()} ${release()}`, cpu: cpus()[0].model, cores: cpus().length, revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' }).trim(), hashes, repeats, iterations, warmup, size: '900x500', units: 'milliseconds per call', scope: 'Node source descriptions with proxy builders; scheduler samples include synthetic queue selection plus dispatched callbacks (including early shimmer expiry); no native materialization, layout, image decode or paint' } }));
for (const count of [0, 100, 250]) for (const shape of ['flat', 'nested', 'hidden']) for (const free of [false, true]) {
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
  const measure = fn => Array.from({ length: repeats }, () => { const start = performance.now(); for (let i = 0; i < iterations; i++) fn(); return (performance.now() - start) / iterations; });
  const render = measure(() => f.render());
  const discovered = model.schoolAgents(f.listed, f.terminals);
  const discovery = measure(() => model.schoolAgents(f.listed, f.terminals));
  const families = measure(() => model.schoolFamilies(discovered, f.terminals));
  // Skip non-motion cases; never report empty tick overhead as callback cost.
  const tick = free && count > 0 ? measure(() => assert.ok(f.tick(), 'scheduler sample requires a dispatched callback')) : null;
  console.log(JSON.stringify({ count, shape, listed: f.listed.length, discovered: discovered.length, discovery, arrangement: free ? 'free' : 'organized', nodes: f.render().nodes, families: f.view.motion.size, render, grouping: families, scheduler: tick }));
  f.view.stopMotion();
}
