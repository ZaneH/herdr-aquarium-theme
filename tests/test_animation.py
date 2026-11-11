"""Run: uv run --with pillow python -m unittest discover -s tests"""
import importlib.util
import unittest
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prepare', ROOT / 'tools/prepare-fish.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class AnimationTests(unittest.TestCase):
    def test_route_uses_all_thirty_angles_and_returns_to_start(self):
        poses = prepare.route(True)
        self.assertEqual(len(poses), 240)
        self.assertEqual({angle for _, _, angle in poses}, set(range(30)))
        self.assertEqual(poses[0], poses[-1])
        self.assertEqual(min(x for x, _, _ in poses), 16)
        self.assertEqual(max(x for x, _, _ in poses), 400)
        self.assertTrue(all(0 <= x <= 416 and 0 <= y <= 32 for x, y, _ in poses))

    def test_instant_turns_have_only_two_opposite_views(self):
        self.assertEqual({a for _, _, a in prepare.route(False)}, {0, 15})

    def test_bubbles_have_moving_transparent_clips_and_paused_posters(self):
        for side in ('left', 'right'):
            path = ROOT / f'mods/aquarium/assets/bubbles-{side}'
            with Image.open(path.with_suffix('.webp')) as clip:
                self.assertTrue(clip.is_animated)
                self.assertEqual(clip.n_frames, 180)
                self.assertEqual(clip.size, (64, 384))
                first = clip.convert('RGBA')
                clip.seek(90)
                self.assertNotEqual(first.tobytes(), clip.convert('RGBA').tobytes())
                self.assertEqual(first.getpixel((0, 0))[3], 0)
            with Image.open(path.with_suffix('.png')) as poster:
                self.assertEqual(poster.tobytes(), first.tobytes())

    def test_all_twenty_five_species_have_valid_native_animations(self):
        files = list((ROOT / 'mods/aquarium/assets').glob('*-swim.webp'))
        self.assertEqual(len(files), 25)
        for path in files:
            for variant in (path, path.with_name(path.name.replace('-swim', '-glide'))):
                with Image.open(variant) as clip:
                    self.assertTrue(clip.is_animated)
                    self.assertEqual(clip.size, (512, 128))
                    self.assertEqual(clip.info['loop'], 0)
                    clip.seek(0)
                    first = clip.convert('RGBA').getbbox()
                    clip.seek(60)
                    self.assertNotEqual(first, clip.convert('RGBA').getbbox())


if __name__ == '__main__':
    unittest.main()
