import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as model from '../mods/aquarium/model.js';
import * as presentation from '../mods/aquarium/presentation.js';

// Builder/callback contract check, NOT a native keyboard or layout acceptance test.
const source = readFileSync(new URL('../mods/aquarium/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export default class Aquarium', 'globalThis.Aquarium = class Aquarium');
function fixture(settings = new Map(), immersive = false, viewport = { width: 220, height: 240 }, animationCase = null) {
  let nodes, receive;
  const commands = [];
  function element(type, id) {
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
  }
  const env = {
    ...presentation, View: class {}, agents: () => [], terminals: () => [], theme: () => ({}),
    props: () => ({ immersive, terminal: animationCase?.terminal }), shared: key => settings.get(key),
    run: (name, args) => commands.push([name, args]),
    nextCommand: () => new Promise(resolve => { receive = resolve; }),
    setShared: (key, value) => settings.set(key, value),
    window: { viewport_size: () => viewport }, appWindow: () => ({ active: animationCase?.active ?? true }),
    newCompletions: () => [], schoolAgents: listed => listed, schoolFamilies: () => [], schoolGeometry: () => ({ lane: 200 }),
    surfaceGeometry: () => ({ count: 0 }),
    floatingSchoolGeometry: () => ({ layouts: [], height: 178 }),
  };
  if (animationCase) Object.assign(env, model, {
    agents: () => animationCase.agents, terminals: () => [], focused: () => null,
  });
  for (const name of ['div', 'image', 'h_flex', 'v_flex']) env[name] = asset => {
    const node = element(name);
    if (name === 'image') node.values.asset = asset;
    return node;
  };
  for (const name of ['Button', 'Switch', 'Radio', 'RadioGroup', 'Popover']) env[name] = { new: id => element(name, id) };
  const Aquarium = runInNewContext(`${source}\nAquarium;`, env);
  const view = new Aquarium();
  Object.assign(view, { size: { width: 220, height: 240 }, previous: new Map(), shimmers: new Map(), motion: new Map(), optionsOpen: false });
  view.syncMotion = () => {}; // Scheduler is outside this suite's scope.
  const cx = { notify() {}, timer: { after() { return { cancel() {} }; } } };
  return { view, cx, commands,
    listen() { view.init({}, { spawn(callback) { callback(cx); } }); },
    async deliver(command) { receive(command); await new Promise(resolve => setImmediate(resolve)); },
    allNodes: () => nodes, render() { nodes = []; view.render(cx); return new Map(nodes.filter(n => n.values.id).map(n => [n.values.id, n])); } };
}

test('all Options callbacks write controlled shared preferences, read by fresh layout copies', () => {
  const settings = new Map();
  const f = fixture(settings);
  const cases = [
    ['aquarium-motion', false, 'aquarium.paused', true],
    ['aquarium-bubbles', false, 'aquarium.bubbles', false],
    ['aquarium-water', false, 'aquarium.water', false],
    ['aquarium-arrangement-false', true, 'aquarium.free', false],
    ['aquarium-speed-normal', true, 'aquarium.speed', 'normal'],
    ['aquarium-turning-false', true, 'aquarium.turning', false],
    ['aquarium-motion', true, 'aquarium.paused', false],
    ['aquarium-bubbles', true, 'aquarium.bubbles', true],
    ['aquarium-water', true, 'aquarium.water', true],
    ['aquarium-arrangement-true', true, 'aquarium.free', true],
    ['aquarium-speed-slow', true, 'aquarium.speed', 'slow'],
    ['aquarium-turning-true', true, 'aquarium.turning', true],
  ];
  for (const [id, checked, key, expected] of cases) {
    f.render().get(id).values.on_change(checked, f.cx);
    assert.equal(settings.get(key), expected, id);
    for (const immersive of [false, true]) {
      const copy = fixture(settings, immersive).render();
      assert.equal(copy.get(id).values.checked, checked, `${id}: controlled value in fresh copy`);
    }
  }
});

test('Options keeps native dismissal ownership and nonshrinking rows inside bounded scroll', () => {
  const f = fixture();
  let nodes = f.render();
  const popup = nodes.get('aquarium-options');
  assert.equal(popup.values.open, false);
  assert.equal(nodes.get('aquarium-options-trigger').values.on_click, undefined);
  popup.values.on_open_change(true, f.cx);
  assert.equal(f.render().get('aquarium-options').values.open, true);
  popup.values.on_open_change(false, f.cx);
  nodes = f.render();
  assert.equal(nodes.get('aquarium-options').values.open, false);
  const scroll = nodes.get('aquarium-options-scroll');
  assert.equal(scroll.values.w, 196);
  assert.equal(scroll.values.max_h, 216);
  assert.ok('overflow_y_scrollbar' in scroll.values);
  for (const child of scroll.childNodes) assert.ok('flex_none' in child.values);
  for (const node of nodes.values()) {
    if (node.type === 'RadioGroup') assert.equal(node.values.axis, 'vertical');
    if (node.type === 'Radio' || node.type === 'Switch') {
      assert.ok('flex_none' in node.values);
      assert.ok(node.values.accessibility_label);
    }
  }
});


test('actual tank descriptors use static assets and omit loops when suspended or inactive', () => {
  const agents = ['working', 'blocked', 'done'].map(status => ({
    address: status, status, title: status, program: { name: 'claude', agent: true },
  }));
  for (const state of ['active', 'suspended', 'inactive']) {
    const settings = new Map([['aquarium.paused', false], ['aquarium.free', false]]);
    const f = fixture(settings, true, undefined, { agents, active: state !== 'inactive' });
    f.view.suspended = state === 'suspended';
    // Keep a preexisting shimmer to ensure rendering itself suppresses its loop too.
    f.view.shimmers.set('done', { cancel() {} });
    f.render();
    const nodes = f.allNodes();
    const loops = nodes.filter(n => n.values.loop);
    const assets = nodes.filter(n => n.type === 'image').map(n => n.values.asset);
    if (state === 'active') {
      assert.ok(loops.some(n => n.values.id === 'surface-wave'));
      const art = nodes.find(n => n.values.id === 'art-blocked');
      assert.ok(art.values.transition);
      assert.equal(art.values.opacity, 1);
      assert.ok(!loops.some(n => n.values.id === 'art-blocked'));
      assert.ok(loops.some(n => n.values.id === 'attention-blocked'));
      assert.ok(assets.some(a => /bubbles-.*\.webp$/.test(a)));
      assert.ok(assets.some(a => /-swim\.webp$/.test(a)));
    } else {
      assert.equal(loops.length, 0, state);
      assert.ok(assets.some(a => /bubbles-.*\.png$/.test(a)));
      assert.ok(assets.every(a => !a.endsWith('.webp')), state);
    }
    assert.equal(settings.get('aquarium.paused'), false);
  }
});


test('fish hover callbacks ignore late exits from another fish and retain click/focus without label cards', () => {
  const agents = ['first', 'second'].map(address => ({
    address, status: 'working', title: address, program: { name: 'Pi', agent: true },
  }));
  const f = fixture(new Map([['aquarium.free', false]]), false, undefined, { agents });
  const nodes = f.render();
  const first = nodes.get('fish-first');
  const second = nodes.get('fish-second');
  first.values.on_hover(true, f.cx);
  assert.equal(f.view.hovered, 'first');
  second.values.on_hover(true, f.cx);
  first.values.on_hover(false, f.cx);
  assert.equal(f.view.hovered, 'second');
  second.values.on_hover(false, f.cx);
  assert.equal(f.view.hovered, null);
  for (const fish of [first, second]) {
    assert.equal(fish.values.hover, undefined);
    assert.equal(fish.values.rounded, undefined);
    assert.equal(typeof fish.values.focus, 'function');
    assert.ok(fish.values.accessibility_label);
    assert.ok(fish.childNodes.slice(1).every(label => label.values.bg === undefined));
  }
  first.values.on_click();
  assert.equal(f.commands[0][0], 'agent.focus');
  assert.equal(f.commands[0][1].terminal, 'first');
});

test('layout-switch callbacks suspend source then request target resume in order', async () => {
  const workspace = fixture(new Map(), false);
  const immersive = fixture(new Map(), true);
  workspace.listen();
  immersive.listen();
  // Dispatch delivery is conditional here: verify listener behavior if host delivers
  // to selected target, NOT host native command ordering/copy selection.
  for (const [source, target, name] of [
    [workspace, immersive, 'aquarium-immersive'],
    [immersive, workspace, 'aquarium'],
    [workspace, immersive, 'aquarium-immersive'],
  ]) {
    source.commands.length = 0;
    source.render().get('aquarium-mode').values.on_click();
    assert.equal(source.view.suspended, true);
    assert.equal(source.commands[0][0], 'layout.switch');
    assert.equal(source.commands[0][1].name, name);
    assert.equal(source.commands[1][0], 'aquarium.resume');
    assert.equal(source.commands.length, 2);
    await target.deliver('resume');
    assert.equal(target.view.suspended, false);
    assert.equal(source.view.suspended, true);
  }
  const nav = fixture(new Map(), false, undefined, { agents: [], terminal: true });
  nav.listen();
  nav.render().get('back-to-workspace').values.on_click();
  assert.equal(nav.view.suspended, true);
  assert.equal(nav.commands[0][0], 'layout.switch');
  assert.equal(nav.commands[0][1].name, 'aquarium');
  assert.equal(nav.commands[1][0], 'aquarium.resume');
  assert.equal(nav.commands.length, 2);
  await workspace.deliver('resume');
  assert.equal(workspace.view.suspended, false);
});
