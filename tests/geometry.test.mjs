import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../mods/aquarium/model.js';
import { floatingGeometry, floatingSchoolGeometry } from '../mods/aquarium/model.js';
import { parkMotion } from '../mods/aquarium/motion.js';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as presentation from '../mods/aquarium/presentation.js';

const families = counts => counts.map((count, i) => ({
  leader: { address: i % 2 ? `remote/t${i}` : `t${i}` },
  children: Array.from({ length: count }, (_, j) => ({ agent: { address: `child-${i}-${j}` } })),
}));

test('short core IDs start spread deterministically without changing species or motion seeds', () => {
  const species = ['moray_eel', 'seahorse', 'ocean_sunfish', 'flounder', 'silver_arowana', 'clownfish', 'blue_tang', 'betta', 'koi'];
  const addresses = species.map((_, i) => `t${i + 1}`);
  const starts = addresses.map((address, i) => {
    const g = floatingGeometry(868, 382, address, 0);
    assert.deepEqual(g, floatingGeometry(868, 382, address, 0));
    assert.equal(g.seed, 3645 + i);
    assert.equal(model.speciesFor(address), species[i]);
    assert.ok(g.x >= 0 && g.x <= g.maxX);
    assert.ok(g.y >= 0 && g.y <= g.maxY);
    return g;
  });
  assert.equal(new Set(starts.map(g => g.x)).size, 9);
  assert.equal(new Set(starts.map(g => g.y)).size, 9);
  for (const axis of ['x', 'y']) {
    const fractions = starts.map(g => g[axis] / g[axis === 'x' ? 'maxX' : 'maxY']);
    assert.ok(Math.max(...fractions) - Math.min(...fractions) > 0.5, `${axis} spans half the available range`);
  }
  for (const address of addresses) {
    for (const [width, height, children] of [[104, 178, 0], [260, 178, 30], [868, 382, 3]]) {
      const g = floatingGeometry(width, height, address, children);
      assert.ok(g.x >= 0 && g.x <= g.maxX);
      assert.ok(g.y >= 0 && g.y <= g.maxY);
      if (!g.maxX) assert.equal(g.x, 0);
      if (!g.maxY) assert.equal(g.y, 0);
    }
  }
});

test('oversized families have disjoint full movement envelopes and scroll extent', () => {
  for (const width of [104, 259, 260, 363, 364, 800]) {
    for (const height of [178, 300, 800]) {
      for (const counts of [[], [0], [30, 30], [0, 1, 2, 6, 100], Array(100).fill(0)]) {
        const school = families(counts);
        const g = floatingSchoolGeometry(width, height, school);
        assert.equal(g.layouts.length, school.length);
        assert.deepEqual(g, floatingSchoolGeometry(width, height, school));
        const crowded = g.layouts.filter(layout => layout.height <= height && layout.width > width / 2 && layout.height > height / 2);
        const banded = layout => layout.height > height || (crowded.length > 1 && crowded.includes(layout));
        let bottom = g.layouts.some(layout => !banded(layout)) ? height : 0;
        for (const [index, layout] of g.layouts.entries()) {
          assert.ok(layout.width + layout.maxX <= width);
          if (!banded(layout)) {
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

test('unavoidably overlapping fitting families get distinct stationary vertical bands', () => {
  // main.js caller: max(104, size.width - 32), max(178, size.height - 118).
  for (const [size, counts] of [[{ width: 136, height: 296 }, [0, 0]], [{ width: 900, height: 500 }, [9, 9]]]) {
    const width = Math.max(104, size.width - 32);
    const height = Math.max(178, size.height - 118);
    const school = families(counts);
    const raw = school.map(({ leader, children }) => floatingGeometry(width, height, leader.address, children.length));
    assert.ok(raw.every(g => g.width > width / 2 && g.height > height / 2 && g.height <= height));
    const result = floatingSchoolGeometry(width, height, school);
    const targets = result.layouts.map(g => ({ g, target: parkMotion(g, null, 0).to }));
    assert.equal(targets[0].g.top, 0);
    assert.equal(targets[1].g.top, raw[0].height + 8);
    for (const { g, target } of targets) {
      assert.equal(g.maxY, 0);
      assert.equal(target.y, 0);
      assert.ok(g.top + target.y + g.height <= result.height);
      if (width === 104) assert.deepEqual(target, { x: 0, y: 0 });
    }
    assert.ok(targets[0].g.top + targets[0].g.height < targets[1].g.top);
    assert.deepEqual(floatingSchoolGeometry(width, height, school.slice(0, 1)).layouts[0], { ...raw[0], top: 0 }, 'single family retains full-tank path');
  }
  const ordinary = families([0, 0]);
  assert.deepEqual(floatingSchoolGeometry(868, 382, ordinary).layouts,
    ordinary.map(({ leader }) => ({ ...floatingGeometry(868, 382, leader.address, 0), top: 0 })));
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
  const env = { ...model, ...presentation, View: class {}, agents: () => agents, terminals: () => terminals,
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
  free = true;
  for (const [size, counts] of [[{ width: 136, height: 296 }, [0, 0]], [{ width: 900, height: 500 }, [9, 9]]]) {
    const groups = families(counts);
    agents.splice(0, agents.length, ...groups.flatMap(({ leader, children }) => [leader, ...children.map(c => c.agent)])
      .map(a => ({ ...a, status: 'blocked', title: a.address, program: { name: 'Test' } })));
    terminals.splice(0, terminals.length, ...groups.flatMap(({ leader, children }) => children.map(c => ({ address: c.agent.address, parent: leader.address }))));
    view.size = size;
    const cards = render();
    assert.equal(cards.length, 2);
    assert.equal(cards[0].top, 0);
    assert.equal(cards[1].top, cards[0].h + 8);
    assert.ok(cards[0].top + cards[0].h < cards[1].top, 'actual caller targets occupy distinct bands');
    if (size.width === 136) assert.ok(cards.every(card => card.left === 0));
  }
});
