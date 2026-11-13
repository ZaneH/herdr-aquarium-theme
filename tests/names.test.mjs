import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultName, fishName, fishNameKey, familyChoiceKey, savedName } from '../mods/aquarium/model.js';

const spaces = [{ id: 's1', machine: null }, { id: 's2', machine: 'remote' }];
const agent = { address: 't1', space: 's1' };

test('default names are deterministic per address and stable across calls', () => {
  assert.equal(defaultName('t1'), defaultName('t1'));
  assert.equal(defaultName('t1'), fishName(agent, spaces, () => undefined).name);
  // Distinct addresses land on spread-out defaults (checked for a sample of addresses).
  const names = new Set(Array.from({ length: 40 }, (_, i) => defaultName(`t${i}`)));
  assert.ok(names.size > 1, 'defaults must not all collapse to one name');
});

test('savedName validates at the boundary: trim, collapse whitespace, cap length', () => {
  assert.equal(savedName(undefined), null);
  assert.equal(savedName(42), null);
  assert.equal(savedName('   '), null);
  assert.equal(savedName('  Greg \n  Jr  '), 'Greg Jr');
  assert.equal(savedName('x'.repeat(80)).length, 24);
  assert.equal(savedName('x'.repeat(80)), 'x'.repeat(24));
  // Emoji are single codepoints: the cap never cuts a surrogate pair in half.
  assert.equal(savedName('🐬'.repeat(30)), '🐬'.repeat(24));
  const mixed = savedName('🐬'.repeat(23) + 'ab');
  assert.equal(mixed, '🐬'.repeat(23) + 'a');
  assert.equal([...mixed].length, 24);
  // No lone surrogate half: encodeURIComponent throws on one.
  assert.doesNotThrow(() => encodeURIComponent(mixed));
  assert.doesNotThrow(() => encodeURIComponent(savedName('🐙'.repeat(40))));
});

test('custom names persist through the shared settings map and survive reload', () => {
  const settings = new Map();
  const read = key => settings.get(key);
  const key = fishNameKey(agent, spaces);
  settings.set(key, 'Bob');
  const first = fishName(agent, spaces, read);
  assert.equal(first.name, 'Bob');
  assert.equal(first.saved, 'Bob');
  // A fresh read (new render, reload, restart) returns the same name.
  assert.equal(fishName(agent, spaces, read).name, 'Bob');
  // Resetting to empty restores the deterministic default, not a new one.
  settings.set(key, '  ');
  assert.equal(fishName(agent, spaces, read).name, defaultName('t1'));
  // Invalid stored values fall back to the default rather than breaking layout.
  settings.set(key, { no: 'string' });
  assert.equal(fishName(agent, spaces, read).name, defaultName('t1'));
});

test('name identity follows machine/space/address, never species, and never leaks across spaces', () => {
  const key = fishNameKey(agent, spaces);
  assert.ok(key.startsWith('aquarium.name.v1:'));
  assert.notEqual(key, fishNameKey({ ...agent, address: 'other' }, spaces));
  assert.notEqual(key, fishNameKey({ ...agent, space: 's2' }, spaces));
  assert.notEqual(key, fishNameKey(agent, [{ id: 's1', machine: 'remote' }]));
  assert.equal(fishNameKey({ ...agent, space: 'missing' }, spaces), null);
  assert.notEqual(key, familyChoiceKey(agent, spaces), 'names and species choices use separate keys');
  // Without native space metadata the default still shows; nothing is persisted.
  const noKey = fishName(agent, [], () => { throw new Error('must not read'); });
  assert.equal(noKey.key, null);
  assert.equal(noKey.name, defaultName('t1'));
  // Names are keyed by address: changing the species choice cannot rename a fish.
  const settings = new Map([[familyChoiceKey(agent, spaces), 'clownfish']]);
  settings.set(fishNameKey(agent, spaces), 'Greg');
  assert.equal(fishName(agent, spaces, k => settings.get(k)).name, 'Greg');
  settings.set(fishNameKey(agent, spaces), null);
  assert.equal(fishName(agent, spaces, k => settings.get(k)).name, defaultName('t1'));
});

test('duplicate and long names stay single-line, bounded strings', () => {
  const settings = new Map();
  const read = k => settings.get(k);
  for (const address of ['t1', 't2', 't3']) settings.set(fishNameKey({ address, space: 's1' }, spaces), 'Greg');
  const names = ['t1', 't2', 't3'].map(address => fishName({ address, space: 's1' }, spaces, read).name);
  assert.deepEqual(names, ['Greg', 'Greg', 'Greg'], 'duplicate names are allowed');
  for (const name of names) assert.ok(!name.includes('\n') && [...name].length <= 24);
});
