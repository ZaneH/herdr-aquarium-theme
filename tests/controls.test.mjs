import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as model from '../mods/aquarium/model.js';
import * as presentation from '../mods/aquarium/presentation.js';
import * as motion from '../mods/aquarium/motion.js';

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
    ...model, ...presentation, ...motion, spaces: () => animationCase?.spaces || [],
    View: class {}, agents: () => [], terminals: () => [], theme: () => ({}),
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
    agents: () => animationCase.agents, terminals: () => animationCase.terminals || [], focused: () => null,
  });
  for (const name of ['div', 'image', 'h_flex', 'v_flex']) env[name] = asset => {
    const node = element(name);
    if (name === 'image') node.values.asset = asset;
    return node;
  };
  for (const name of ['Button', 'Switch', 'Radio', 'RadioGroup', 'Popover']) env[name] = { new: id => element(name, id) };
  const nameState = { text: '', set_value(next) { this.text = String(next); }, value() { return this.text; },
    submitHandlers: [], on(event, handler) { if (event === 'submit') this.submitHandlers.push(handler); return true; } };
  env.InputState = { new: () => nameState };
  env.Input = { new: () => element('Input') };
  const Aquarium = runInNewContext(`${source}\nAquarium;`, env);
  const view = new Aquarium();
  Object.assign(view, { size: { width: 220, height: 240 }, previous: new Map(), shimmers: new Map(), motion: new Map(), food: null, optionsOpen: false });
  view.syncMotion = () => {}; // Scheduler is outside this suite's scope.
  view.stopMotion = () => { view.clearFood(); }; // Feed state only; motion work belongs to the scheduler suite.
  const cx = { notify() {}, bind_keys: () => 1, timer: { after() { return { cancel() {} }; } } };
  return { view, cx, commands, nameState,
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
    ['aquarium-projects', false, 'aquarium.projects', false],
    ['aquarium-arrangement-false', true, 'aquarium.free', false],
    ['aquarium-speed-normal', true, 'aquarium.speed', 'normal'],
    ['aquarium-turning-false', true, 'aquarium.turning', false],
    ['aquarium-motion', true, 'aquarium.paused', false],
    ['aquarium-bubbles', true, 'aquarium.bubbles', true],
    ['aquarium-water', true, 'aquarium.water', true],
    ['aquarium-projects', true, 'aquarium.projects', true],
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
    // Keep preexisting food to ensure the pellet and its feedback ripple drop together.
    f.view.food = { x: 40, y: 40 };
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
      assert.ok(!nodes.some(n => n.values.id === 'aquarium-food-halo'), state);
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


test('picker is stationary, bounded, lazy, and closes mutually with Options', () => {
  const data = { agents: [{ address: 't1', space: 's1', status: 'idle', title: 'A', program: { name: 'Pi' } }],
    spaces: [{ id: 's1', machine: null }] };
  const f = fixture(new Map([['aquarium.free', false]]), false, { width: 220, height: 240 }, data);
  let nodes = f.render();
  const controls = nodes.get('aquarium-controls');
  assert.ok('absolute' in controls.values && 'flex_wrap' in controls.values);
  const subtreeIds = node => [node?.values?.id, ...(node?.childNodes || []).flatMap(subtreeIds)];
  assert.ok(!subtreeIds(nodes.get('school-scroll')).includes('aquarium-fish-picker'));
  assert.ok(subtreeIds(controls).includes('aquarium-fish-picker'));
  controls.values.on_size_change({ width: 186, height: 64 }, f.cx);
  nodes = f.render();
  assert.equal(nodes.get('school-scroll').values.top, 84);
  assert.equal(nodes.get('aquarium-fish-picker-scroll').values.w, 196);
  assert.equal(nodes.get('aquarium-fish-picker-scroll').values.max_h, 216);
  nodes.get('aquarium-options').values.on_open_change(true, f.cx);
  nodes.get('aquarium-fish-picker').values.on_open_change(true, f.cx);
  assert.equal(f.view.optionsOpen, false);
  nodes = f.render();
  // Page 0 may hold only Automatic in a short viewport, so staleness uses the always-present first row.
  const staleChoice = nodes.get('aquarium-fish-choice-automatic').values.on_change;
  nodes.get('aquarium-options').values.on_open_change(true, f.cx);
  assert.equal(f.view.pickerTarget, null);
  staleChoice(true);
  assert.equal(f.render().get('aquarium-fish-species').childNodes.length, 0);
  // Inactivity also clears a picker when no motion deadline exists to notice it.
  f.view.pickerTarget = { address: 't1', key: model.familyChoiceKey(data.agents[0], data.spaces), title: 'A' };
  data.active = false;
  assert.equal(f.render().get('aquarium-fish-picker').values.open, false);
  assert.equal(f.view.pickerTarget, null);
});

test('fish picker persists validated family choices and captures intended target', () => {
  const program = { name: 'Pi' };
  const a = { address: 't1', space: 's1', title: 'A', status: 'idle', program };
  const b = { ...a, address: 't2', space: 'remote/s1', title: 'B' };
  const child = { ...a, address: 'child' };
  const data = { agents: [a, b, child], terminals: [{ address: 'child', parent: 't1' }],
    spaces: [{ id: 's1', machine: null }, { id: 'remote/s1', machine: 'remote' }] };
  const settings = new Map([['aquarium.free', false]]);
  const f = fixture(settings, false, undefined, data);
  let nodes = f.render();
  assert.equal(settings.size, 1, 'render never writes');
  assert.equal(f.allNodes().filter(n => n.values.id === 'aquarium-fish-picker').length, 1);
  assert.equal(nodes.get('aquarium-fish-species').childNodes.length, 0, 'closed picker builds no preview rows');
  nodes.get('fish-t1').values.on_hover(true, f.cx);
  nodes.get('fish-t1').values.on_hover(false, f.cx);
  nodes = f.render();
  nodes.get('aquarium-fish-picker').values.on_open_change(true, f.cx);
  f.view.hovered = 't2';
  nodes = f.render();
  const pageRows = nodes.get('aquarium-fish-species').childNodes.length;
  assert.ok(pageRows > 0 && pageRows < 26, 'picker shows one bounded page, not every species at once');
  // Regression: native scrolling inside the Popover never established itself, so
  // the picker pages its choices. Every direct child of the bounded area is a
  // nonshrinking plain element, and Prev/Next must reach every species.
  const scroll = nodes.get('aquarium-fish-picker-scroll');
  assert.ok('overflow_y_scrollbar' in scroll.values);
  for (const child of scroll.childNodes) {
    assert.ok(['div', 'v_flex', 'h_flex'].includes(child.type), `no component may sit directly in the scroll area (${child.type})`);
    assert.ok('flex_none' in child.values, 'every direct child must be nonshrinking');
  }
  const group = scroll.childNodes.find(c => c.childNodes.some(g => g?.values?.id === 'aquarium-fish-species'));
  assert.ok(group, 'species group sits inside a nonshrinking plain wrapper');
  const pageCount = Math.ceil(26 / pageRows);
  assert.match(String(nodes.get('aquarium-fish-page').childNodes[0]), /Page 1 of /);
  const seen = [];
  let current = f.render();
  for (let page = 0; page < pageCount; page++) {
    for (const radio of current.get('aquarium-fish-species').childNodes) seen.push(radio.values.id);
    if (page < pageCount - 1) { current.get('aquarium-fish-next').values.on_click({}, f.cx); current = f.render(); }
  }
  assert.equal(seen.length, 26, 'every page adds its rows exactly once');
  for (const species of ['automatic', ...model.SPECIES])
    assert.ok(seen.includes(`aquarium-fish-choice-${species}`), `${species} reachable by paging`);
  assert.equal(f.view.pickerPage, pageCount - 1, 'Next stops on the last page');
  assert.equal(f.render().get('aquarium-fish-next').values.disabled, true);
  assert.equal(f.render().get('aquarium-fish-prev').values.disabled, false);
  assert.ok(f.render().get('aquarium-fish-choice-clownfish') === undefined, 'last page omits earlier rows');
  // Selecting on a late page persists, and reopening lands on the selection's page.
  f.view.pickerPage = pageCount - 1;
  const last = f.render();
  assert.ok(last.get('aquarium-fish-choice-silver_arowana'), 'final species present on the last page');
  last.get('aquarium-fish-choice-silver_arowana').values.on_change(true);
  assert.equal(settings.get(model.familyChoiceKey(a, data.spaces)), 'silver_arowana');
  // Clownfish lives on its own page when a short viewport gives one row per page.
  const clownfishPage = Math.floor((1 + model.SPECIES.indexOf('clownfish')) / pageRows);
  f.view.pickerPage = clownfishPage;
  nodes = f.render();
  nodes.get('aquarium-fish-choice-clownfish').values.on_change(true);
  const key = model.familyChoiceKey(a, data.spaces);
  assert.equal(settings.get(key), 'clownfish');
  assert.equal(settings.has(model.familyChoiceKey(b, data.spaces)), false);
  const copy = fixture(settings, false, undefined, data);
  nodes = copy.render();
  for (const address of ['t1', 'child']) {
    const fish = nodes.get(`fish-${address}`);
    const assets = [];
    const walk = n => { if (n?.values?.asset) assets.push(n.values.asset); for (const c of n?.childNodes || []) walk(c); };
    walk(fish);
    assert.ok(assets.some(asset => asset.includes('/clownfish.png')), address);
  }
  nodes.get('aquarium-fish-picker').values.on_open_change(true, copy.cx);
  assert.equal(copy.render().get('aquarium-fish-choice-clownfish').values.checked, true);
  settings.set(key, 'not-a-fish');
  // An unknown saved value falls back to Automatic on its own always-present first page.
  copy.view.pickerPage = 0;
  assert.equal(copy.render().get('aquarium-fish-choice-automatic').values.checked, true);
  assert.equal(model.fishAsset(a, true, false, a.address, false, 'right', 'bad'), model.fishAsset(a, true, false));
  copy.render().get('aquarium-fish-choice-automatic').values.on_change(true);
  assert.equal(settings.get(key), null);
  assert.equal(model.familyChoiceKey({ ...a, space: 'missing' }, data.spaces), null);
  assert.notEqual(key, model.familyChoiceKey({ ...a, space: b.space }, data.spaces));
  assert.notEqual(key, model.familyChoiceKey({ ...a, address: 'another' }, data.spaces));
});

test('fish names: deterministic defaults, rename persists, empty restores the default', () => {
  const program = { name: 'Pi' };
  const a = { address: 't1', space: 's1', title: 'A', status: 'idle', program };
  const child = { ...a, address: 'child' };
  const data = { agents: [a, child], terminals: [{ address: 'child', parent: 't1' }],
    spaces: [{ id: 's1', machine: null }] };
  const settings = new Map([['aquarium.free', false]]);
  const f = fixture(settings, false, undefined, data);
  f.listen();
  const label = nodes => {
    const fish = nodes.get('fish-t1');
    const walk = n => { for (const c of n?.childNodes || []) { if (typeof c === 'string') return c; const found = walk(c); if (found !== undefined) return found; } };
    return walk(fish);
  };
  // Default name is deterministic and stable across renders, never the agent title.
  const first = label(f.render());
  assert.equal(first, model.defaultName('t1'));
  assert.equal(label(f.render()), first);
  assert.notEqual(first, 'A');
  // Agent identity stays in details behind the personal name.
  const fish = f.render().get('fish-t1');
  assert.ok(fish.values.accessibility_label.startsWith(`${first}, Resting.`));
  assert.ok(fish.values.accessibility_label.includes('Agent: A'));
  assert.ok(fish.values.tooltip.includes('Agent: A'));
  // Rename through the picker: opening seeds the input, Enter persists, label updates.
  f.render().get('aquarium-fish-picker').values.on_open_change(true, f.cx);
  assert.equal(f.nameState.text, first);
  assert.ok(f.render().get('aquarium-fish-name'));
  f.nameState.text = '  Greg   Jr  ';
  for (const handler of f.nameState.submitHandlers) handler();
  const key = model.fishNameKey(a, data.spaces);
  assert.equal(settings.get(key), 'Greg Jr');
  assert.equal(label(f.render()), 'Greg Jr');
  // Survives a fresh view copy (reload/restart), and does not touch the child or species keys.
  const copy = fixture(settings, false, undefined, data);
  assert.equal(label(copy.render()), 'Greg Jr');
  assert.equal(settings.has(model.fishNameKey(child, data.spaces)), false);
  assert.equal(settings.has(model.familyChoiceKey(a, data.spaces)), false);
  // Species change does not disturb the name; long input is truncated at the boundary.
  settings.set(model.familyChoiceKey(a, data.spaces), 'clownfish');
  assert.equal(label(f.render()), 'Greg Jr');
  f.nameState.text = 'x'.repeat(80);
  for (const handler of f.nameState.submitHandlers) handler();
  assert.equal(settings.get(key), 'x'.repeat(24));
  // Empty submit clears the custom name and restores the deterministic default.
  f.nameState.text = '   ';
  for (const handler of f.nameState.submitHandlers) handler();
  assert.equal(settings.get(key), '');
  assert.equal(label(f.render()), first);
  // A closed picker keeps its scroll children plain and nonshrinking, name row included.
  const nodes = f.render();
  nodes.get('aquarium-fish-picker').values.on_open_change(true, f.cx);
  const scroll = f.render().get('aquarium-fish-picker-scroll');
  for (const row of scroll.childNodes) {
    assert.ok(['div', 'v_flex', 'h_flex'].includes(row.type), row.type);
    assert.ok('flex_none' in row.values);
  }
  assert.ok(f.render().get('aquarium-fish-name'));
});

test('picker renames the inspected child: only the child, species stays leader, reopen retargets', () => {
  const program = { name: 'Pi' };
  const a = { address: 't1', space: 's1', title: 'A', status: 'idle', program };
  const child = { ...a, address: 'child' };
  const data = { agents: [a, child], terminals: [{ address: 't1' }, { address: 'child', parent: 't1' }],
    spaces: [{ id: 's1', machine: null }] };
  const settings = new Map([['aquarium.free', false]]);
  const f = fixture(settings, false, undefined, data);
  f.listen();
  const label = address => {
    const fish = f.render().get(`fish-${address}`);
    const walk = n => { for (const c of n?.childNodes || []) { if (typeof c === 'string') return c; const found = walk(c); if (found !== undefined) return found; } };
    return walk(fish);
  };
  // Inspect the child (as hover does), then open: the rename targets the child.
  f.view.inspected = 'child';
  f.render().get('aquarium-fish-picker').values.on_open_change(true, f.cx);
  assert.equal(f.nameState.text, model.defaultName('child'));
  // Hover/render changes after opening do not retarget the capture.
  f.view.inspected = 't1';
  f.render();
  f.nameState.text = 'Nemo Jr';
  for (const handler of f.nameState.submitHandlers) handler();
  assert.equal(settings.get(model.fishNameKey(child, data.spaces)), 'Nemo Jr');
  assert.equal(settings.has(model.fishNameKey(a, data.spaces)), false, 'leader name untouched');
  assert.equal(label('child'), '↳ Nemo Jr');
  assert.equal(label('t1'), model.defaultName('t1'), 'leader keeps its default');
  // Species stays family-leader scoped while a child is inspected.
  f.view.inspected = 'child';
  f.render().get('aquarium-fish-picker').values.on_open_change(true, f.cx);
  const rows = f.render().get('aquarium-fish-species').childNodes.length;
  f.view.pickerPage = Math.floor(1 / rows);
  f.render().get('aquarium-fish-choice-clownfish').values.on_change();
  assert.equal(settings.get(model.familyChoiceKey(a, data.spaces)), 'clownfish');
  assert.equal(settings.has(model.familyChoiceKey(child, data.spaces)), false, 'no child species key');
  // Closing and reopening after inspecting the leader targets the leader.
  f.render().get('aquarium-fish-picker').values.on_open_change(false, f.cx);
  f.view.inspected = 't1';
  f.render().get('aquarium-fish-picker').values.on_open_change(true, f.cx);
  assert.equal(f.nameState.text, model.defaultName('t1'));
  f.nameState.text = 'Greg';
  for (const handler of f.nameState.submitHandlers) handler();
  assert.equal(settings.get(model.fishNameKey(a, data.spaces)), 'Greg');
  assert.equal(settings.get(model.fishNameKey(child, data.spaces)), 'Nemo Jr', 'child name survives');
});

test('Feed is a bounded cosmetic control: disabled when not swimming, one pellet, keyboard action', async () => {
  const f = fixture();
  f.listen();
  f.render();
  // Fresh install: motion off by default, Feed disabled with an explaining label.
  const idle = f.render();
  assert.equal(idle.get('aquarium-feed').values.disabled, true);
  assert.match(idle.get('aquarium-feed').values.accessibility_label, /free-floating motion/);
  assert.equal(idle.has('aquarium-food'), false);
  // Motion enabled: feed drops one bounded pellet; a second feed is ignored.
  const settings = new Map([['aquarium.paused', false], ['aquarium.free', true]]);
  const on = fixture(settings);
  on.listen();
  await on.deliver('feed');
  assert.ok(on.view.food && on.view.food.x > 0 && on.view.food.y > 0);
  const food = on.view.food;
  await on.deliver('feed');
  assert.strictEqual(on.view.food, food);
  const rendered = on.render();
  // In-panel confirmation: label changes and the control rests while food is active.
  assert.equal(rendered.get('aquarium-feed').values.disabled, true);
  assert.equal(rendered.get('aquarium-feed').childNodes[0], 'Feeding…');
  assert.equal(rendered.get('aquarium-food').values.left, food.x - 4);
  // Feed feedback: a halo pulse rides the pellet and both share its lifetime.
  const halo = rendered.get('aquarium-food-halo');
  assert.deepEqual([halo.values.loop[0], halo.values.loop[1].from, halo.values.loop[1].to,
    halo.values.loop[1].period], ['opacity', 0, 0.5, 1800]);
  assert.equal(halo.values.left, food.x - 16);
  // Disabled reason is discoverable from the control itself.
  assert.match(idle.get('aquarium-feed').values.tooltip, /Options/);
  assert.match(idle.get('aquarium-feed').values.tooltip, /free-floating/i);
  // Keyboard action handler and key binding reach the same bounded drop.
  const bound = on.render().get('aquarium-root');
  bound.values.on_action[1]({ action: 'aquarium.feed' }, on.cx);
  assert.strictEqual(on.view.food, food);
  // Pause clears the pellet and Feed returns to disabled.
  settings.set('aquarium.paused', true);
  on.render();
  assert.equal(on.view.food, null);
  assert.equal(on.render().get('aquarium-feed').values.disabled, true);
  assert.equal(on.render().has('aquarium-food'), false);
  assert.equal(on.render().has('aquarium-food-halo'), false);
  // Navigation suspends the effect the same way: no food, no halo.
  const awake = fixture(new Map([['aquarium.paused', false], ['aquarium.free', true]]));
  awake.listen();
  await awake.deliver('feed');
  assert.ok(awake.view.food);
  awake.view.suspended = true;
  awake.render();
  assert.equal(awake.view.food, null);
  assert.equal(awake.render().has('aquarium-food-halo'), false);
});

test('food feedback paints above the family that reaches the target', () => {
  // A fish at the deterministic pellet position used to cover it; the pellet and
  // its halo must be the last children of the free-swimming layer.
  const fish = {
    address: "agent", status: "running", title: "agent",
    program: { name: "Pi", agent: true }, space: "space",
  };
  const terminal = { address: "agent", state: "live", parent: null, status: "working",
    program: { name: "Pi", agent: true, shell: false } };
  const f = fixture(new Map([["aquarium.paused", false], ["aquarium.free", true]]),
    false, { width: 500, height: 400 }, { agents: [fish], terminals: [terminal] });
  f.view.size = { width: 500, height: 400 };
  f.view.dropFood(f.cx);
  assert.ok(f.view.food);
  // The scheduler suite owns live motion; render needs one entry for this family.
  f.view.motion.set("agent", { version: 1, state: { to: { x: 10, y: 10 }, phase: "parked", duration: 0 } });
  f.render();
  const layer = f.allNodes().find(node => node.childNodes.some(child => child.values?.id === "aquarium-food"));
  assert.ok(layer, "food has a parent layer");
  const ids = layer.childNodes.map(child => child.values?.id);
  const family = ids.findIndex(id => id?.startsWith("family-"));
  assert.ok(family >= 0, "a family is present");
  assert.ok(ids.indexOf("aquarium-food-halo") > family, "halo is above the family");
  assert.ok(ids.indexOf("aquarium-food") > family, "pellet is above the family");
});

test('project labels default on, persist off across fresh layouts, and never reset motion or fish choices', () => {
  const leader = { address: 't1', space: 's1', status: 'working', title: 'Agent title', program: { name: 'Pi', agent: true } };
  const project = 'A very long real project '.repeat(20);
  const data = { agents: [leader], spaces: [{ id: 's1', machine: null, name: project }], terminals: [] };
  for (const free of [true, false]) for (const immersive of [true, false]) {
    const nameKey = model.fishNameKey(leader, data.spaces);
    const speciesKey = model.familyChoiceKey(leader, data.spaces);
    const settings = new Map([['aquarium.free', free], ['aquarium.paused', false], [nameKey, 'Greg'], [speciesKey, 'clownfish']]);
    const before = [...settings];
    const f = fixture(settings, immersive, undefined, data);
    f.view.size = { width: 900, height: 500 };
    delete f.view.syncMotion; // Use the production scheduler to detect accidental restarts.
    f.view.inspected = 't1';
    let nodes = f.render();
    const entry = f.view.motion.get('t1');
    const fish = nodes.get('fish-t1');
    assert.deepEqual([...settings], before, 'default-on render never writes');
    assert.equal(nodes.get('aquarium-projects').values.checked, true);
    assert.equal(nodes.get('aquarium-projects').values.accessibility_label, 'Show project names');
    assert.equal(nodes.get('project-t1').childNodes[0], project.trim());
    assert.equal(fish.childNodes[1].childNodes[1].childNodes[0], 'Greg', 'personal name remains primary');
    assert.equal(fish.childNodes.at(-1).childNodes[0], 'Working', 'status remains visible');
    assert.ok(fish.values.tooltip.includes(`Project: ${project.trim()}`));
    assert.ok(fish.values.accessibility_label.includes(`Project: ${project.trim()}`));
    nodes.get('aquarium-projects').values.on_change(false);
    nodes = f.render();
    assert.equal(nodes.get('project-t1').childNodes[0], '');
    assert.equal(nodes.get('fish-t1').values.h, fish.values.h, 'toggle never changes the target');
    assert.equal(f.view.motion.get('t1'), entry, 'same scheduler entry/state, no re-prime');
    assert.equal(f.view.inspected, 't1');
    assert.equal(nodes.get('fish-t1').values.tooltip, fish.values.tooltip, 'details ignore visibility');
    assert.equal(nodes.get('fish-t1').values.accessibility_label, fish.values.accessibility_label);
    assert.ok(f.allNodes().some(n => n.childNodes.some(c => typeof c === 'string' && c.includes(`Project: ${project.trim()}`))), 'details strip retains project');
    assert.deepEqual([...settings], [...before, ['aquarium.projects', false]], 'only requested preference changes');
    const copy = fixture(settings, immersive, undefined, data);
    delete copy.view.syncMotion;
    const fresh = copy.render();
    assert.equal(fresh.get('aquarium-projects').values.checked, false, 'explicit off survives fresh view');
    assert.equal(fresh.get('project-t1').childNodes[0], '');
    assert.equal(fresh.get('fish-t1').childNodes[1].childNodes[1].childNodes[0], 'Greg');
    nodes.get('aquarium-projects').values.on_change(true);
    assert.equal(f.render().get('project-t1').childNodes[0], project.trim());
    assert.equal(f.view.motion.get('t1'), entry);
  }
});

test('actual project rows resolve children truthfully and stay within narrow/organized/free targets', () => {
  const program = { name: 'Pi', agent: true, shell: false };
  const leader = { address: 't1', space: 's1', title: 'Agent title is not a project', status: 'blocked', program };
  const raw = (address, parent, extra = {}) => ({ address, parent, state: 'live', status: 'blocked', program, ...extra });
  const data = { agents: [leader], spaces: [{ id: 's1', machine: null, name: 'Actual project' },
    { id: 'remote/s1', machine: 'remote', name: 'Remote project' }], terminals: [
    raw('child', 't1'), raw('nested', 'child'), raw('elsewhere', 't1', { cwd: '/work/other-project/' }),
    raw('remote/own', 't1', { labels: { 'herdr.space': 's1' } }), raw('remote/unknown', 't1'),
    raw('orphan', 'missing'), raw('unavailable', 't1', { labels: { 'herdr.space': 'missing' } }),
  ] };
  for (const free of [true, false]) for (const width of [136, 300, 900]) {
    const f = fixture(new Map([['aquarium.free', free]]), false, undefined, data);
    f.view.size = { width, height: 500 };
    delete f.view.syncMotion;
    const nodes = f.render();
    for (const [address, expected] of Object.entries({ t1: 'Actual project', child: 'Actual project', nested: 'Actual project',
      elsewhere: 'other-project', 'remote/own': 'Remote project', 'remote/unknown': '', orphan: '', unavailable: '' })) {
      const row = nodes.get(`project-${address}`);
      const fish = nodes.get(`fish-${address}`);
      assert.equal(row.childNodes[0], expected, address);
      assert.ok(row.values.w <= fish.values.w - 12, 'bounded within existing hit width');
      assert.ok('truncate' in row.values && 'flex_none' in row.values);
      assert.equal(row.values.h, 14);
      assert.equal(row.values.line_height, 14);
      assert.equal(row.values.text_size, 11);
      assert.equal(row.values.font_semibold, undefined, 'project is quieter than personal name');
      const art = fish.childNodes[0];
      const artBottom = art.values.top + art.values.h;
      const labelHeight = fish.childNodes.slice(1).reduce((sum, n) => sum + n.values.h, 0);
      assert.ok(artBottom + labelHeight + 9 + 2 <= fish.values.h, 'three rows clear even blocked artwork');
      assert.ok(!fish.values.tooltip.includes('undefined'));
    }
  }
});

test('night lighting defaults off; its Options switch persists only aquarium.night', () => {
  const settings = new Map();
  const fresh = fixture(settings);
  const nodes = fresh.render();
  assert.equal(settings.size, 0, 'render never writes');
  assert.equal(nodes.has('aquarium-night-overlay'), false, 'default install has no night overlay');
  const nightSwitch = nodes.get('aquarium-night');
  assert.equal(nightSwitch.values.checked, false);
  assert.equal(nightSwitch.values.accessibility_label, 'Night lighting');
  nightSwitch.values.on_change(true, fresh.cx);
  assert.deepEqual([...settings], [['aquarium.night', true]], 'the switch writes only aquarium.night');
  for (const immersive of [false, true]) {
    const copy = fixture(settings, immersive).render();
    assert.equal(copy.get('aquarium-night').values.checked, true, `${immersive}: fresh copy reads persisted value`);
    assert.ok(copy.has('aquarium-night-overlay'), `${immersive}: overlay present`);
  }
  // Turning it off restores the day view, independent of Animate aquarium.
  nightSwitch.values.on_change(false, fresh.cx);
  const off = fixture(settings).render();
  assert.equal(settings.get('aquarium.night'), false);
  assert.equal(off.has('aquarium-night-overlay'), false, 'off restores day habitat');
});

test('night overlay is static, noninteractive, and paints below waves, families and food', () => {
  const fish = { address: 'agent', status: 'working', title: 'agent',
    program: { name: 'Pi', agent: true }, space: 'space' };
  const terminal = { address: 'agent', state: 'live', parent: null, status: 'working',
    program: { name: 'Pi', agent: true, shell: false } };
  const settings = new Map([['aquarium.night', true], ['aquarium.free', true], ['aquarium.paused', false]]);
  const f = fixture(settings, false, { width: 500, height: 400 }, { agents: [fish], terminals: [terminal] });
  f.view.size = { width: 500, height: 400 };
  f.view.dropFood(f.cx);
  f.view.motion.set('agent', { version: 1, state: { to: { x: 10, y: 10 }, phase: 'parked', duration: 0 } });
  const nodes = f.render();
  const overlay = nodes.get('aquarium-night-overlay');
  assert.ok(overlay, 'overlay node exists when night is on');
  assert.equal(overlay.values.bg, '#061f35');
  assert.equal(overlay.values.opacity, 0.72);
  assert.ok('absolute' in overlay.values, 'overlay is positioned, filling the tank');
  for (const key of ['on_click', 'on_hover', 'on_action', 'accessibility_label', 'tab_index'])
    assert.equal(overlay.values[key], undefined, `overlay is decorative: no ${key}`);
  assert.equal(overlay.values.transition, undefined, 'no fade or timers on the overlay');
  const layer = f.allNodes().find(node => node.childNodes.some(child => child.values?.id === 'aquarium-night-overlay'));
  const ids = layer.childNodes.map(child => child.values?.id);
  const overlayAt = ids.indexOf('aquarium-night-overlay');
  assert.equal(overlayAt, 0, 'overlay is the first child of the tank layer');
  assert.ok(overlayAt < ids.indexOf('surface-wave'), 'below surface waves');
  assert.ok(overlayAt < ids.indexOf('school-scroll'), 'below the family/food school');
  assert.ok(nodes.has('aquarium-food'), 'the ordering check includes an actual pellet');
  assert.ok(nodes.has('aquarium-food-halo'), 'food feedback remains present above the tint');
});

test('night switches all real label rows to moonlit ink; art, status and controls stay day', () => {
  const fish = { address: 't1', status: 'working', title: 'A',
    program: { name: 'Pi', agent: true }, space: 's1' };
  const terminal = { address: 't1', state: 'live', parent: null, status: 'working',
    program: { name: 'Pi', agent: true, shell: false } };
  const data = { agents: [fish], terminals: [terminal] };
  for (const [night, ink] of [[true, '#d8f0ed'], [false, '#0a2028']]) {
    // Night ink applies with Animate off too: night lighting is independent of motion.
    const settings = new Map([['aquarium.paused', true], ['aquarium.free', false], ['aquarium.night', night]]);
    const f = fixture(settings, false, undefined, data);
    const nodes = f.render();
    assert.equal(nodes.has('aquarium-night-overlay'), night, `overlay only when night (${night})`);
    const fishButton = nodes.get('fish-t1');
    const [nameRow, projectRow, statusRow] = fishButton.childNodes.slice(1);
    assert.equal(projectRow.values.text_color, night ? '#bddbd9' : '#0c242c', 'subtler project ink');
    assert.equal(nameRow.values.text_color, ink, 'name row ink');
    assert.equal(statusRow.values.text_color, ink, 'status row ink');
    // Keep status semantics, but adapt the fish focus ring to the darker habitat.
    let focusColor;
    fishButton.values.focus({ border_color(color) { focusColor = color; return this; } });
    assert.equal(focusColor, night ? ink : '#173b46', 'focus ring contrasts with the current lighting');
    assert.equal(nameRow.childNodes[0].values.bg, '#b7efdb', 'status dot keeps day working color');
    const art = fishButton.childNodes[0];
    const assets = [];
    const walk = n => { if (n?.values?.asset) assets.push(n.values.asset); for (const c of n?.childNodes || []) walk(c); };
    walk(art);
    assert.deepEqual(assets, [`mods/aquarium/assets/${model.fishAsset(fish, true, true)}`], 'artwork is unchanged by lighting');
    for (const id of ['aquarium-options-trigger', 'aquarium-feed']) {
      const control = nodes.get(id);
      assert.notEqual(control.values.text_color, '#d8f0ed', `${id} keeps native control color`);
    }
  }
});

test('night lighting keeps empty-tank guidance readable', () => {
  const f = fixture(new Map([['aquarium.night', true]]), false, undefined, { agents: [], terminals: [] });
  f.render();
  for (const text of ['A little quiet in here.', 'Start an agent from the + menu in Workspace. Its fish will appear here.']) {
    const line = f.allNodes().find(node => node.childNodes.includes(text));
    assert.ok(line, `empty-tank guidance exists: ${text}`);
    assert.equal(line.values.text_color, '#d8f0ed');
  }
});

test('picker preview follows the choice with honest motion labels and full gating', () => {
  const program = { name: 'Pi' };
  const leader = { address: 't1', space: 's1', title: 'A', status: 'working', program };
  const child = { ...leader, address: 'child' };
  const data = { agents: [leader, child], terminals: [{ address: 'child', parent: 't1' }],
    spaces: [{ id: 's1', machine: null }] };
  const key = model.familyChoiceKey(leader, data.spaces);
  // A child opening the picker still previews the inherited family choice.
  const preview = (settings, viewState = {}) => {
    const f = fixture(settings, false, undefined, { ...data, active: viewState.active ?? true });
    Object.assign(f.view, viewState);
    // The scheduler suite owns live motion; render needs one entry for this family.
    f.view.motion.set('t1', { version: 1, state: { to: { x: 0, y: 0 }, face: 'right', opacity: 1, phase: 'parked', due: Infinity } });
    f.view.pickerTarget = { address: 't1', key, title: 'A' };
    const nodes = f.render();
    const block = nodes.get('aquarium-fish-preview');
    const art = nodes.get('aquarium-fish-preview-art');
    const name = block?.childNodes[1].childNodes[0].childNodes[0];
    const note = block?.childNodes[1].childNodes[1].childNodes[0];
    return { f, nodes, asset: art?.values.asset, name, note };
  };
  const moving = [['aquarium.paused', false], ['aquarium.free', true]];

  // Explicit animated species animates only under full free-floating motion gating.
  const animated = preview(new Map([...moving, [key, 'clownfish']]));
  assert.equal(animated.asset, `${'mods/aquarium/assets'}/clownfish-tail-right.webp`);
  assert.equal(animated.note, 'Swim animation');
  assert.equal(animated.name, 'Clownfish');
  // The resolved asset is exactly what the shared helper yields for the leader.
  assert.equal(animated.asset,
    `mods/aquarium/assets/${model.fishAsset(leader, false, true, 't1', true, 'right', 'clownfish')}`);

  // The eel body wave previews under the same helper and gating, generic note.
  const eel = preview(new Map([...moving, [key, 'moray_eel']]));
  assert.equal(eel.asset, 'mods/aquarium/assets/moray_eel-body-right.webp');
  assert.equal(eel.note, 'Swim animation');
  assert.equal(eel.asset,
    `mods/aquarium/assets/${model.fishAsset(leader, false, true, 't1', true, 'right', 'moray_eel')}`);
  for (const status of ['blocked', 'done']) {
    leader.status = status;
    const eelStill = preview(new Map([...moving, [key, 'moray_eel']]));
    assert.equal(eelStill.asset,
      `mods/aquarium/assets/moray_eel-inplace-${status === 'done' ? 'gold-right' : 'right'}.png`);
    assert.equal(eelStill.note, 'Still portrait');
  }
  leader.status = 'working';

  // The recovered layered lionfish now previews its fin loop under the same
  // helper and gating; the earlier still-only preview case is obsolete.
  const lion = preview(new Map([...moving, [key, 'lionfish']]));
  assert.equal(lion.asset, 'mods/aquarium/assets/lionfish-fin-right.webp');
  assert.equal(lion.note, 'Swim animation');
  assert.equal(lion.name, 'Lionfish');
  assert.equal(lion.asset,
    `mods/aquarium/assets/${model.fishAsset(leader, false, true, 't1', true, 'right', 'lionfish')}`);
  // A legitimately paused or blocked leader still shows the still portrait.
  const lionPaused = preview(new Map([['aquarium.paused', true], ['aquarium.free', true], [key, 'lionfish']]));
  assert.ok(lionPaused.asset.endsWith('/lionfish.png'), lionPaused.asset);
  assert.equal(lionPaused.note, 'Still portrait');
  leader.status = 'blocked';
  const lionBlocked = preview(new Map([...moving, [key, 'lionfish']]));
  assert.ok(lionBlocked.asset.endsWith('/lionfish.png'), lionBlocked.asset);
  assert.equal(lionBlocked.note, 'Still portrait');
  leader.status = 'working';

  // Automatic resolves through the family leader's address, not the opener's.
  const automatic = preview(new Map(moving));
  assert.equal(automatic.name, `Automatic: ${model.speciesName(model.speciesFor('t1'))}`);
  assert.equal(automatic.asset,
    `mods/aquarium/assets/${model.fishAsset(leader, false, true, 't1', true, 'right', null)}`);

  // Preview preserves the leader's blocked/finished presentation, including gold.
  for (const status of ['blocked', 'done']) {
    leader.status = status;
    const gate = preview(new Map([...moving, [key, 'clownfish']]));
    assert.equal(gate.asset, `mods/aquarium/assets/clownfish${status === 'done' ? '-gold' : ''}.png`);
    assert.equal(gate.note, 'Still portrait');
  }
  leader.status = 'working';

  // Animate off, suspended, inactive window, and Organized mode keep the preview still.
  const paused = preview(new Map([['aquarium.free', true], [key, 'clownfish']]));
  assert.equal(paused.asset, 'mods/aquarium/assets/clownfish.png');
  assert.equal(paused.note, 'Still portrait');
  for (const viewState of [{ suspended: true }, { active: false }]) {
    // Suspension and window inactivity close the picker outright: no preview element survives.
    const gate = preview(new Map([...moving, [key, 'clownfish']]), viewState);
    assert.ok(!gate.nodes.has('aquarium-fish-preview'), 'gated picker builds no preview');
    assert.equal(gate.f.view.pickerTarget, null);
  }
  const organized = preview(new Map([['aquarium.paused', false], ['aquarium.free', false], [key, 'clownfish']]));
  assert.ok(organized.asset.endsWith('.png'), 'no travelling Organized clip in the preview');
  assert.equal(organized.note, 'Still portrait');

  // A closed picker builds no preview element at all: no art, no animation clock.
  const closed = fixture(new Map([['aquarium.free', false]]), false, undefined, data);
  const closedNodes = closed.render();
  assert.ok(!closedNodes.has('aquarium-fish-preview'));
  assert.ok(!closedNodes.has('aquarium-fish-preview-art'));
  assert.equal(closedNodes.get('aquarium-fish-species').childNodes.length, 0);

  // Selecting a radio updates the preview on the next render, not only the tank.
  const fresh = preview(new Map([...moving, [key, 'manta_ray']]));
  const row = fresh.nodes.get('aquarium-fish-species').childNodes.length;
  fresh.f.view.pickerPage = Math.floor(1 / row);
  fresh.f.render().get('aquarium-fish-choice-clownfish').values.on_change(true);
  const after = fresh.f.render();
  assert.equal(after.get('aquarium-fish-preview-art').values.asset, 'mods/aquarium/assets/clownfish-tail-right.webp');
  assert.equal(fresh.f.view.pickerPage, Math.floor(1 / row), 'preview never moves the page');
});

test('Save name button persists the captured fish; a stale target writes nothing', () => {
  const program = { name: 'Pi' };
  const a = { address: 't1', space: 's1', title: 'A', status: 'idle', program };
  const child = { ...a, address: 'child' };
  const data = { agents: [a, child], terminals: [{ address: 't1' }, { address: 'child', parent: 't1' }],
    spaces: [{ id: 's1', machine: null }] };
  const settings = new Map([['aquarium.free', false]]);
  const f = fixture(settings, false, undefined, data);
  f.listen();
  // Inspecting the child and opening captures the child as the rename target.
  f.view.inspected = 'child';
  f.render().get('aquarium-fish-picker').values.on_open_change(true, f.cx);
  f.nameState.text = 'Nemo Jr';
  f.render().get('aquarium-fish-name-save').values.on_click({}, f.cx);
  assert.equal(settings.get(model.fishNameKey(child, data.spaces)), 'Nemo Jr', 'Save click persists the exact child');
  assert.equal(settings.has(model.fishNameKey(a, data.spaces)), false, 'leader untouched');
  // Blank reset through the same button restores the deterministic default.
  f.nameState.text = '   ';
  f.render().get('aquarium-fish-name-save').values.on_click({}, f.cx);
  assert.equal(settings.get(model.fishNameKey(child, data.spaces)), '');
  // A stale target (picker closed, capture cleared) must never write shared state.
  f.view.nameTarget = null;
  f.nameState.text = 'Sneaky';
  f.render().get('aquarium-fish-name-save').values.on_click({}, f.cx);
  for (const handler of f.nameState.submitHandlers) handler();
  assert.equal(settings.get(model.fishNameKey(child, data.spaces)), '', 'no stale write');
  // The concise save/reset hint is visible next to the input.
  const row = f.render().get('aquarium-fish-name-row');
  const texts = [];
  const walk = n => { for (const c of n?.childNodes || []) { if (typeof c === 'string') texts.push(c); else walk(c); } };
  walk(row);
  assert.ok(texts.some(text => /Save \(or Enter\) keeps it; empty restores the default/.test(text)),
    'hint names Save, Enter and the empty reset');
});

test('typing in the tank cannot feed: no key binding, popovers gate queued feed actions', () => {
  // The app keymap is global and key_context covers the whole subtree, so any
  // single-letter binding would steal typing; none may remain in the source.
  assert.ok(!/cx\.bind_keys|"keystroke"/.test(source), 'no single-letter key binding remains');
  assert.ok(!source.includes('.key_context("Aquarium")'), 'old app-global bindings cannot match the tank after hot reload');
  const settings = new Map([['aquarium.paused', false], ['aquarium.free', true]]);
  const f = fixture(settings);
  f.listen();
  f.render();
  const root = f.render().get('aquarium-root');
  // The named action path (button, command, or a user's own deliberate keymap) still feeds.
  root.values.on_action[1]({ action: 'aquarium.feed' }, f.cx);
  assert.ok(f.view.food, 'action dispatch still drops a pellet');
  // While the picker is open (the name input is focused), no feed may act.
  f.view.food = null;
  f.view.pickerTarget = { address: 't1', key: 'k', title: 'A' };
  root.values.on_action[1]({ action: 'aquarium.feed' }, f.cx);
  assert.equal(f.view.food, null, 'no pellet behind an open picker');
  // Options open gates the same way.
  f.view.pickerTarget = null;
  f.view.optionsOpen = true;
  root.values.on_action[1]({ action: 'aquarium.feed' }, f.cx);
  assert.equal(f.view.food, null, 'no pellet behind open Options');
  f.view.optionsOpen = false;
  root.values.on_action[1]({ action: 'aquarium.feed' }, f.cx);
  assert.ok(f.view.food, 'feed resumes once popovers close');
});

test('every species stays reachable by paging in narrow and short viewports, pager always visible', () => {
  const program = { name: 'Pi' };
  const a = { address: 't1', space: 's1', title: 'A', status: 'idle', program };
  const data = { agents: [a], terminals: [], spaces: [{ id: 's1', machine: null }] };
  for (const viewport of [{ width: 220, height: 240 }, { width: 300, height: 320 }, { width: 400, height: 700 }, { width: 220, height: 900 }]) {
    const settings = new Map([['aquarium.free', false]]);
    const f = fixture(settings, false, viewport, data);
    f.render().get('aquarium-fish-picker').values.on_open_change(true, f.cx);
    const seen = [];
    let current = f.render();
    for (;;) {
      // The pager and page count stay rendered on every page, so no scrolling is
      // needed to reach any species regardless of the viewport.
      assert.ok(current.get('aquarium-fish-next'), 'Next stays reachable');
      assert.match(String(current.get('aquarium-fish-page').childNodes[0]), /Page \d+ of \d+/, 'page count visible');
      for (const radio of current.get('aquarium-fish-species').childNodes) seen.push(radio.values.id);
      if (current.get('aquarium-fish-next').values.disabled) break;
      current.get('aquarium-fish-next').values.on_click({}, f.cx);
      current = f.render();
    }
    assert.equal(seen.length, 26, 'each viewport pages through all 25 species plus Automatic exactly once');
    for (const species of ['automatic', ...model.SPECIES])
      assert.ok(seen.includes(`aquarium-fish-choice-${species}`), `${species} reachable at ${viewport.height}px`);
    // Rows stay minimal: never more than five per page in any tested viewport.
    const rows = current.get('aquarium-fish-species').childNodes.length;
    assert.ok(rows >= 1 && rows <= 5, `minimal page size, got ${rows}`);
  }
});
