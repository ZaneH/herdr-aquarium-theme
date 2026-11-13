import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as model from '../mods/aquarium/model.js';
import * as motion from '../mods/aquarium/motion.js';
import * as presentation from '../mods/aquarium/presentation.js';

// Runtime regression check for the render-local terminal lookup, reusing the
// source-VM render harness shape from controls.test.mjs.

const source = readFileSync(new URL('../mods/aquarium/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export default class Aquarium', 'globalThis.Aquarium = class Aquarium');

function fixture(agents, terminals) {
  const settings = new Map([['aquarium.paused', true], ['aquarium.free', false]]);
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
    ...model, ...motion, ...presentation,
    View: class {}, agents: () => agents, terminals: () => terminals, spaces: () => [], theme: () => ({}),
    props: () => ({}), focused: () => null, shared: key => settings.get(key), setShared: () => {},
    run: () => {}, appWindow: () => ({ active: true }), window: { viewport_size: () => ({ width: 900, height: 500 }) },
  };
  for (const name of ['div', 'image', 'h_flex', 'v_flex']) env[name] = asset => {
    const node = element(name);
    if (name === 'image') node.values.asset = asset;
    return node;
  };
  for (const name of ['Button', 'Switch', 'Radio', 'RadioGroup', 'Popover']) env[name] = { new: id => element(name, id) };
  env.InputState = { new: () => ({ set_value() {}, on() {}, value: () => '' }) };
  env.Input = { new: () => element('Input') };
  const Aquarium = runInNewContext(`${source}\nAquarium;`, env);
  const view = new Aquarium();
  Object.assign(view, { size: { width: 900, height: 500 }, previous: new Map(), shimmers: new Map(), motion: new Map(), food: null, optionsOpen: false });
  view.syncMotion = () => {}; // Scheduler scope is covered by the scheduler suite.
  view.stopMotion = () => { view.clearFood(); };
  view.syncCompletions = () => {};
  const cx = { notify() {}, spawn() {}, timer: { after() { return { cancel() {} }; } } };
  view.init({}, cx);
  return { view, cx, render() { nodes = []; view.render(cx); return new Map(nodes.filter(n => n.values.id).map(n => [n.values.id, n])); }, allNodes: () => nodes };
}

const agent = (address, title = address) => ({
  address, status: 'working', title, program: { name: 'fixture', agent: true }, space_name: 'space', tab_name: 'tab',
});
const terminal = (address, cwd) => ({
  address, cwd, parent: null, state: 'live', program: { name: 'fixture', agent: true, shell: false }, status: 'working',
});

const texts = nodes => {
  const out = [];
  (function walk(list) {
    for (const child of list ?? []) {
      if (typeof child === 'string') out.push(child);
      else if (child?.childNodes) walk(child.childNodes);
    }
  })(nodes);
  return out.join('\n');
};

test('per-fish tooltips keep terminal detail, first match on duplicate addresses, and no Folder line without a terminal', () => {
  const f = fixture(
    [agent('a'), agent('b'), agent('bare')],
    [terminal('a', '/first'), terminal('a', '/second'), terminal('b', '/b-cwd')],
  );
  const nodes = f.render();
  // Array.find picked the first entry for a duplicated address; the render-local map must too.
  assert.match(nodes.get('fish-a').values.tooltip, /Folder: \/first/);
  assert.ok(!nodes.get('fish-a').values.tooltip.includes('/second'), 'duplicate address must keep first-match semantics');
  assert.match(nodes.get('fish-b').values.tooltip, /Folder: \/b-cwd/);
  // A listed agent with no raw terminal entry still renders, just without folder detail.
  assert.ok(nodes.get('fish-bare').values.tooltip.includes('bare'));
  assert.ok(!nodes.get('fish-bare').values.tooltip.includes('Folder:'));
  assert.ok(!f.allNodes().some(n => n.values.tooltip === undefined && n.type === 'Button' && n.values.id?.startsWith('fish-')));
});

test('selected footer detail resolves the selected agent terminal and follows terminal changes on the next render', () => {
  const agents = [agent('a'), agent('b')];
  const terminals = [terminal('a', '/old-a'), terminal('b', '/old-b')];
  const f = fixture(agents, terminals);
  f.render();
  f.view.hovered = 'b';
  f.render();
  let footer = texts(f.allNodes());
  assert.match(footer, /Folder: \/old-b/);
  // Terminal updates (cwd change) must appear in the very next snapshot: no stale render-local data.
  terminals[1] = terminal('b', '/moved-b');
  f.render();
  footer = texts(f.allNodes());
  assert.match(footer, /Folder: \/moved-b/);
  assert.ok(!footer.includes('/old-b'), 'next snapshot must not keep the previous cwd');
});
