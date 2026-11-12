import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as model from '../mods/aquarium/model.js';
import * as presentation from '../mods/aquarium/presentation.js';

test('raw child peeks without suspension; mapped child retains immersive focus and Back', () => {
  const program = { key: 'pi', name: 'Pi', agent: true, shell: false };
  const parent = { address: 't1', title: 'Parent', status: 'blocked', program, focused: true };
  const child = { address: 't2', parent: 't1', state: 'live', status: 'blocked', program, name: 'Real worker', cwd: '/tmp/child' };
  let terminal = false;
  let focus = null;
  const listed = [parent];
  let stops = 0;
  let nodes = [];
  const commands = [];
  function element(id) {
    const values = { id };
    const node = new Proxy({ values }, { get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        if (key === 'when') { if (args[0]) args[1](node); }
        else values[key] = args.length === 1 ? args[0] : args;
        return node;
      };
    } });
    nodes.push(node);
    return node;
  }
  const env = { ...model, ...presentation, spaces: () => [], View: class {}, agents: () => listed, terminals: () => [child],
    theme: () => ({}), props: () => ({ terminal, immersive: true }), focused: () => ({ agent: focus }),
    shared: key => key === 'aquarium.free' ? false : undefined,
    run: (command, args) => commands.push({ command, args }),
    appWindow: () => ({ active: true }), window: { viewport_size: () => ({ width: 900, height: 500 }) } };
  for (const name of ['div', 'image', 'h_flex', 'v_flex']) env[name] = () => element();
  for (const name of ['Button', 'Switch', 'Radio', 'RadioGroup', 'Popover']) env[name] = { new: element };
  const source = readFileSync(new URL('../mods/aquarium/main.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export default class Aquarium', 'globalThis.Aquarium = class Aquarium');
  const Aquarium = runInNewContext(`${source}\nAquarium;`, env);
  const view = new Aquarium();
  Object.assign(view, { size: { width: 900, height: 500 }, previous: new Map(), shimmers: new Map(), motion: new Map() });
  view.syncMotion = () => {};
  view.stopMotion = () => { stops++; };
  view.render({});
  const fish = nodes.find(n => n.values.id === 'fish-t2');
  assert.ok(fish.values.tooltip.includes('Parent: t1'));
  fish.values.on_click();
  assert.equal(commands.length, 1);
  assert.equal(commands[0].command, 'terminal.peek');
  assert.equal(commands[0].args.terminal, 't2');
  assert.equal(stops, 0);
  assert.notEqual(view.suspended, true);

  // A host-mapped child still uses the unchanged immersive agent block path.
  listed.push({ address: 't2', title: 'Real worker', status: 'blocked', program });
  commands.length = 0;
  fish.values.on_click();
  assert.equal(commands.length, 2);
  assert.equal(commands[0].command, 'agent.focus');
  assert.equal(commands[0].args.terminal, 't2');
  assert.equal(commands[1].command, 'layout.select');
  assert.equal(commands[1].args.child, 'terminal-view');
  assert.equal(stops, 1);
  assert.equal(view.suspended, true);
  focus = 't2';
  nodes = [];
  view.render({});
  assert.ok(nodes.some(n => typeof n.values.child === 'string' && n.values.child.includes('Folder: /tmp/child')));
  terminal = true;
  nodes = [];
  view.render({});
  assert.ok(nodes.some(n => n.values.child === 'Real worker'));
  nodes.find(n => n.values.id === 'back-to-water').values.on_click();
  assert.equal(commands.at(-1).command, 'aquarium.resume');
});
