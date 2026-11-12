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
const repo = name => join(ROOT, 'mods', 'aquarium', name);
let prepared;
let foodPrepared;

test.before(() => {
  prepared = prepareNativeFixture({ out: FIRST, count: 5 });
  foodPrepared = prepareNativeFixture({ out: SECOND, count: 2, paused: true, food: true });
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

test('herdr-app check accepts generated samples when available', t => {
  const probe = spawnSync('herdr-app', ['--version'], { encoding: 'utf8' });
  if (probe.status !== 0) {
    t.skip('herdr-app is not available');
    return;
  }
  for (const generated of [prepared, foodPrepared]) {
    const check = spawnSync('herdr-app', ['check', generated.mod], { encoding: 'utf8', timeout: 30000 });
    assert.equal(check.status, 0, `${check.stdout}${check.stderr}`);
  }
});
