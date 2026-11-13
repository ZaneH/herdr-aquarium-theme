import test from 'node:test';
import assert from 'node:assert/strict';
import { fishPresentation, familyNeedsAttention } from '../mods/aquarium/presentation.js';

test('glass approach changes artwork size around its center, never the target or label height', () => {
  for (const width of [8, 60, 96, 104, 156, 640]) {
    for (const scale of [0.48, 0.6, 1]) {
      for (const free of [true, false]) {
        const back = fishPresentation(width, scale, false, free);
        const front = fishPresentation(width, scale, true, free);
        assert.equal(front.targetHeight, back.targetHeight);
        assert.ok(front.size >= back.size);
        assert.ok(front.size <= Math.max(0, width - 8));
        assert.ok(front.top >= 0 && back.top >= 0);
        if (free) {
          assert.equal(back.top * 2 + back.size, front.size);
          assert.ok(front.targetHeight <= (scale === 1 ? 196 : 140));
          assert.ok(front.targetHeight - front.size >= 16 + 14 + 14 + 9 + 2, 'all three rows, padding and border fit below the largest artwork');
        }
      }
    }
  }
  assert.equal(fishPresentation(156, 1, false, true).size, 108);
  assert.equal(fishPresentation(156, 1, true, true).size, 140);
});

test('only real blocked family members request attention, including nested children', () => {
  const leader = { status: 'working' };
  for (const status of ['working', 'done', 'idle']) {
    assert.equal(familyNeedsAttention({ leader, children: [{ agent: { status }, depth: 2 }] }), false);
  }
  assert.equal(familyNeedsAttention({ leader, children: [{ agent: { status: 'blocked' }, depth: 2 }] }), true);
  assert.equal(familyNeedsAttention({ leader: { status: 'blocked' } }), true);
  assert.equal(familyNeedsAttention({ leader }), false);
});
