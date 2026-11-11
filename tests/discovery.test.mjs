import test from 'node:test';
import assert from 'node:assert/strict';
import { schoolAgents, schoolFamilies, newCompletions, fishAsset } from '../mods/aquarium/model.js';
const program = { key: 'pi', name: 'Pi', agent: true, shell: false };
const leader = { address: 't1', status: 'done', title: 'Parent', program, pane: 'p1', space_name: 'Work' };
const raw = (address, parent, status = 'working', extra = {}) => ({ address, parent, state: 'live', status,
  report: { app: 'pi' }, program, argv: ['pi'], labels: {}, name: null, template: null,
  title: '', cwd: '/tmp/work', ...extra });
const root = raw('t1', null);

test('spawn, report changes, exit and removal use live raw terminals', () => {
  assert.deepEqual(schoolAgents([leader], [root]), [leader]);
  const child = raw('t2', 't1');
  let school = schoolAgents([leader], [root, child]);
  assert.equal(school.length, 2);
  assert.equal(school[1].status, 'working');
  assert.equal(school[1].space_name, undefined);
  assert.equal(school[1].pane, undefined);
  school = schoolAgents([leader], [root, { ...child, status: 'done' }]);
  assert.equal(school[1].status, 'idle');
  assert.deepEqual(newCompletions(new Map([['t1', 'done']]), school), []);
  assert.equal(schoolAgents([leader], [root, { ...child, status: 'error' }])[1].status, 'blocked');
  assert.deepEqual(schoolAgents([leader], [root, { ...child, state: 'finished', status: null }]), [leader]);
  assert.deepEqual(schoolAgents([leader], [root]), [leader]);
});

test('mapped child wins, nested remote children keep targets and parent species', () => {
  const remote = { ...leader, address: 'vps/t1' };
  const child = raw('vps/t2', 'vps/t1');
  const grandchild = raw('vps/t3', 'vps/t2', 'blocked');
  const mapped = { ...leader, address: child.address, title: 'Kept child' };
  const school = schoolAgents([remote, mapped], [raw(remote.address, null), grandchild, child, child]);
  assert.equal(school.length, 3);
  assert.equal(school[1], mapped);
  const families = schoolFamilies(school, [raw(remote.address, null), child, grandchild]);
  assert.equal(families.length, 1);
  assert.deepEqual(families[0].children.map(c => [c.agent.address, c.depth]), [['vps/t2', 1], ['vps/t3', 2]]);
  assert.equal(fishAsset(school[2], true, false, remote.address), fishAsset({ ...remote, status: 'blocked' }, true, false));
});

test('no unknown-parent guesses, subprocess fish, stale reports or cyclic attachment', () => {
  const shell = { key: 'shell', name: 'zsh', shell: true, agent: false };
  const terminals = [root, raw('orphan', 'missing'), raw('shell', 't1', 'working', { program: shell }),
    raw('build', 't1', null, { program: { ...shell, shell: false } }), raw('no-report', 't1', null),
    raw('unknown-status', 't1', 'waiting'), raw('under-shell', 'shell'),
    raw('a', 'b'), raw('b', 'a'), raw('self', 'self')];
  const discovered = schoolAgents([leader], terminals);
  assert.deepEqual(discovered.map(a => a.address), ['t1', 'orphan', 'under-shell', 'a', 'b', 'self']);
  assert.equal(schoolFamilies(discovered, terminals).length, discovered.length);
  const cyclicRoot = raw('t1', 't2');
  assert.equal(schoolFamilies(schoolAgents([leader], [cyclicRoot, raw('t2', 't1')]), [cyclicRoot, raw('t2', 't1')]).length, 2);
  const listedChild = { ...leader, address: 't2' };
  const school = schoolAgents([leader, listedChild], [cyclicRoot, raw('t2', 't1')]);
  assert.equal(schoolFamilies(school, [cyclicRoot, raw('t2', 't1')]).length, 2);
});

test('parent exit does not attach remaining background children elsewhere', () => {
  const exited = raw('t1', null, null, { state: 'finished' });
  const child = raw('t2', 't1');
  const surviving = schoolAgents([], [exited, child]);
  assert.deepEqual(surviving.map(a => a.address), ['t2']);
  assert.equal(surviving[0].space_name, undefined);
  assert.equal(schoolFamilies(surviving, [exited, child])[0].leader.address, 't2');
  const middle = raw('middle', 't1', null, { state: 'finished' });
  const nested = raw('t2', 'middle');
  const school = schoolAgents([leader], [middle, nested]);
  assert.equal(schoolFamilies(school, [middle, nested]).length, 2);
  const listedOrphan = { ...leader, address: 't9' };
  assert.equal(schoolAgents([listedOrphan], [raw('t9', 'gone')])[0], listedOrphan);
});
