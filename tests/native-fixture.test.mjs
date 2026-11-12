import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COUNTS, MOD_NAME, prepareNativeFixture } from '../tools/prepare-native-fixture.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMP = mkdtempSync(join(tmpdir(), 'aquarium-native-fixture-test-'));
const FIRST = join(TEMP, 'first');
const SECOND = join(TEMP, 'second');
const THIRD = join(TEMP, 'third');
const FOURTH = join(TEMP, 'fourth');
const repo = name => join(ROOT, 'mods', 'aquarium', name);
let prepared;
let foodPrepared;
let cyclePrepared;

const onlyChild = terminals => terminals.find(terminal => terminal.parent);
const FIFTH = join(TEMP, 'fifth');

test.before(() => {
  prepared = prepareNativeFixture({ out: FIRST, count: 5 });
  foodPrepared = prepareNativeFixture({ out: SECOND, count: 2, paused: true, food: true });
  cyclePrepared = prepareNativeFixture({ out: FOURTH, count: 5, attentionCycle: true });
});

test.after(() => rmSync(TEMP, { recursive: true, force: true }));

function addStandaloneStubs(output) {
  const modules = join(output, 'node_modules');
  const write = (name, body) => {
    mkdirSync(join(modules, name), { recursive: true });
    writeFileSync(join(modules, name, 'package.json'), JSON.stringify({ name, type: 'module', exports: './index.js' }));
    writeFileSync(join(modules, name, 'index.js'), body);
  };
  const chain = 'const chain = () => new Proxy(function () {}, { get: () => chain, apply: () => chain });\n';
  write('herdr', `export const theme = () => ({ background: "#000", foreground: "#fff", surface: "#111", muted: "#888", chrome: "#000", accent: "#0ff", hover: "#222", border: "#333" });
export const props = () => globalThis.__fixtureProps || {};
export const window = () => ({ active: false });
export const agents = () => []; export const terminals = () => []; export const spaces = () => [];
export const focused = () => null; export const shared = () => undefined;
export const setShared = () => { throw new Error("real setShared touched"); };
export const run = () => { throw new Error("real app command touched"); };
export const nextCommand = () => new Promise(() => {});
`);
  write('gpui-kit', `${chain}export class View {}
export const div = chain; export const image = chain;
`);
  write('gpui-base', `${chain}export const h_flex = chain; export const v_flex = chain;
export const Button = { new: chain }; export const Switch = { new: chain };
export const Radio = { new: chain }; export const RadioGroup = { new: chain };
export const Popover = { new: chain };
`);
}

async function importShim(preparedFixture) {
  const path = join(preparedFixture.mod, 'fixture-herdr.js');
  return import(`${pathToFileURL(path).href}?test=${Date.now()}-${Math.random()}`);
}

async function importModelShim(preparedFixture, propsValue) {
  addStandaloneStubs(preparedFixture.output);
  const [shim, model] = await Promise.all([
    importShim(preparedFixture),
    import(pathToFileURL(join(preparedFixture.mod, 'model.js')).href),
  ]);
  globalThis.__fixtureProps = propsValue;
  return { shim, model };
}

test('generates exactly the requested synthetic roots, real source copies and safe assets', () => {
  assert.deepEqual(COUNTS, [2, 5, 10]);
  assert.equal(prepared.fixture.count, 5);
  assert.equal(prepared.fixture.paused, false);
  assert.equal(prepared.fixture.food, false);
  assert.equal(prepared.fixture.synthetic.roots, 5);
  for (const name of ['main.js', 'aquarium.js', 'fixture-herdr.js', 'model.js', 'motion.js', 'presentation.js', 'mod.json']) {
    assert.ok(existsSync(join(prepared.mod, name)), name);
  }
  assert.ok(existsSync(join(prepared.mod, 'assets')));
  for (const name of ['model.js', 'motion.js', 'presentation.js']) {
    assert.deepEqual(readFileSync(join(prepared.mod, name)), readFileSync(repo(name)), `${name} must be byte-for-byte`);
  }
  const sourceMain = readFileSync(repo('main.js'), 'utf8');
  const fixtureMain = readFileSync(join(prepared.mod, 'aquarium.js'), 'utf8');
  assert.equal(fixtureMain, sourceMain
    .replace('from "herdr";', 'from "./fixture-herdr.js";')
    .replace('const ART = "mods/aquarium/assets";', `const ART = "mods/${MOD_NAME}/assets";`));
  assert.match(readFileSync(join(prepared.mod, 'main.js'), 'utf8'), /SYNTHETIC NATIVE FIXTURE/);
  assert.match(readFileSync(join(prepared.mod, 'main.js'), 'utf8'), /NOT TELEMETRY/);
  assert.equal(prepared.fixture.layouts.length, 2);
  for (const name of prepared.fixture.layouts) assert.ok(existsSync(join(FIRST, 'layouts', name)));
});

test('supports the documented 10-root count', () => {
  const ten = prepareNativeFixture({ out: THIRD, count: 10 });
  assert.equal(ten.fixture.count, 10);
  assert.equal(ten.fixture.synthetic.roots, 10);
  assert.equal(ten.fixture.synthetic.speciesMix.length, 5);
});

test('generated fixture discovery keeps the root count and exposes one blocked nested child only in the attention layout', async () => {
  addStandaloneStubs(FIRST);
  const [shim, model] = await Promise.all([
    importShim(prepared),
    import(pathToFileURL(join(prepared.mod, 'model.js')).href),
  ]);
  globalThis.__fixtureProps = {};
  assert.equal(shim.agents().length, 5);
  assert.ok(shim.agents().every(agent => agent.status === 'working'));
  assert.equal(shim.terminals().length, 5);
  assert.equal(model.schoolAgents(shim.agents(), shim.terminals()).length, 5);

  globalThis.__fixtureProps = { attention: true };
  const terminals = shim.terminals();
  assert.equal(terminals.length, 6);
  const child = terminals.find(terminal => terminal.parent);
  assert.equal(child.status, 'blocked');
  assert.equal(child.parent, shim.agents()[0].address);
  const school = model.schoolAgents(shim.agents(), terminals);
  assert.equal(school.length, 6);
  assert.equal(school.find(agent => agent.address === child.address).status, 'blocked');
  const families = model.schoolFamilies(school, terminals);
  assert.equal(families.length, 5);
  assert.ok(families.some(family => family.children.some(entry => entry.agent.address === child.address)));
  globalThis.__fixtureProps = {};
});

test('fixture-local settings, species mix, window activity and app commands stay synthetic', async () => {
  const shim = await importShim(prepared);
  globalThis.__fixtureProps = {};
  assert.equal(shim.shared('aquarium.paused'), false);
  assert.equal(shim.shared('aquarium.free'), true);
  assert.equal(shim.shared('aquarium.speed'), 'normal');
  assert.equal(shim.shared('aquarium.unknown'), undefined);
  const space = shim.spaces()[0];
  const choiceKey = address => `aquarium.fish.v1:${JSON.stringify([space.machine, space.id, address])}`;
  assert.equal(shim.shared(choiceKey(shim.agents()[0].address)), 'clownfish');
  assert.equal(shim.shared(choiceKey(shim.agents()[1].address)), 'blue_tang');
  assert.equal(shim.shared('aquarium.fish.v1:not-json'), undefined);
  assert.equal(shim.window()?.active, false, 'headless window must not be faked active');
  shim.setShared('aquarium.paused', true);
  assert.equal(shim.shared('aquarium.paused'), false);
  assert.equal(shim.run('aquarium.feed', {}), undefined);
  assert.equal(shim.run('layout.switch', { name: 'main' }), undefined);
  assert.match(readFileSync(join(prepared.mod, 'fixture-herdr.js'), 'utf8'), /new Promise\(\(\) => \{\}\)/);
});

test('standalone imports resolve without the production mod directory', async () => {
  const entry = await import(pathToFileURL(join(prepared.mod, 'main.js')).href);
  assert.equal(typeof entry.default, 'function');
  assert.equal(typeof entry.default.prototype.init, 'function');
  assert.equal(typeof entry.default.prototype.render, 'function');
});

test('paused and food parameters are compiled into the fixture without mutating real settings', async () => {
  addStandaloneStubs(SECOND);
  const shim = await importShim(foodPrepared);
  globalThis.__fixtureProps = {};
  assert.equal(shim.shared('aquarium.paused'), true);
  const wrapper = readFileSync(join(foodPrepared.mod, 'main.js'), 'utf8');
  assert.match(wrapper, /FOOD_AUTOPLAY = true/);
  assert.match(wrapper, /dropFood\(cx\)/);
  assert.match(wrapper, /PAUSED/);
  assert.match(wrapper, /FOOD AUTOPLAY ON/);
  assert.equal(shim.window()?.active, false);
});

test('refuses an existing output directory and paths inside the repository', () => {
  assert.throws(() => prepareNativeFixture({ out: FIRST, count: 5 }), /already exists/);
  const insideRepo = join(ROOT, 'mods', 'aquarium-native-fixture-never-created');
  assert.throws(() => prepareNativeFixture({ out: insideRepo, count: 5 }), /inside the repository/);
  assert.equal(existsSync(insideRepo), false);
});

test('refuses a custom live app home, including a symlink alias', () => {
  const home = join(TEMP, 'custom-home');
  const alias = join(TEMP, 'custom-home-alias');
  mkdirSync(home);
  symlinkSync(home, alias, 'dir');
  const previous = process.env.HERDR_APP_HOME;
  process.env.HERDR_APP_HOME = alias;
  try {
    for (const parent of [home, alias]) {
      const out = join(parent, 'never-created');
      assert.throws(() => prepareNativeFixture({ out }), /inside the live Herdr app home/);
      assert.equal(existsSync(out), false);
    }
  } finally {
    if (previous === undefined) delete process.env.HERDR_APP_HOME;
    else process.env.HERDR_APP_HOME = previous;
  }
});

test('default fixtures omit cycle code, cycle metadata and cycle layout props', () => {
  assert.equal('attentionCycle' in prepared.fixture, false);
  const defaultShim = readFileSync(join(prepared.mod, 'fixture-herdr.js'), 'utf8');
  assert.equal(defaultShim.includes('attentionCycle'), false);
  assert.equal(defaultShim.includes('CYCLE_PHASES'), false);
  const defaultWrapper = readFileSync(join(prepared.mod, 'main.js'), 'utf8');
  assert.equal(defaultWrapper.includes('ATTENTION CYCLE'), false);
  assert.equal(defaultWrapper.includes('cycleTimers'), false);
  assert.deepEqual(JSON.parse(readFileSync(join(FIRST, 'layouts', `${MOD_NAME}-attention.json`), 'utf8')).children[0].content.props, { attention: true });
});

test('generated layouts carry the fixture-local bright habitat background, byte-identical to production non-immersive', () => {
  const expected = { image: `mods/${MOD_NAME}/assets/habitat-bright-v1.svg`, fit: 'cover' };
  const productionAsset = readFileSync(repo('assets/habitat-bright-v1.svg'));
  for (const [dir, layoutName] of [
    [FIRST, `${MOD_NAME}.json`],
    [FIRST, `${MOD_NAME}-attention.json`],
    [FOURTH, `${MOD_NAME}.json`],
    [FOURTH, `${MOD_NAME}-attention.json`],
  ]) {
    const block = JSON.parse(readFileSync(join(dir, 'layouts', layoutName), 'utf8')).children[0];
    assert.deepEqual(block.background, expected, `${layoutName} must match the non-immersive production background`);
    assert.ok(!block.background.image.startsWith('mods/aquarium/'), 'background stays fixture-local');
    assert.deepEqual(readFileSync(join(dir, block.background.image)), productionAsset, 'fixture habitat asset must be byte-identical to production');
  }
});

test('provenance banner paints dark navy with white text over the bright backdrop, without touching fish pills', () => {
  const wrapper = readFileSync(join(prepared.mod, 'main.js'), 'utf8');
  assert.match(wrapper, /div\(\)\.flex_none\(\)\.px\(8\)\.py\(4\)\.bg\("#173b46"\)\.text_color\("#ffffff"\)\.text_size\(12\)/);
  assert.equal((wrapper.match(/bg\("#173b46"\)/g) || []).length, 1, 'diagnostic banner bar only, never fish pill styling');
});

test('opt-in attention cycle drives working -> blocked -> working -> blocked with fixture-local timer dispatch', async () => {
  const { shim, model } = await importModelShim(cyclePrepared, { attention: true });
  const { schoolAgents, schoolFamilies } = model;
  const presentation = await import(pathToFileURL(join(cyclePrepared.mod, 'presentation.js')).href);
  const cycle = shim.attentionCycle;
  assert.equal(cycle.dwellMs, 3000);
  assert.deepEqual(cycle.phases, ['WORKING', 'BLOCKED', 'WORKING-2', 'BLOCKED-2']);

  // Phase 0: the child works; every root stays working and counted.
  let terminals = shim.terminals();
  assert.equal(terminals.length, 6);
  assert.equal(onlyChild(terminals).status, 'working');
  assert.equal(shim.agents().length, 5);
  assert.ok(shim.agents().every(agent => agent.status === 'working'));
  assert.equal(cycle.info().phase, 0);
  assert.equal(cycle.info().tMs, 0);

  // Sub-dwell advance does nothing; the full dwell flips one phase at a time.
  assert.deepEqual(cycle.advance(2999), []);
  assert.equal(cycle.info().phase, 0);
  assert.deepEqual(cycle.advance(1), [3000]);
  assert.equal(onlyChild(shim.terminals()).status, 'blocked');
  assert.deepEqual(cycle.advance(3000), [6000]);
  assert.equal(onlyChild(shim.terminals()).status, 'working');
  assert.deepEqual(cycle.advance(3000), [9000]);
  assert.equal(onlyChild(shim.terminals()).status, 'blocked');
  // Bounded: the cycle is over, no further callbacks exist.
  assert.deepEqual(cycle.advance(30000), []);
  assert.equal(cycle.info().phase, 3);

  // Family priority follows the child status through discovery, not just the raw list.
  cycle.resume && cycle.resume();
  const school = schoolAgents(shim.agents(), shim.terminals());
  const families = schoolFamilies(school, shim.terminals());
  const childFamily = families.find(family => family.children.some(({ agent }) => agent.address === onlyChild(shim.terminals()).address));
  assert.ok(childFamily, 'blocked child must group under its root family');
  assert.equal(childFamily.leader.address, shim.agents()[0].address);
  assert.equal(presentation.familyNeedsAttention(childFamily), true);
  assert.equal(families.length, 5);
  globalThis.__fixtureProps = {};
});

test('attention cycle suspension interrupts progression and close cancels pending callbacks', async () => {
  const { shim } = await importModelShim(cyclePrepared, { attention: true });
  const cycle = shim.attentionCycle;
  // Pause/suspend holds the pending phase callbacks: the clock and phase freeze.
  cycle.suspend();
  assert.deepEqual(cycle.advance(3000), []);
  assert.equal(cycle.info().phase, 0);
  assert.equal(cycle.info().suspended, true);
  cycle.resume();
  assert.deepEqual(cycle.advance(3000), [3000]);
  assert.equal(cycle.info().phase, 1);

  // close() cancels every pending cycle callback; stale dispatch is a no-op.
  cycle.close();
  assert.equal(cycle.info().closed, true);
  assert.deepEqual(cycle.advance(30000), []);
  assert.equal(cycle.info().phase, 1, 'close freezes the phase');
  assert.equal(onlyChild(shim.terminals()).status, 'blocked');

  // Synthetic only: no real data commands run through the cycle fixture.
  assert.equal(shim.run('layout.switch', { name: 'x' }), undefined);
  shim.setShared('aquarium.paused', true);
  assert.equal(shim.shared('aquarium.paused'), false);
  assert.equal(shim.window()?.active, false, 'no active:true fallback');
  globalThis.__fixtureProps = {};
});

test('cycle wrapper banner, bounded one-shot timers and safe CLI generation', () => {
  const wrapper = readFileSync(join(cyclePrepared.mod, 'main.js'), 'utf8');
  assert.match(wrapper, /ATTENTION CYCLE: \$\{attentionCycle\.info\(\)\.label\} PHASE \$\{attentionCycle\.info\(\)\.phase \+ 1\}\/\$\{attentionCycle\.phases\.length\} T\+\$\{attentionCycle\.info\(\)\.tMs\}MS/);
  assert.match(wrapper, /cx\.timer\.after\(attentionCycle\.dwellMs/);
  assert.match(wrapper, /attentionCycle\.close\(\)/);
  assert.match(wrapper, /if \(this\.closed\) return;/);
  assert.doesNotMatch(wrapper, /requestAnimationFrame|setInterval/);
  assert.deepEqual(JSON.parse(readFileSync(join(FOURTH, 'layouts', `${MOD_NAME}-attention.json`), 'utf8')).children[0].content.props, { attention: true, cycle: true });
  const meta = JSON.parse(readFileSync(join(FOURTH, 'fixture.json'), 'utf8')).attentionCycle;
  assert.equal(meta.dwellMs, 3000);
  assert.equal(meta.totalMs, 9000);
  assert.equal(meta.transitions, 3);

  const cli = spawnSync(process.execPath, [join(ROOT, 'tools', 'prepare-native-fixture.mjs'), '--out', FIFTH, '--count', '2', '--attention-cycle'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.ok(existsSync(join(FIFTH, 'fixture.json')));
  assert.equal(JSON.parse(readFileSync(join(FIFTH, 'fixture.json'), 'utf8')).attentionCycle.dwellMs, 3000);
});

test('generated cycle wrapper lifecycle: per-callback contexts, bounded timers, clean primary layout, close cancels', async () => {
  addStandaloneStubs(FOURTH);
  const entry = await import(pathToFileURL(join(cyclePrepared.mod, 'main.js')).href);
  const shim = await import(pathToFileURL(join(cyclePrepared.mod, 'fixture-herdr.js')).href);
  const cycle = shim.attentionCycle;
  const timers = [];
  const makeCx = () => {
    const cx = { notified: 0, notify() { cx.notified += 1; }, bind_keys() {}, spawn(fn) { fn(cx); } };
    cx.timer = { after(delay, cb) {
      const task = { delay, cb, cx, cancelled: false, cancel() { task.cancelled = true; } };
      timers.push(task);
      return task;
    } };
    return cx;
  };
  const poison = cx => {
    cx.notify = cx.timer.after = () => { throw new Error('stale init cx reused after init'); };
  };

  // Primary layout: no cycle timers, and close() must not close the shared module clock.
  globalThis.__fixtureProps = {};
  const primary = new entry.default();
  primary.init({}, makeCx());
  assert.equal(timers.length, 0, 'no cycle timers without attention/cycle layout props');
  await primary.close();
  assert.equal(cycle.info().closed, false, 'primary layout close must not close the shared cycle');

  // Cycle layout: init schedules exactly the first phase timer on the init cx.
  globalThis.__fixtureProps = { attention: true, cycle: true };
  const wrapper = new entry.default();
  const initCx = makeCx();
  wrapper.init({}, initCx);
  poison(initCx); // any later reuse of the init cx must throw
  assert.deepEqual(timers.map(task => task.delay), [3000]);

  // Each native phase callback gets its own cx and forwards it; phases advance one at a time.
  const callbackCxs = [];
  for (const expectedPhase of [1, 2, 3]) {
    const task = timers[timers.length - 1];
    const cbCx = makeCx();
    callbackCxs.push(cbCx);
    task.cb(cbCx);
    assert.equal(cycle.info().phase, expectedPhase, 'one phase per native callback');
    assert.equal(cbCx.notified, 1, 'phase callback notifies its own cx, never the init cx');
  }
  assert.deepEqual(timers.map(task => task.delay), [3000, 3000, 3000, 200], 'three phase timers plus one interruption timer, no fifth');
  assert.ok(timers.slice(1, 4).every((task, i) => task.cx === callbackCxs[i]), 'later timers bind the previous callback cx');

  // 200 ms into the final blocked phase: the production suspension path runs.
  timers[3].cb(makeCx());
  assert.equal(wrapper.suspended, true);
  assert.equal(wrapper.interruptedAtMs, 9200);
  assert.equal(cycle.info().suspended, true);
  assert.match(readFileSync(join(cyclePrepared.mod, 'main.js'), 'utf8'), /INTERRUPTED \(SUSPENDED\) AT T\+\$\{this\.interruptedAtMs\}MS/);

  // close() cancels every native handle and leaves stale callbacks inert.
  await wrapper.close();
  assert.ok(timers.every(task => task.cancelled), 'close cancels every native handle');
  assert.equal(cycle.info().closed, true);
  const staleCx = makeCx();
  timers[1].cb(staleCx);
  assert.equal(cycle.info().phase, 3, 'stale callbacks cannot advance the closed cycle');
  assert.equal(staleCx.notified, 0);
  globalThis.__fixtureProps = {};
});

test('herdr-app check accepts generated samples when available', t => {
  const probe = spawnSync('herdr-app', ['--version'], { encoding: 'utf8' });
  if (probe.status !== 0) {
    t.skip('herdr-app is not available');
    return;
  }
  for (const generated of [prepared, foodPrepared, cyclePrepared]) {
    const check = spawnSync('herdr-app', ['check', generated.mod], { encoding: 'utf8', timeout: 30000 });
    assert.equal(check.status, 0, `${check.stdout}${check.stderr}`);
  }
});
