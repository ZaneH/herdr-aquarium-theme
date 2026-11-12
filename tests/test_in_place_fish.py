"""Procedural tail pilots: fixed head/facing, no baked route, reproducible native clips."""
import hashlib
import importlib.util
import struct
import tempfile
import unittest
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('in_place', ROOT / 'tools/prepare-in-place-fish.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)

SPECIES = ('clownfish', 'blue_tang', 'koi', 'largemouth_bass', 'rainbow_trout',
           'sockeye_salmon', 'piranha', 'swordfish', 'bluefin_tuna',
           'channel_catfish', 'anglerfish')
FACINGS = (('right', ''), ('left', '-left'))


def body_box(species, facing):
    """Everything from the tail edge toward the head, which must stay verbatim."""
    edge = prepare.TAIL_EDGE[species][facing]
    return (edge, 0, 96, 96) if facing == 'right' else (0, 0, edge + 1, 96)


def frame_durations(path):
    """Read ANMF durations; Pillow does not expose WebP frame durations."""
    data = path.read_bytes()
    durations, offset = [], 12
    while offset + 8 <= len(data):
        tag = data[offset:offset + 4]
        size = struct.unpack('<I', data[offset + 4:offset + 8])[0]
        if tag == b'ANMF':
            durations.append(int.from_bytes(data[offset + 20:offset + 23], 'little'))
        offset += 8 + size + (size & 1)
    return durations


def composited_equal(actual, expected):
    """WebP may change RGB under alpha=0; visible pixels must match exactly."""
    if actual.getchannel('A').tobytes() != expected.getchannel('A').tobytes():
        return False
    for color in ('black', 'white'):
        backing = Image.new('RGBA', actual.size, color)
        if (Image.alpha_composite(backing, actual).tobytes()
                != Image.alpha_composite(backing, expected).tobytes()):
            return False
    return True


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
                        intended = prepare.tail_frames(source, facing, species)
                        durations = frame_durations(generated)
                        moving_tail = set()
                        self.assertTrue(clip.is_animated)
                        self.assertEqual(clip.size, (96, 96))
                        self.assertEqual(clip.info['loop'], 0)
                        # The encoder may coalesce identical consecutive source frames
                        # into one longer frame. The 12 x 100 ms timeline must survive.
                        self.assertEqual(sum(durations), 1200)
                        self.assertTrue(all(d > 0 and d % 100 == 0 for d in durations))
                        slot = 0
                        for i, duration in enumerate(durations):
                            clip.seek(i)
                            frame = clip.convert('RGBA')
                            for _ in range(duration // 100):
                                expected_frame = intended[slot]
                                moving_tail.add(frame.crop(tail).getchannel('A').tobytes())
                                self.assertTrue(composited_equal(frame, expected_frame),
                                                f'{species} {facing} slot {slot}')
                                for perimeter in [(0, 0, 96, 1), (0, 95, 96, 96), (0, 0, 1, 96), (95, 0, 96, 96)]:
                                    self.assertIsNone(frame.getchannel('A').crop(perimeter).getbbox())
                                actual, expected = frame.crop(body), source.crop(body)
                                self.assertEqual(actual.getchannel('A').tobytes(), expected.getchannel('A').tobytes())
                                # Animated WebP may change invisible RGB under alpha=0, not visible body pixels.
                                for color in ['black', 'white']:
                                    backing = Image.new('RGBA', actual.size, color)
                                    self.assertEqual(Image.alpha_composite(backing, actual).tobytes(),
                                                     Image.alpha_composite(backing, expected).tobytes())
                                slot += 1
                        self.assertEqual(slot, 12)
                        self.assertGreater(len(moving_tail), 2)
        self.assertEqual(hashes, {p: hashlib.sha256(p.read_bytes()).digest() for p in paths})

    def test_invalid_dimensions_facing_and_species_are_rejected(self):
        cases = [(Image.new('RGBA', (10, 10)), 'right', 'clownfish'),
                 (Image.new('RGBA', (96, 96)), 'up', 'clownfish'),
                 (Image.new('RGBA', (96, 96)), 'right', 'seahorse')]
        for image, facing, species in cases:
            with self.assertRaises(ValueError):
                prepare.tail_frames(image, facing, species)
