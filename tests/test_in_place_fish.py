"""Procedural tail pilot: fixed head/facing, no baked route, reproducible native clips."""
import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('in_place', ROOT / 'tools/prepare-in-place-fish.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class InPlaceFishTests(unittest.TestCase):
    def test_tail_moves_without_changing_head_or_source(self):
        for facing, suffix in [('right', ''), ('left', '-left')]:
            path = ROOT / f'mods/aquarium/assets/clownfish{suffix}.png'
            before = path.read_bytes()
            with Image.open(path) as source:
                frames = prepare.tail_frames(source, facing)
                head = (48, 0, 96, 96) if facing == 'right' else (0, 0, 48, 96)
                self.assertEqual(len(frames), 12)
                self.assertGreater(len({frame.tobytes() for frame in frames}), 2)
                for frame in frames:
                    self.assertEqual(frame.crop(head).tobytes(), source.crop(head).tobytes())
                    self.assertEqual(frame.size, source.size)
                    for edge in [(0, 0, 96, 1), (0, 95, 96, 96), (0, 0, 1, 96), (95, 0, 96, 96)]:
                        self.assertIsNone(frame.getchannel('A').crop(edge).getbbox())
            self.assertEqual(path.read_bytes(), before)

    def test_native_clips_are_reproducible_and_keep_the_head_fixed(self):
        paths = list((ROOT / 'mods/aquarium/assets').glob('clownfish*.png'))
        hashes = {p: hashlib.sha256(p.read_bytes()).digest() for p in paths}
        with tempfile.TemporaryDirectory() as temp:
            prepare.build(temp)
            for facing, suffix in [('right', ''), ('left', '-left')]:
                generated = Path(temp) / f'clownfish-tail-{facing}.webp'
                committed = ROOT / 'mods/aquarium/assets' / generated.name
                self.assertEqual(generated.read_bytes(), committed.read_bytes())
                with Image.open(ROOT / f'mods/aquarium/assets/clownfish{suffix}.png') as source, Image.open(generated) as clip:
                    head = (48, 0, 96, 96) if facing == 'right' else (0, 0, 48, 96)
                    self.assertTrue(clip.is_animated)
                    self.assertEqual(clip.n_frames, 12)
                    self.assertEqual(clip.size, (96, 96))
                    self.assertEqual(clip.info['loop'], 0)
                    for i in range(clip.n_frames):
                        clip.seek(i)
                        frame = clip.convert('RGBA')
                        self.assertEqual(clip.info['duration'], 100)
                        actual, expected = frame.crop(head), source.crop(head)
                        self.assertEqual(actual.getchannel('A').tobytes(), expected.getchannel('A').tobytes())
                        # Animated WebP may change invisible RGB under alpha=0, not visible head pixels.
                        for color in ['black', 'white']:
                            backing = Image.new('RGBA', actual.size, color)
                            self.assertEqual(Image.alpha_composite(backing, actual).tobytes(),
                                             Image.alpha_composite(backing, expected).tobytes())
        self.assertEqual(hashes, {p: hashlib.sha256(p.read_bytes()).digest() for p in paths})

    def test_invalid_dimensions_and_facing_are_rejected(self):
        for image, facing in [(Image.new('RGBA', (10, 10)), 'right'), (Image.new('RGBA', (96, 96)), 'up')]:
            with self.assertRaises(ValueError):
                prepare.tail_frames(image, facing)
