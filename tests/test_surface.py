"""Static wave-asset contract; run: python3 -m unittest discover -s tests -p test_surface.py."""
import re
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SVG = '{http://www.w3.org/2000/svg}'


class SurfaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.surface = ET.parse(ROOT / 'mods/aquarium/assets/surface.svg').getroot()
        model = (ROOT / 'mods/aquarium/model.js').read_text()
        geometry = re.search(r'export function surfaceGeometry\(width\)\s*\{(.*?)\n\}',
                             model, re.S).group(1)
        cls.tile_width = float(re.search(r'tileWidth:\s*([\d.]+)', geometry).group(1))
        cls.tile_height = float(re.search(r'height:\s*([\d.]+)', geometry).group(1))

    def test_native_size_matches_tile_without_letterboxing(self):
        width = float(self.surface.attrib['width'])
        height = float(self.surface.attrib['height'])
        self.assertEqual((width, height), (400, 48))
        self.assertEqual((width, height), (self.tile_width, self.tile_height))
        # SVG's default xMidYMid meet is safe only when these ratios agree.
        x, y, vw, vh = map(float, self.surface.attrib['viewBox'].split())
        self.assertEqual((x, y), (0, 0))
        self.assertEqual(vw / vh, self.tile_width / self.tile_height)
        self.assertEqual((vw, vh), (width, height))

    def test_wave_boundaries_have_matching_positions_and_tangents(self):
        paths = self.surface.findall(f'{SVG}path')
        self.assertEqual(len(paths), 3)  # fill edge and both visible wave strokes
        for path in paths:
            with self.subTest(path=path.attrib['d']):
                # Deliberately support the asset's compact M/Q/T grammar only;
                # a redesign must update this geometric contract explicitly.
                match = re.fullmatch(
                    r'M([\d.]+) ([\d.]+) Q([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)'
                    r'((?: T[\d.]+ [\d.]+)+)(?:\s*(V48H0Z))?', path.attrib['d'])
                self.assertIsNotNone(match)
                x, y, cx, cy, ex, ey = map(float, match.groups()[:6])
                start = (x, y)
                start_tangent = (cx - x, cy - y)
                for tx, ty in re.findall(r'T([\d.]+) ([\d.]+)', match[7]):
                    cx, cy = 2 * ex - cx, 2 * ey - cy
                    ex, ey = float(tx), float(ty)
                self.assertEqual(start[0], 0)
                self.assertEqual(ex, self.tile_width)
                self.assertEqual(ey, start[1])
                self.assertEqual((ex - cx, ey - cy), start_tangent)
                if path.attrib.get('fill') != 'none':
                    self.assertEqual(match[8], 'V48H0Z')
                else:
                    self.assertIsNone(match[8])


if __name__ == '__main__':
    unittest.main()
