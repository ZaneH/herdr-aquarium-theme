import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const luminance = hex => {
  const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) /
  (Math.min(luminance(a), luminance(b)) + .05);

test('owned layouts use versioned bright habitat identities for background and preview', () => {
  for (const [layout, asset] of [['aquarium', 'habitat-bright-v1.svg'], ['aquarium-immersive', 'habitat-full-bright-v1.svg']]) {
    const source = read(`layouts/${layout}.json`);
    const path = `mods/aquarium/assets/${asset}`;
    assert.ok(read(path).includes('<svg'));
    const images = [...source.matchAll(/"(?:image|preview)": "([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(images, [path, path]);
  }
});

test('unbacked lettering and keyboard focus contrast with habitat paints independently of host theme', () => {
  const source = read('mods/aquarium/main.js');
  const ink = Object.fromEntries([...source.match(/const tankInk = \{([^}]+)\}/)[1]
    .matchAll(/(\w+): "(#[a-f0-9]{6})"/g)].map(m => [m[1], m[2]]));
  const paints = [];
  for (const file of ['habitat-bright-v1.svg', 'habitat-full-bright-v1.svg']) {
    const colors = [...read(`mods/aquarium/assets/${file}`).matchAll(/#[a-f0-9]{6}/g)].map(m => m[0]);
    paints.push(colors);
    for (const color of colors) {
      assert.ok(contrast(color, ink.background) >= 3, `${file} focus: ${color}`);
      assert.ok(contrast(color, ink.foreground) >= 4.5, `${file} lettering: ${color}`);
      assert.ok(contrast(color, '#0c242c') >= 4.5, `${file} project lettering: ${color}`);
    }
  }
  assert.deepEqual(paints[0], paints[1]);
  // These are paint-level checks, not native rendering or keyboard acceptance.
  assert.match(source, /focus\(s => s.border_color\(night \? labelInk : tankInk.background\)\)/);
  // Night labels use a render-local pale ink, chosen when aquarium.night is on.
  const nightInk = '#d8f0ed';
  assert.match(source, /const labelInk = night \? "#d8f0ed" : tankInk\.foreground/);
  assert.match(source, /const projectInk = night \? "#bddbd9" : "#0c242c"/);
  assert.match(source, /text_color\(projectInk\)/);
  const labelRows = [...source.matchAll(/text_color\(labelInk\)/g)];
  assert.ok(labelRows.length >= 2, 'both actual fish label rows must paint with labelInk, not an unused constant');
  // Check each habitat paint after tinting, not just the raw overlay color.
  // These samples do not substitute for native rendering or focus acceptance.
  const overlay = '#061f35';
  for (const daylight of new Set(paints.flat())) {
    const composite = '#' + [1, 3, 5].map(i => Math.round(0.72 * parseInt(overlay.slice(i, i + 2), 16)
      + 0.28 * parseInt(daylight.slice(i, i + 2), 16)).toString(16).padStart(2, '0')).join('');
    assert.ok(contrast(nightInk, composite) >= 4.5, `night ink on composite ${composite}`);
    assert.ok(contrast('#bddbd9', composite) >= 4.5, `night project ink on composite ${composite}`);
    assert.ok(contrast(nightInk, composite) >= 3, `night focus on composite ${composite}`);
  }
  assert.doesNotMatch(source, /bg\(tankInk.background\)/);
  assert.doesNotMatch(source, /hover\(s => s.bg\("#173b4614"\)/);
});
