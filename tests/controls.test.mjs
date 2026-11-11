import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Builder/callback contract check, NOT a native keyboard or layout acceptance test.
const source = readFileSync(new URL('../mods/aquarium/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export default class Aquarium', 'globalThis.Aquarium = class Aquarium');
function fixture(settings = new Map(), immersive = false, viewport = { width: 220, height: 240 }) {
  let nodes;
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
    View: class {}, agents: () => [], terminals: () => [], theme: () => ({}),
    props: () => ({ immersive }), shared: key => settings.get(key),
    setShared: (key, value) => settings.set(key, value),
    window: { viewport_size: () => viewport }, appWindow: () => ({ active: true }),
    newCompletions: () => [], schoolAgents: listed => listed, schoolFamilies: () => [], schoolGeometry: () => ({ lane: 200 }),
    surfaceGeometry: () => ({ count: 0 }),
    floatingSchoolGeometry: () => ({ layouts: [], height: 178 }),
  };
  for (const name of ['div', 'image', 'h_flex', 'v_flex']) env[name] = () => element(name);
  for (const name of ['Button', 'Switch', 'Radio', 'RadioGroup', 'Popover']) env[name] = { new: id => element(name, id) };
  const Aquarium = runInNewContext(`${source}\nAquarium;`, env);
  const view = new Aquarium();
  Object.assign(view, { size: { width: 220, height: 240 }, previous: new Map(), shimmers: new Map(), optionsOpen: false });
  view.syncMotion = () => {}; // Scheduler is outside this suite's scope.
  const cx = { notify() {}, timer: { after() {} } };
  return { view, cx, render() { nodes = []; view.render(cx); return new Map(nodes.filter(n => n.values.id).map(n => [n.values.id, n])); } };
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
