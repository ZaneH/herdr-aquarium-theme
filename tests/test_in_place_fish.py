"""Procedural tail pilots: fixed head/facing, no baked route, reproducible native clips."""
import hashlib
import importlib.util
import math
import struct
import tempfile
import unittest
from pathlib import Path
from PIL import Image, ImageFilter

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


EEL_EYE = (28, 31, 33, 37)  # x0,x1,y0,y1 measured on moray_eel-left.png
EEL_NEW_ASSETS = ('moray_eel-body-left.webp', 'moray_eel-body-right.webp',
                  'moray_eel-inplace-left.png', 'moray_eel-inplace-right.png',
                  'moray_eel-inplace-gold-left.png', 'moray_eel-inplace-gold-right.png')


def alpha_components(image, thresh):
    """4-connected component count of alpha >= thresh."""
    px = image.getchannel('A').load()
    seen = [[False] * 96 for _ in range(96)]
    count = 0
    for y in range(96):
        for x in range(96):
            if px[x, y] >= thresh and not seen[y][x]:
                count += 1
                stack = [(x, y)]
                seen[y][x] = True
                while stack:
                    cx, cy = stack.pop()
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < 96 and 0 <= ny < 96 and not seen[ny][nx] and px[nx, ny] >= thresh:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
    return count


def changed_opaque_pixels(frame, source):
    return sum(1 for y in range(96) for x in range(96)
               if source.load()[x, y][3] and frame.load()[x, y] != source.load()[x, y])


class EelBodyWaveTests(unittest.TestCase):
    """Moray eel body wave: separate profile, the 11 tail gates stay as they are."""

    def test_left_frames_match_approved_profile(self):
        with self.assertRaises(ValueError):
            prepare.body_wave_frames(Image.new('RGBA', (95, 96)))
        path = ROOT / 'mods/aquarium/assets/moray_eel-left.png'
        before = path.read_bytes()
        with Image.open(path) as handle:
            source = handle.convert('RGBA')
            frames = prepare.body_wave_frames(source)
            self.assertEqual(len(frames), 12)
            # Field period is 12 slots: rendering slot 12 wraps to frame 0.
            self.assertEqual(prepare.body_wave_frames(source, 13)[12], frames[0])
            # Max displacement is the 1.6 px amplitude everywhere.
            for x in range(96):
                for y in range(96):
                    self.assertLessEqual(prepare.eel_amplitude(x, y), 1.6 + 1e-9)
            # Head disc (eye box inside it) stays RGBA byte-exact in all frames.
            anchor, r0 = prepare.EEL['anchor'], prepare.EEL['r0']
            for frame in frames:
                pixels, sp = frame.load(), source.load()
                for y in range(96):
                    for x in range(96):
                        if math.hypot(x - anchor[0], y - anchor[1]) <= r0:
                            self.assertEqual(pixels[x, y], sp[x, y])
                for x in range(EEL_EYE[0], EEL_EYE[1] + 1):
                    for y in range(EEL_EYE[2], EEL_EYE[3] + 1):
                        self.assertEqual(pixels[x, y], sp[x, y])
                for perimeter in [(0, 0, 96, 1), (0, 95, 96, 96), (0, 0, 1, 96), (95, 0, 96, 96)]:
                    self.assertIsNone(frame.getchannel('A').crop(perimeter).getbbox())
            # Body really deforms: frame 0 differs from the still (travelling
            # wave), frames 1-11 move >= 200 opaque pixels, but the fixed head
            # rules out any rigid whole-image translation.
            changed = [changed_opaque_pixels(frame, source) for frame in frames]
            self.assertGreater(changed[0], 0)
            self.assertGreaterEqual(min(changed[1:]), 200)
            self.assertGreaterEqual(len({frame.tobytes() for frame in frames}), 8)
            # Connectivity is preserved at the meaningful alpha thresholds.
            for thresh in (16, 128):
                expected = alpha_components(source, thresh)
                for frame in frames:
                    self.assertEqual(alpha_components(frame, thresh), expected)
        self.assertEqual(path.read_bytes(), before)

    def test_committed_eel_assets_are_reproducible_and_timelines_match(self):
        originals = sorted((ROOT / 'mods/aquarium/assets').glob('moray_eel*.png')) + \
            sorted((ROOT / 'mods/aquarium/assets').glob('moray_eel*.webp'))
        hashes = {p: hashlib.sha256(p.read_bytes()).digest() for p in originals
                  if p.name not in EEL_NEW_ASSETS}
        with tempfile.TemporaryDirectory() as temp:
            prepare.build(temp)
            for name in EEL_NEW_ASSETS:
                generated = Path(temp) / name
                committed = ROOT / 'mods/aquarium/assets' / name
                self.assertEqual(generated.read_bytes(), committed.read_bytes(), name)
            for facing in ('left', 'right'):
                clip_path = Path(temp) / f'moray_eel-body-{facing}.webp'
                with Image.open(ROOT / 'mods/aquarium/assets/moray_eel-left.png') as src_handle:
                    source = src_handle.convert('RGBA')
                    mirrored = source.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                    intended = prepare.body_wave_frames(source)
                    if facing == 'right':
                        intended = [frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for frame in intended]
                    durations = frame_durations(clip_path)
                    with Image.open(clip_path) as clip:
                        self.assertTrue(clip.is_animated)
                        self.assertEqual(clip.size, (96, 96))
                        self.assertEqual(clip.info['loop'], 0)
                        # The encoder may coalesce identical consecutive frames;
                        # the decoded 12 x 100 ms timeline must match every slot.
                        self.assertEqual(sum(durations), 1200)
                        self.assertTrue(all(d > 0 and d % 100 == 0 for d in durations))
                        slot = 0
                        for i, duration in enumerate(durations):
                            clip.seek(i)
                            frame = clip.convert('RGBA')
                            for _ in range(duration // 100):
                                self.assertTrue(composited_equal(frame, intended[slot]),
                                                f'{facing} slot {slot}')
                                slot += 1
                        self.assertEqual(slot, 12)
                    # RIGHT is the mirror of LEFT: the head anchor sits at x=65
                    # and its disc stays byte-exact against the mirrored source.
                    if facing == 'right':
                        anchor, r0 = prepare.EEL['anchor'], prepare.EEL['r0']
                        for frame in intended:
                            pixels, sp = frame.load(), mirrored.load()
                            for y in range(96):
                                for x in range(96):
                                    if math.hypot(x - (95 - anchor[0]), y - anchor[1]) <= r0:
                                        self.assertEqual(pixels[x, y], sp[x, y])
        self.assertEqual(hashes, {p: hashlib.sha256(p.read_bytes()).digest() for p in hashes})

    def test_inplace_stills_and_golds_are_matched_mirrors(self):
        assets = ROOT / 'mods/aquarium/assets'
        flip = Image.Transpose.FLIP_LEFT_RIGHT
        with Image.open(assets / 'moray_eel-left.png') as normal, \
                Image.open(assets / 'moray_eel-left-gold.png') as gold:
            normal, gold = normal.convert('RGBA'), gold.convert('RGBA')
            with Image.open(assets / 'moray_eel-inplace-left.png') as left:
                self.assertEqual(left.convert('RGBA').tobytes(), normal.tobytes())
            with Image.open(assets / 'moray_eel-inplace-right.png') as right:
                self.assertEqual(right.convert('RGBA').tobytes(), normal.transpose(flip).tobytes())
            with Image.open(assets / 'moray_eel-inplace-gold-left.png') as left_gold:
                self.assertEqual(left_gold.convert('RGBA').tobytes(), gold.tobytes())
            with Image.open(assets / 'moray_eel-inplace-gold-right.png') as right_gold:
                self.assertEqual(right_gold.convert('RGBA').tobytes(), gold.transpose(flip).tobytes())
            # Gold keeps the normal pose/silhouette on both sides.
            self.assertEqual(gold.getchannel('A').tobytes(), normal.getchannel('A').tobytes())
            for thresh in (16, 128):
                self.assertEqual(alpha_components(gold, thresh), alpha_components(normal, thresh))


FIN_SPECIES = ('betta', 'fancy_goldfish', 'freshwater_angelfish')
FIN_NEW_ASSETS = tuple(f'{s}-fin-{f}.webp' for s in FIN_SPECIES for f in ('right', 'left'))


class FinFlowTests(unittest.TestCase):
    """Flowing fins: fixed torso/head core, bounded 2D warp, honest AA limits.

    Fine fin-thread connectivity is known to vary with antialiasing and is
    NOT preserved; the tests below check the cheaper dilation support instead.
    """

    def _core_pixels(self, prof):
        return [(x, y) for y in range(96) for x in range(96)
                if prepare.fin_influence(x, y, prof) <= 0]

    def test_fixed_core_bounded_displacement_and_unique_poses(self):
        for (species, facing), prof in prepare.FIN_PROFILES.items():
            path = ROOT / f'mods/aquarium/assets/{prof["file"]}'
            before = path.read_bytes()
            with Image.open(path) as handle:
                source = handle.convert('RGBA')
                frames = prepare.fin_frames(source, species, facing)
                self.assertEqual(len(frames), 12)
                # The warp repeats every 12 slots.
                self.assertEqual(prepare.fin_frames(source, species, facing, 13)[12], frames[0])
                # Displacement is bounded: weight * amp * |motion vector| <= 2 px.
                motion = prof['motion'](prof)
                for y in range(96):
                    for x in range(96):
                        d = prepare.fin_influence(x, y, prof)
                        w = prepare._smoothstep(d / prof['ramp']) if d > 0 else 0.0
                        ax, ay, _ = motion(x, y)
                        self.assertLessEqual(w * prof['amp'] * math.hypot(ax, ay), 2.0 + 1e-9)
                # The protected torso/head union stays RGBA byte-exact.
                core = self._core_pixels(prof)
                self.assertGreater(len(core), 500)
                sp = source.load()
                for frame in frames:
                    px = frame.load()
                    for x, y in core:
                        self.assertEqual(px[x, y], sp[x, y])
                    for perimeter in [(0, 0, 96, 1), (0, 95, 96, 96), (0, 0, 1, 96), (95, 0, 96, 96)]:
                        self.assertIsNone(frame.getchannel('A').crop(perimeter).getbbox())
                # The fins really flow: >= 8 visible states, frame 0 != still.
                self.assertGreaterEqual(len({frame.tobytes() for frame in frames}), 8)
                self.assertNotEqual(frames[0].tobytes(), source.tobytes())
            self.assertEqual(path.read_bytes(), before)

    def test_committed_fin_assets_are_reproducible_and_appendages_survive(self):
        sources = [ROOT / f'mods/aquarium/assets/{p["file"]}' for p in prepare.FIN_PROFILES.values()]
        hashes = {p: hashlib.sha256(p.read_bytes()).digest() for p in sources}
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'new' / 'frames'
            prepare.build(output)
            for name in FIN_NEW_ASSETS:
                generated = output / name
                committed = ROOT / 'mods/aquarium/assets' / name
                self.assertEqual(generated.read_bytes(), committed.read_bytes(), name)
                species, _, facing = name[:-5].partition('-fin-')
                prof = prepare.FIN_PROFILES[(species, facing)]
                with Image.open(ROOT / f'mods/aquarium/assets/{prof["file"]}') as src_handle:
                    source = src_handle.convert('RGBA')
                    intended = prepare.fin_frames(source, species, facing)
                durations = frame_durations(generated)
                with Image.open(generated) as clip:
                    self.assertTrue(clip.is_animated)
                    self.assertEqual(clip.size, (96, 96))
                    self.assertEqual(clip.info['loop'], 0)
                    # The encoder may coalesce identical consecutive frames; the
                    # decoded 12 x 100 ms timeline must match every intended slot.
                    self.assertEqual(sum(durations), 1200)
                    self.assertTrue(all(d > 0 and d % 100 == 0 for d in durations))
                    # Cheap dilation support: every opaque source appendage pixel
                    # is still represented (alpha >= 16) within 3 px after warp.
                    sp = source.getchannel('A')
                    slot = 0
                    for i, duration in enumerate(durations):
                        clip.seek(i)
                        frame = clip.convert('RGBA')
                        dilated = frame.getchannel('A').point(lambda a: 255 if a >= 16 else 0) \
                            .filter(ImageFilter.MaxFilter(7))
                        for _ in range(duration // 100):
                            self.assertTrue(composited_equal(frame, intended[slot]),
                                            f'{species} {facing} slot {slot}')
                            slot += 1
                        for y in range(96):
                            for x in range(96):
                                if sp.load()[x, y] >= 128:
                                    self.assertGreaterEqual(dilated.load()[x, y], 16)
                    self.assertEqual(slot, 12)
        self.assertEqual(hashes, {p: hashlib.sha256(p.read_bytes()).digest() for p in sources})

    def test_invalid_fin_dimensions_facing_and_species_are_rejected(self):
        cases = [(Image.new('RGBA', (10, 10)), 'betta', 'right'),
                 (Image.new('RGBA', (96, 96)), 'betta', 'up'),
                 (Image.new('RGBA', (96, 96)), 'seahorse', 'right')]
        for image, species, facing in cases:
            with self.assertRaises(ValueError):
                prepare.fin_frames(image, species, facing)
