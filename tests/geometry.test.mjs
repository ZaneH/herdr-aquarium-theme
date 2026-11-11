import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../mods/aquarium/model.js';
import { floatingGeometry, floatingSchoolGeometry } from '../mods/aquarium/model.js';
import { parkMotion } from '../mods/aquarium/motion.js';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const families = counts => counts.map((count, i) => ({
  leader: { address: i % 2 ? `remote/t${i}` : `t${i}` },
  children: Array.from({ length: count }, (_, j) => ({ agent: { address: `child-${i}-${j}` } })),
}));

test('oversized families have disjoint full movement envelopes and scroll extent', () => {
  for (const width of [104, 259, 260, 363, 364, 800]) {
    for (const height of [178, 300, 800]) {
      for (const counts of [[], [0], [30, 30], [0, 1, 2, 6, 100], Array(100).fill(0)]) {
        const school = families(counts);
        const g = floatingSchoolGeometry(width, height, school);
        assert.equal(g.layouts.length, school.length);
        assert.deepEqual(g, floatingSchoolGeometry(width, height, school));
        let bottom = g.layouts.some(layout => layout.height <= height) ? height : 0;
        for (const [index, layout] of g.layouts.entries()) {
          assert.ok(layout.width + layout.maxX <= width);
          if (layout.height <= height) {
            assert.deepEqual(layout, { ...floatingGeometry(width, height, school[index].leader.address, counts[index]), top: 0 });
          } else {
            assert.ok(layout.top >= bottom);
            assert.equal(layout.maxY, 0);
            bottom = layout.top + layout.height;
          }
          assert.ok(layout.top + layout.maxY + layout.height <= g.height + 1e-8);
        }
        assert.ok(g.height >= height);
      }
    }
  }
});

test('family bounds contain actual worst-status buttons and every wrapped child row', () => {
  // drawFish: blocked leader 140+38; blocked child 140*.6+38;
  // descendants at .48 are smaller. Row gaps are 4, family gap is 8.
  for (let width = 104; width <= 850; width++) {
    for (const count of [1, 2, 3, 6, 31]) {
      const g = floatingGeometry(width, 300, 't1', count);
      const columns = Math.floor((g.broodWidth + 4) / 100);
      const rows = Math.ceil(count / columns);
      const broodHeight = rows * 122 + (rows - 1) * 4;
      assert.ok(columns >= 1);
      assert.ok(g.broodWidth <= g.width);
      assert.ok(g.height >= (g.stacked ? 178 + 8 + broodHeight : Math.max(178, broodHeight)));
      assert.ok(g.width >= (g.stacked ? Math.max(g.leaderWidth, g.broodWidth) : g.leaderWidth + 8 + g.broodWidth));
      assert.ok(g.width <= width);
    }
  }
});

test('resize recomputes independent family bands without dropping an oversized brood', () => {
  const school = families([30, 0, 60]);
  const narrow = floatingSchoolGeometry(104, 178, school);
  const wide = floatingSchoolGeometry(1200, 800, school);
  assert.ok(narrow.height > wide.height);
  for (const g of [narrow, wide]) {
    assert.equal(g.layouts.length, 3);
    assert.equal(g.layouts[1].top, 0);
    assert.ok(g.layouts[0].top >= g.layouts[1].height + g.layouts[1].maxY);
    assert.ok(g.layouts[2].top > g.layouts[0].top + g.layouts[0].height);
  }
});

// Exercise the actual render caller with native-shaped builders; this checks
// description contracts, not GPUI layout/paint or human pointer comfort.
test('actual render preserves all child hit targets, paused offsets and resize identity', () => {
  const source = readFileSync(new URL('../mods/aquarium/main.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export default class Aquarium', 'globalThis.Aquarium = class Aquarium');
  const school = families([30, 0, 60]);
  const agents = school.flatMap(({ leader, children }) => [leader, ...children.map(c => c.agent)])
    .map(a => ({ ...a, status: 'blocked', title: a.address, program: { name: 'Test' } }));
  const terminals = school.flatMap(({ leader, children }) => children.map(c => ({ address: c.agent.address, parent: leader.address })));
  let nodes = [];
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
  let free = true;
  const commands = [];
  const env = { ...model, View: class {}, agents: () => agents, terminals: () => terminals,
    theme: () => ({}), props: () => ({}), focused: () => null, shared: key => key === 'aquarium.free' ? free : undefined,
    run: (command, args) => commands.push({ command, args }),
    appWindow: () => ({ active: true }), window: { viewport_size: () => ({ width: 220, height: 240 }) } };
  for (const name of ['div', 'image', 'h_flex', 'v_flex']) env[name] = () => element();
  for (const name of ['Button', 'Switch', 'Radio', 'RadioGroup', 'Popover']) env[name] = { new: element };
  const Aquarium = runInNewContext(`${source}\nAquarium;`, env);
  const view = new Aquarium();
  Object.assign(view, { size: { width: 100, height: 296 }, previous: new Map(), shimmers: new Map(), motion: new Map() });
  view.syncMotion = floats => {
    for (const { leader, layout } of floats) view.motion.set(leader.address,
      { version: 1, state: parkMotion(layout, null, 0) });
  };
  function render() {
    nodes = [];
    view.render({});
    const fish = nodes.filter(n => n.values.id?.startsWith('fish-'));
    assert.equal(fish.length, agents.length);
    assert.equal(new Set(fish.map(n => n.values.tab_index)).size, agents.length);
    for (const n of fish) {
      assert.equal(typeof n.values.on_click, 'function');
      assert.ok(n.values.accessibility_label.includes('Open agent'));
      n.values.on_click();
      assert.equal(commands.at(-1).command, 'agent.focus');
      assert.equal(commands.at(-1).args.terminal, n.values.id.slice('fish-'.length));
    }
    assert.ok(nodes.find(n => n.values.id === 'school-scroll').values.overflow_scrollbar !== undefined);
    return nodes.filter(n => n.values.id?.startsWith('family-')).map(n => n.values);
  }
  const narrow = render();
  assert.ok(narrow[0].top >= 178);
  assert.ok(narrow[2].top > narrow[0].top + narrow[0].h);
  view.size = { width: 1232, height: 918 };
  const wide = render();
  assert.notEqual(narrow[0].id, wide[0].id, 'band reassignment resets native transition baseline');
  assert.ok(wide[2].top > wide[0].top + wide[0].h);
  free = false;
  view.size = { width: 100, height: 296 };
  render(); // Organized also retains every independently focusable/clickable child.
  assert.ok(nodes.some(n => n.values.w === 120 && 'flex_none' in n.values));
});
