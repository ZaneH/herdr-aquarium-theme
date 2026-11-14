"""Run: uv run --with pillow python -m unittest discover -s tests"""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prepare', ROOT / 'tools/prepare-fish.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
bubble_spec = importlib.util.spec_from_file_location('bubbles', ROOT / 'tools/prepare-bubbles.py')
bubbles = importlib.util.module_from_spec(bubble_spec)
bubble_spec.loader.exec_module(bubbles)


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
                background = Image.new('RGBA', poster.size, (13, 41, 53, 255))
                self.assertEqual(Image.alpha_composite(background, poster.convert('RGBA')).tobytes(),
                                 Image.alpha_composite(background, first).tobytes())

    def test_bubble_perimeters_and_pinned_reproducibility(self):
        with tempfile.TemporaryDirectory() as directory:
            original = bubbles.OUT
            try:
                bubbles.OUT = Path(directory)
                bubbles.prepare()
                for side in ('left', 'right'):
                    for extension in ('png', 'webp'):
                        name = f'bubbles-{side}.{extension}'
                        self.assertEqual((bubbles.OUT / name).read_bytes(),
                                         (ROOT / 'mods/aquarium/assets' / name).read_bytes())
                    with Image.open(bubbles.OUT / f'bubbles-{side}.webp') as clip:
                        for frame in range(clip.n_frames):
                            clip.seek(frame)
                            alpha = clip.convert('RGBA').getchannel('A')
                            w, h = alpha.size
                            for box in ((0, 0, w, 1), (0, h - 1, w, h),
                                        (0, 0, 1, h), (w - 1, 0, w, h)):
                                self.assertIsNone(alpha.crop(box).getbbox(), (side, frame, box))
            finally:
                bubbles.OUT = original

    def test_floating_species_have_static_directional_poses_and_matching_gold_alpha(self):
        assets = ROOT / 'mods/aquarium/assets'
        files = list(assets.glob('*-left-gold.png'))
        self.assertEqual(len(files), 25)
        self.assertEqual(list(assets.glob('*-float-*.webp')), [])
        for path in files:
            species = path.name.removesuffix('-left-gold.png')
            for direction in ('', '-left'):
                with Image.open(assets / f'{species}{direction}.png') as normal, \
                        Image.open(assets / f'{species}{direction}-gold.png') as gold:
                    self.assertEqual(normal.size, (96, 96))
                    self.assertEqual(gold.size, normal.size)
                    self.assertEqual(getattr(normal, 'n_frames', 1), 1)
                    self.assertEqual(normal.getchannel('A').tobytes(), gold.getchannel('A').tobytes())
                    self.assertIsNotNone(normal.getbbox())

    def test_all_twenty_five_species_have_valid_native_animations(self):
        files = [p for p in (ROOT / 'mods/aquarium/assets').glob('*-swim.webp') if '-float-' not in p.name]
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
