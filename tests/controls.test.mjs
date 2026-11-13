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
    ...model, ...presentation, spaces: () => animationCase?.spaces || [],
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
  const Aquarium = runInNewContext(`${source}\nAquarium;`, env);
  const view = new Aquarium();
  Object.assign(view, { size: { width: 220, height: 240 }, previous: new Map(), shimmers: new Map(), motion: new Map(), food: null, optionsOpen: false });
  view.syncMotion = () => {}; // Scheduler is outside this suite's scope.
  view.stopMotion = () => { view.clearFood(); }; // Feed state only; motion work belongs to the scheduler suite.
  const cx = { notify() {}, bind_keys: () => 1, timer: { after() { return { cancel() {} }; } } };
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
  const staleChoice = nodes.get('aquarium-fish-choice-clownfish').values.on_change;
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
  f.view.pickerPage = 0;
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
  assert.equal(copy.render().get('aquarium-fish-choice-automatic').values.checked, true);
  assert.equal(model.fishAsset(a, true, false, a.address, false, 'right', 'bad'), model.fishAsset(a, true, false));
  copy.render().get('aquarium-fish-choice-automatic').values.on_change(true);
  assert.equal(settings.get(key), null);
  assert.equal(model.familyChoiceKey({ ...a, space: 'missing' }, data.spaces), null);
  assert.notEqual(key, model.familyChoiceKey({ ...a, space: b.space }, data.spaces));
  assert.notEqual(key, model.familyChoiceKey({ ...a, address: 'another' }, data.spaces));
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

test('night switches both real label rows to moonlit ink; art, status and controls stay day', () => {
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
    const [nameRow, statusRow] = fishButton.childNodes.slice(1);
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
  fresh.nodes.get('aquarium-fish-choice-clownfish').values.on_change(true);
  const after = fresh.f.render();
  assert.equal(after.get('aquarium-fish-preview-art').values.asset, 'mods/aquarium/assets/clownfish-tail-right.webp');
  assert.equal(fresh.f.view.pickerPage ?? 0, 0, 'preview never moves the page');
});
