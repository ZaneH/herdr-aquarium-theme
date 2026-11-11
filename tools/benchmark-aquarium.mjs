#!/usr/bin/env node
// Source-description benchmark, NOT GPUI/native rendering. No dependencies.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
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
function fixture(count, nested, free) {
  const school = Array.from({ length: count }, (_, i) => ({ address: `t${i}`, title: `Fish ${i}`, status: ['working', 'idle', 'blocked', 'done'][i % 4], program: { name: 'fixture' }, space_name: 'fixture', tab_name: 'fixture' }));
  // Bounded-depth broods: ten fish each, two generations. No agents are launched.
  const terminals = school.map((a, i) => ({ address: a.address, cwd: '/fixture', parent: nested && i % 10 ? `t${i - (i % 10 > 5 ? 1 : i % 10)}` : null }));
  let now = 10000, pending;
  const cx = { spawn() {}, notify() {}, timer: { after(delay, callback) { const task = { delay, callback, cancel() { if (pending === task) pending = null; } }; pending = task; return task; } } };
  const factory = kind => (...args) => element(kind, args);
  const widget = kind => ({ new: factory(kind) });
  const Aquarium = runInNewContext(source.replace(/^import .*;\n/gm, '').replace('export default class Aquarium', 'globalThis.Aquarium = class Aquarium') + '\nAquarium;', {
    ...model, ...motion, View: class {}, div: factory('div'), image: factory('image'), h_flex: factory('h_flex'), v_flex: factory('v_flex'),
    ...Object.fromEntries(['Button', 'Switch', 'Radio', 'RadioGroup', 'Popover'].map(k => [k, widget(k)])),
    agents: () => school, terminals: () => terminals, theme: () => ({}), props: () => ({ immersive: false }), focused: () => null,
    shared: key => key === 'aquarium.paused' ? false : key === 'aquarium.free' ? free : undefined,
    setShared() {}, run() {}, appWindow: () => ({ active: true }), window: { viewport_size: () => ({ width: 900, height: 500 }) }, Date: { now: () => now },
  });
  const view = new Aquarium(); view.init({}, cx);
  return { view, cx, school, terminals, render() { nodes = 0; const tree = view.render(cx); return { tree, nodes }; }, tick() { if (pending) { now += pending.delay; const task = pending; pending = null; task.callback(cx); } } };
}
if (process.argv.includes('--self-check')) {
  const f = fixture(20, true, true);
  const result = f.render();
  function fishCount(node) { if (!node || typeof node !== 'object') return 0; return (node.kind === 'Button' && String(node.args[0]).startsWith('fish-') ? 1 : 0) + (node.items ?? []).reduce((n, child) => n + fishCount(child), 0); }
  assert.equal(fishCount(result.tree), 20);
  assert.equal(f.view.motion.size, model.schoolFamilies(f.school, f.terminals).length);
  f.tick(); f.view.stopMotion(); assert.equal(f.view.motionDue, Infinity);
  console.log('self-check: 20 fish retained, family scheduler populated and cancelled');
  process.exit(0);
}
const repeats = 7, iterations = 100, warmup = 30;
const hashes = Object.fromEntries(['main', 'model', 'motion'].map(name => [name, createHash('sha256').update(readFileSync(new URL(`../mods/aquarium/${name}.js`, import.meta.url))).digest('hex')]));
console.log(JSON.stringify({ metadata: { date: new Date().toISOString(), node: process.version, v8: process.versions.v8, os: `${platform()} ${release()}`, cpu: cpus()[0].model, cores: cpus().length, revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), hashes, repeats, iterations, warmup, size: '900x500', units: 'milliseconds per call', scope: 'Node source descriptions with proxy builders; no native materialization, layout, image decode or paint' } }));
for (const count of [0, 100, 250]) for (const nested of [false, true]) for (const free of [false, true]) {
  const f = fixture(count, nested, free);
  for (let i = 0; i < warmup; i++) f.render();
  const measure = fn => Array.from({ length: repeats }, () => { const start = performance.now(); for (let i = 0; i < iterations; i++) fn(); return (performance.now() - start) / iterations; });
  const render = measure(() => f.render());
  const families = measure(() => model.schoolFamilies(f.school, f.terminals));
  const tick = measure(() => f.tick());
  console.log(JSON.stringify({ count, shape: nested ? 'nested' : 'flat', arrangement: free ? 'free' : 'organized', nodes: f.render().nodes, families: f.view.motion.size, render, grouping: families, scheduler: tick }));
  f.view.stopMotion();
}
