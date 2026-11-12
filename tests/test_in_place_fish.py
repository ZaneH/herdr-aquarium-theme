"""Procedural tail pilots: fixed head/facing, no baked route, reproducible native clips."""
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

SPECIES = ('clownfish', 'blue_tang')
FACINGS = (('right', ''), ('left', '-left'))


def body_box(species, facing):
    """Everything from the tail edge toward the head, which must stay verbatim."""
    edge = prepare.TAIL_EDGE[species][facing]
    return (edge, 0, 96, 96) if facing == 'right' else (0, 0, edge + 1, 96)


class InPlaceFishTests(unittest.TestCase):
    def test_tail_moves_without_changing_body_or_source(self):
        for species in SPECIES:
            for facing, suffix in FACINGS:
                path = ROOT / f'mods/aquarium/assets/{species}{suffix}.png'
                before = path.read_bytes()
                with Image.open(path) as source:
                    frames = prepare.tail_frames(source, facing, species)
                    body = body_box(species, facing)
                    self.assertEqual(len(frames), 12)
                    self.assertGreater(len({frame.tobytes() for frame in frames}), 2)
                    for frame in frames:
                        self.assertEqual(frame.crop(body).tobytes(), source.crop(body).tobytes())
                        self.assertEqual(frame.size, source.size)
                        for edge in [(0, 0, 96, 1), (0, 95, 96, 96), (0, 0, 1, 96), (95, 0, 96, 96)]:
                            self.assertIsNone(frame.getchannel('A').crop(edge).getbbox())
                self.assertEqual(path.read_bytes(), before)

    def test_native_clips_are_reproducible_and_keep_the_body_fixed(self):
        paths = [p for species in SPECIES for p in (ROOT / 'mods/aquarium/assets').glob(f'{species}*.png')]
        hashes = {p: hashlib.sha256(p.read_bytes()).digest() for p in paths}
        with tempfile.TemporaryDirectory() as temp:
            prepare.build(temp)
            for species in SPECIES:
                for facing, suffix in FACINGS:
                    generated = Path(temp) / f'{species}-tail-{facing}.webp'
                    committed = ROOT / 'mods/aquarium/assets' / generated.name
                    self.assertEqual(generated.read_bytes(), committed.read_bytes())
                    with Image.open(ROOT / f'mods/aquarium/assets/{species}{suffix}.png') as source, Image.open(generated) as clip:
                        edge = prepare.TAIL_EDGE[species][facing]
                        body = body_box(species, facing)
                        tail = (0, 0, edge, 96) if facing == 'right' else (edge + 1, 0, 96, 96)
                        moving_tail = set()
                        self.assertTrue(clip.is_animated)
                        self.assertEqual(clip.n_frames, 12)
                        self.assertEqual(clip.size, (96, 96))
                        self.assertEqual(clip.info['loop'], 0)
                        for i in range(clip.n_frames):
                            clip.seek(i)
                            frame = clip.convert('RGBA')
                            self.assertEqual(clip.info['duration'], 100)
                            moving_tail.add(frame.crop(tail).getchannel('A').tobytes())
                            for perimeter in [(0, 0, 96, 1), (0, 95, 96, 96), (0, 0, 1, 96), (95, 0, 96, 96)]:
                                self.assertIsNone(frame.getchannel('A').crop(perimeter).getbbox())
                            actual, expected = frame.crop(body), source.crop(body)
                            self.assertEqual(actual.getchannel('A').tobytes(), expected.getchannel('A').tobytes())
                            # Animated WebP may change invisible RGB under alpha=0, not visible body pixels.
                            for color in ['black', 'white']:
                                backing = Image.new('RGBA', actual.size, color)
                                self.assertEqual(Image.alpha_composite(backing, actual).tobytes(),
                                                 Image.alpha_composite(backing, expected).tobytes())
                        self.assertGreater(len(moving_tail), 2)
        self.assertEqual(hashes, {p: hashlib.sha256(p.read_bytes()).digest() for p in paths})

    def test_invalid_dimensions_facing_and_species_are_rejected(self):
        cases = [(Image.new('RGBA', (10, 10)), 'right', 'clownfish'),
                 (Image.new('RGBA', (96, 96)), 'up', 'clownfish'),
                 (Image.new('RGBA', (96, 96)), 'right', 'seahorse')]
        for image, facing, species in cases:
            with self.assertRaises(ValueError):
                prepare.tail_frames(image, facing, species)
