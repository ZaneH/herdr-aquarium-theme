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
        const expected = ['clownfish', 'blue_tang', 'koi', 'largemouth_bass', 'rainbow_trout', 'sockeye_salmon', 'piranha', 'swordfish', 'bluefin_tuna', 'channel_catfish', 'anglerfish'].includes(species) && ['working', 'idle'].includes(status)
          ? `${species}-tail-${m.face}.webp`
          : `${species}${m.face === 'left' ? '-left' : ''}${status === 'done' ? '-gold' : ''}.png`;
        assert.equal(asset, expected);
      }
    }
    assert.equal(directions.size, 2);
  }
  assert.equal(species.size, 25);
});

// Render-level facing mount regression: source description counts, not native paint.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as model from '../mods/aquarium/model.js';
import { fishPresentation, familyNeedsAttention } from '../mods/aquarium/presentation.js';

const mainSource = readFileSync(new URL('../mods/aquarium/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export default class Aquarium', 'globalThis.Aquarium = class Aquarium');

function renderFixture({ paused = false, active = true, suspended = false, turning = true, agents }) {
  let nodes = [];
  const element = (type, id) => {
    const values = { id }, children = [];
    const node = new Proxy({ type, values, childNodes: children }, { get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        if (key === 'child') children.push(args[0]);
        else if (key === 'children') children.push(...args[0]);
        else if (key === 'when') { if (args[0]) args[1](node); }
        else values[key] = args.length === 1 ? args[0] : args;
        return node;
      };
    } });
    nodes.push(node);
    return node;
  };
  const cx = { notify() {}, timer: { after() { return { cancel() {} }; } } };
  const Aquarium = runInNewContext(`${mainSource}\nAquarium;`, {
    ...model, parkMotion, startMotion, advanceMotion, positionAt,
    fishPresentation, familyNeedsAttention, View: class {}, agents: () => agents, terminals: () => [], spaces: () => [],
    theme: () => ({}), props: () => ({}), focused: () => null,
    shared: key => key === 'aquarium.paused' ? paused : key === 'aquarium.turning' ? turning : undefined,
    setShared() {}, run() {}, nextCommand: () => new Promise(() => {}),
    appWindow: () => ({ active }), window: { viewport_size: () => ({ width: 900, height: 500 }) },
    div: () => element('div'), image: asset => { const n = element('image'); n.values.asset = `${asset}`; return n; },
    h_flex: () => element('h_flex'), v_flex: () => element('v_flex'),
    ...Object.fromEntries(['Button', 'Switch', 'Radio', 'RadioGroup', 'Popover'].map(k => [k, { new: id => element(k, id) }])),
  });
  const view = new Aquarium();
  Object.assign(view, { size: { width: 900, height: 500 }, motion: new Map(), motionDue: Infinity,
    motionGeneration: 0, previous: new Map(), shimmers: new Map(), food: null, suspended });
  const render = () => { nodes = []; view.render(cx); return nodes; };
  render();
  return { view, cx, render };
}

function posesFor(nodes, view, address) {
  const version = view.motion.get(address)?.version;
  const pose = nodes.find(n => n.type === 'div' && n.values.id === `pose-${address}-${version}`);
  assert.ok(pose, `pose element for ${address}`);
  return pose.childNodes.map(img => ({ asset: `${img.values.asset}`, opacity: img.values.opacity }));
}

const flatAgents = statuses => statuses.map((status, i) => ({
  address: `t${i}`, status, title: `T${i}`, program: { name: 'fixture', agent: true },
}));

test('free fish mount both facings while animating, one selected image when parked', () => {
  const agents = flatAgents(['working', 'idle', 'blocked', 'done']);
  // Animating (active window, not paused): both facings mounted, exactly one visible.
  for (const turning of [true, false]) {
    const f = renderFixture({ agents, turning });
    for (const a of agents) {
      const mine = posesFor(f.render(), f.view, a.address);
      assert.equal(mine.length, 2, `turning=${turning}: two facing images mounted for ${a.address}`);
      const face = f.view.motion.get(a.address).state.face;
      const expected = ['right', 'left'].map(facing => `mods/aquarium/assets/${fishAsset(a, false, turning, a.address, true, facing)}`);
      assert.deepEqual(mine.map(p => p.asset).sort(), expected.sort(), `turning=${turning}: both reviewed facings for ${a.address}`);
      assert.equal(mine.filter(p => p.opacity === 1).length, 1, `turning=${turning}: one visible facing for ${a.address}`);
      assert.equal(mine.find(p => p.opacity === 1).asset, `mods/aquarium/assets/${fishAsset(a, false, turning, a.address, true, face)}`,
        `turning=${turning}: selected facing matches motion face for ${a.address}`);
    }
  }
  // Parked states cannot reverse facing, so exactly one selected image is mounted.
  for (const parked of [{ paused: true }, { active: false }, { suspended: true }]) {
    const f = renderFixture({ agents, ...parked });
    for (const a of agents) {
      const entry = f.view.motion.get(a.address);
      const face = entry.state.face;
      const mine = posesFor(f.render(), f.view, a.address);
      assert.equal(mine.length, 1, `${JSON.stringify(parked)}: one image per parked fish ${a.address}`);
      assert.equal(mine[0].opacity, 1, `${JSON.stringify(parked)}: parked image is the selected facing`);
      assert.equal(mine[0].asset, `mods/aquarium/assets/${fishAsset(a, true, true, a.address, true, face)}`,
        `${JSON.stringify(parked)}: ${a.address} keeps its selected static facing`);
    }
  }
});

test('selected facing follows motion reversals and fade phases with both facings mounted', () => {
  const agents = flatAgents(['working']);
  const f = renderFixture({ agents });
  const entry = f.view.motion.get('t0');
  let state = entry.state;
  const seen = new Set();
  for (let step = 0; step < 200; step++) {
    state = advanceMotion(state, entry.geometry, state.due, 'slow', true);
    entry.state = state;
    seen.add(state.face);
    const mine = posesFor(f.render(), f.view, 't0');
    assert.equal(mine.length, 2, `phase ${state.phase}: both facings stay mounted across reversals`);
    assert.equal(mine.filter(p => p.opacity === 1).length, 1, `phase ${state.phase}: exactly one selected facing`);
    assert.equal(mine.find(p => p.opacity === 1).asset, `mods/aquarium/assets/${fishAsset(agents[0], false, true, 't0', true, state.face)}`,
      `phase ${state.phase}: selected facing follows the motion face through fade-out/fade-in`);
  }
  assert.deepEqual([...seen].sort(), ['left', 'right'], 'reversals in both directions covered');
});
