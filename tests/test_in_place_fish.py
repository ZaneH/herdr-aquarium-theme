"""Procedural tail pilots: fixed head/facing, no baked route, reproducible native clips."""
import hashlib
import importlib.util
import math
import struct
import tempfile
import unittest
from pathlib import Path
from PIL import Image, ImageFilter, ImageOps

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


FIN_SPECIES = ('betta', 'fancy_goldfish', 'freshwater_angelfish', 'manta_ray')
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
                # The protected torso/head union stays RGBA byte-exact; the
                # manta's separately byte-exact tailband counts toward the bar
                # because its near-silhouette core is smaller.
                core = set(self._core_pixels(prof))
                x0, x1, y0, y1 = prof.get('tailband', (0, -1, 0, -1))
                core.update((x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1))
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

    def test_manta_tailband_stays_byte_exact(self):
        """Whiptail band (whip + dots) is RGBA byte-exact in every frame,
        checked over the whole declared box, not just outside the predicate."""
        for facing in ('right', 'left'):
            prof = prepare.FIN_PROFILES[('manta_ray', facing)]
            x0, x1, y0, y1 = prof['tailband']
            with Image.open(ROOT / f'mods/aquarium/assets/{prof["file"]}') as handle:
                source = handle.convert('RGBA')
                sp = source.load()
                frames = prepare.fin_frames(source, 'manta_ray', facing)
                self.assertEqual(len(frames), 12)
                for frame in frames:
                    px = frame.load()
                    for x in range(x0, x1 + 1):
                        for y in range(y0, y1 + 1):
                            self.assertEqual(px[x, y], sp[x, y])

    def test_invalid_fin_dimensions_facing_and_species_are_rejected(self):
        cases = [(Image.new('RGBA', (10, 10)), 'betta', 'right'),
                 (Image.new('RGBA', (96, 96)), 'betta', 'up'),
                 (Image.new('RGBA', (96, 96)), 'seahorse', 'right')]
        for image, species, facing in cases:
            with self.assertRaises(ValueError):
                prepare.fin_frames(image, species, facing)


CAUDAL_NEW_ASSETS = tuple(f'{s}-caudal-{f}.webp'
                          for s in ('great_white_shark', 'hammerhead_shark') for f in ('right', 'left'))


class CaudalJointTests(unittest.TestCase):
    """Shark caudal-joint loops: rotate the whole caudal silhouette about the
    measured peduncle root; the rejected column shear never returns."""

    def _outside_region(self, prof):
        x0, x1, y0, y1 = prof['region']
        return [(x, y) for y in range(96) for x in range(96)
                if not (x0 <= x <= x1 and y0 <= y <= y1)]

    def _forward_halfplane(self, prof):
        # L tail side preserves x >= preserve_x, R side preserves x <= preserve_x.
        fix = prof['preserve_x']
        return [(x, y) for y in range(96) for x in range(96)
                if (x >= fix if prof['tail_side'] == 'L' else x <= fix)]

    def test_joint_keeps_body_exact_and_moves_only_the_tail(self):
        for (species, facing), prof in prepare.CAUDAL_PROFILES.items():
            path = ROOT / f'mods/aquarium/assets/{prof["file"]}'
            before = path.read_bytes()
            with Image.open(path) as handle:
                source = handle.convert('RGBA')
                sp = source.load()
                frames = prepare.caudal_frames(source, species, facing)
                self.assertEqual(len(frames), 12)
                # Frame 0 is the source still; the field has period 12.
                self.assertEqual(frames[0].tobytes(), source.tobytes())
                self.assertEqual(prepare.caudal_frames(source, species, facing, 13)[12], frames[0])
                # >= 5 genuinely distinct visible states (sine symmetry gives 7).
                self.assertGreaterEqual(len({frame.tobytes() for frame in frames}), 5)
                # Displacement bound over actual tail tissue, not background.
                x0, x1, y0, y1 = prof['region']
                rmax = max(math.hypot(x - prof['root'][0], y - prof['root'][1])
                           for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)
                           if sp[x, y][3] > 16)
                self.assertLessEqual(prof['amplitude_rad'] * rmax, 2.0)
                # Head, trunk and every pixel outside the warp region: byte-exact.
                fixed = set(self._outside_region(prof)) | set(self._forward_halfplane(prof))
                for frame in frames:
                    px = frame.load()
                    for x, y in fixed:
                        self.assertEqual(px[x, y], sp[x, y])
                    for perimeter in [(0, 0, 96, 1), (0, 95, 96, 96), (0, 0, 1, 96), (95, 0, 96, 96)]:
                        self.assertIsNone(frame.getchannel('A').crop(perimeter).getbbox())
                # Genuine caudal contour: at both extremes the loop gains and
                # loses pixels against the source silhouette, inside the region only.
                region = Image.new('L', (96, 96), 0)
                region.paste(255, (x0, y0, x1 + 1, y1 + 1))
                src_a = source.getchannel('A').point(lambda a: 255 if a >= 16 else 0)
                for phase in (3, 9):
                    out_a = frames[phase].getchannel('A').point(lambda a: 255 if a >= 16 else 0)
                    gained = Image.composite(out_a, Image.new('L', (96, 96), 0), region)
                    lost = Image.composite(src_a, Image.new('L', (96, 96), 0), region)
                    gained_px = [(x, y) for y in range(96) for x in range(96)
                                 if gained.load()[x, y] and not src_a.load()[x, y]]
                    lost_px = [(x, y) for y in range(96) for x in range(96)
                               if lost.load()[x, y] and not out_a.load()[x, y]]
                    self.assertGreater(len(gained_px), 0)
                    self.assertGreater(len(lost_px), 0)
                    # Moved mass stays attached: every gained/lost pixel lies
                    # within 3 px (MaxFilter 7) of the opposite silhouette.
                    for support, pixels in ((src_a.filter(ImageFilter.MaxFilter(7)), gained_px),
                                            (out_a.filter(ImageFilter.MaxFilter(7)), lost_px)):
                        for x, y in pixels:
                            self.assertGreaterEqual(support.load()[x, y], 16)
                # The whole silhouette (both lobes, peduncle attachment) stays
                # one 4-connected component at the meaningful thresholds.
                for thresh in (16, 128):
                    expected = alpha_components(source, thresh)
                    for frame in frames:
                        self.assertEqual(alpha_components(frame, thresh), expected)
            self.assertEqual(path.read_bytes(), before)

    def test_committed_caudal_assets_are_reproducible_and_timelines_match(self):
        sources = [ROOT / f'mods/aquarium/assets/{p["file"]}' for p in prepare.CAUDAL_PROFILES.values()]
        hashes = {p: hashlib.sha256(p.read_bytes()).digest() for p in sources}
        with tempfile.TemporaryDirectory() as temp:
            prepare.build(temp)
            for name in CAUDAL_NEW_ASSETS:
                generated = Path(temp) / name
                committed = ROOT / 'mods/aquarium/assets' / name
                self.assertEqual(generated.read_bytes(), committed.read_bytes(), name)
                species, _, facing = name[:-5].partition('-caudal-')
                prof = prepare.CAUDAL_PROFILES[(species, facing)]
                with Image.open(ROOT / f'mods/aquarium/assets/{prof["file"]}') as src_handle:
                    source = src_handle.convert('RGBA')
                    intended = prepare.caudal_frames(source, species, facing)
                durations = frame_durations(generated)
                with Image.open(generated) as clip:
                    self.assertTrue(clip.is_animated)
                    self.assertEqual(clip.size, (96, 96))
                    self.assertEqual(clip.info['loop'], 0)
                    # The encoder may coalesce identical consecutive frames; the
                    # decoded 12 x 100 ms timeline must match every intended slot.
                    self.assertEqual(sum(durations), 1200)
                    self.assertTrue(all(d > 0 and d % 100 == 0 for d in durations))
                    slot = 0
                    for i, duration in enumerate(durations):
                        clip.seek(i)
                        frame = clip.convert('RGBA')
                        for _ in range(duration // 100):
                            self.assertTrue(composited_equal(frame, intended[slot]),
                                            f'{species} {facing} slot {slot}')
                            slot += 1
                    self.assertEqual(slot, 12)
        self.assertEqual(hashes, {p: hashlib.sha256(p.read_bytes()).digest() for p in sources})

    def test_invalid_caudal_dimensions_species_and_facing_are_rejected(self):
        cases = [(Image.new('RGBA', (10, 10)), 'great_white_shark', 'right'),
                 (Image.new('RGBA', (96, 96)), 'great_white_shark', 'up'),
                 (Image.new('RGBA', (96, 96)), 'silver_arowana', 'right')]
        for image, species, facing in cases:
            with self.assertRaises(ValueError):
                prepare.caudal_frames(image, species, facing)


LAYER_SPECIES = ('ocean_sunfish', 'pufferfish_inflated')
LAYER_NEW_ASSETS = tuple(f'{s}-fin-{f}.webp' for s in LAYER_SPECIES for f in ('right', 'left'))
# The recovered fan/dorsal batch (mandarinfish, lionfish, silver_arowana,
# seahorse) has its own gates below: frame 0 IS the source still (no phase
# offset), only 7 of 12 states are visibly distinct, and lionfish may merge
# its fringe component mid-cycle, so the Sun/Puf gates must not be applied.
RECOVERED_SPECIES = ('mandarinfish', 'lionfish', 'silver_arowana', 'seahorse')
RECOVERED_KEYS = tuple((s, f) for s in RECOVERED_SPECIES for f in ('right', 'left'))
RECOVERED_NEW_ASSETS = tuple(f'{s}-fin-{f}.webp' for s in RECOVERED_SPECIES for f in ('right', 'left'))
# Only these keys keep the Sun/Puf gates (bands/clavus/upperfin, phase offset).
OLD_LAYER_KEYS = tuple((s, f) for s in LAYER_SPECIES for f in ('right', 'left'))


def _layer_taps(x, y, field, theta):
    """Sampler taps of the layered warp, mirroring the reviewed generator."""
    ax, ay, ph, d = field
    s = math.sin(theta - ph)
    sx, sy = x - ax * d * s, y - ay * d * s
    sx = min(max(sx, 0.0), prepare.SIZE - 1.0001)
    sy = min(max(sy, 0.0), prepare.SIZE - 1.0001)
    x0, y0 = int(sx), int(sy)
    fx, fy = sx - x0, sy - y0
    x1, y1 = min(x0 + 1, 95), min(y0 + 1, 95)
    return ((x0, y0, (1 - fx) * (1 - fy)), (x1, y0, fx * (1 - fy)),
            (x0, y1, (1 - fx) * fy), (x1, y1, fx * fy))


def _sample_layer_taps(moving, taps):
    colors = [(moving.getpixel((x, y)), weight) for x, y, weight in taps]
    alpha = sum(color[3] * weight for color, weight in colors)
    if round(alpha) == 0:
        return (0, 0, 0, 0)
    rgb = tuple(round(sum(color[c] * color[3] * weight for color, weight in colors) / alpha)
                for c in range(3))
    return rgb + (round(alpha),)


class LayeredFinTests(unittest.TestCase):
    """Layered appendage loops: only the actual fin layer is warped, the
    protected body is restored byte-exact and never resampled."""

    def _parts(self, key):
        prof = prepare.LAYER_PROFILES[key]
        with Image.open(ROOT / f'mods/aquarium/assets/{prof["file"]}') as handle:
            source = handle.convert('RGBA')
        mask = prepare._layer_mask(source, prof)
        fields, maxd = prepare._layer_fields(source, mask, prof)
        moving = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
        mp, sp = moving.load(), source.load()
        for y in range(96):
            for x in range(96):
                if mask[y][x]:
                    mp[x, y] = sp[x, y]
        return prof, source, mask, fields, maxd, moving

    def _appendage_rects(self, prof, mask):
        if 'bands' in prof:  # dorsal and anal fin bands, padded clip rect
            return [(x0 - 4, y0 - 4, x1 + 4, y1 + 4) for x0, x1, y0, y1 in prof['bands']]
        px = [(x, y) for y in range(96) for x in range(96) if mask[y][x]]
        return [(min(p[0] for p in px) - 4, min(p[1] for p in px) - 4,
                 max(p[0] for p in px) + 4, max(p[1] for p in px) + 4)]

    def test_layer_split_bounds_and_protected_pixels(self):
        for key in OLD_LAYER_KEYS:
            prof, source, mask, fields, maxd, moving = self._parts(key)
            sp, mp = source.load(), moving.load()
            before = (ROOT / f'mods/aquarium/assets/{prof["file"]}').read_bytes()
            static_px = [(x, y) for y in range(96) for x in range(96)
                         if sp[x, y][3] > 0 and not mask[y][x]]
            self.assertGreater(sum(1 for y in range(96) for x in range(96) if mask[y][x]), 50)
            self.assertGreater(len(static_px), 500)
            # no protection in the moving input; no fin left in statics
            for x, y in static_px:
                self.assertEqual(mp[x, y][3], 0)
            for y in range(96):
                for x in range(96):
                    if mask[y][x]:
                        self.assertEqual(mp[x, y], sp[x, y])
            # approved displacement bounds: 1.5 px sunfish, 2.0 px puffer
            self.assertLessEqual(maxd, (1.5 if 'bands' in prof else 2.0) + 1e-9)
            frames = prepare.layer_frames(source, *key)
            self.assertEqual(len(frames), 12)
            # all protected pixels (head/body/clavus, shell/spikes/upper fin)
            # stay RGBA byte-exact in every frame, semi-alpha included.
            for frame in frames:
                fp = frame.load()
                for x, y in static_px:
                    self.assertEqual(fp[x, y], sp[x, y])
                for perimeter in [(0, 0, 96, 1), (0, 95, 96, 96), (0, 0, 1, 96), (95, 0, 96, 96)]:
                    self.assertIsNone(frame.getchannel('A').crop(perimeter).getbbox())
            # the clavus (sunfish) / upper cream fin (puffer) boxes keep
            # meaningful fixed pixels byte-exact.
            if 'upperfin' in prof:
                u0, u1, u2, u3 = prof['upperfin']
            else:  # clavus is stored (x0, y0, x1, y1)
                u0, u2, u1, u3 = prof['clavus']
            box_px = [(x, y) for y in range(u2, u3 + 1) for x in range(u0, u1 + 1)
                      if sp[x, y][3] > 0]
            self.assertGreater(len(box_px), 20)
            for frame in frames:
                for x, y in box_px:
                    self.assertEqual(frame.load()[x, y], sp[x, y])
            # frame 0 is deliberately not the still (phase offset, documented);
            # the field has period 12 and there are >= 5 visible states.
            self.assertNotEqual(frames[0].tobytes(), source.tobytes())
            self.assertEqual(prepare.layer_frames(source, *key, 13)[12], frames[0])
            self.assertGreaterEqual(len({frame.tobytes() for frame in frames}), 5)
            self.assertEqual((ROOT / f'mods/aquarium/assets/{prof["file"]}').read_bytes(), before)

    def test_new_pixels_come_only_from_the_fin_layer_and_gain_contour(self):
        for key in OLD_LAYER_KEYS:
            prof, source, mask, fields, maxd, moving = self._parts(key)
            sp, mp = source.load(), moving.load()
            frames = prepare.layer_frames(source, *key)
            rects = self._appendage_rects(prof, mask)
            gained = [0] * len(rects)
            for i, frame in enumerate(frames):
                theta = math.tau * i / 12
                fp = frame.load()
                for y in range(96):
                    for x in range(96):
                        if fp[x, y][3] >= 16 and sp[x, y][3] < 16:
                            for ri, (x0, y0, x1, y1) in enumerate(rects):
                                if x0 <= x <= x1 and y0 <= y <= y1:
                                    gained[ri] += 1
                                    break
                            # provenance: every sampler tap that carries any
                            # alpha reads the moving fin layer only, never
                            # fixed anatomy (ghost) or source-alpha gating.
                            f = fields[y * 96 + x]
                            self.assertIsNotNone(f)
                            self.assertGreater(f[3], 0)
                            taps = _layer_taps(x, y, f, theta)
                            self.assertEqual(fp[x, y], _sample_layer_taps(moving, taps))
                            for tx, ty, _wt in taps:
                                if not mask[ty][tx]:
                                    self.assertEqual(mp[tx, ty][3], 0)
            # each appendage honestly gains contour (not a checksum proxy)
            self.assertEqual(len(gained), 2 if 'bands' in prof else 1)
            for count in gained:
                self.assertGreater(count, 0)
            # dilated support: every opaque (a>=128) source pixel stays
            # represented within 3 px in every frame.
            src_a = source.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
            for frame in frames:
                dilated = frame.getchannel('A').point(lambda a: 255 if a >= 16 else 0) \
                    .filter(ImageFilter.MaxFilter(7))
                for y in range(96):
                    for x in range(96):
                        if src_a.load()[x, y]:
                            self.assertGreaterEqual(dilated.load()[x, y], 16)
            # silhouette component parity against the source at both
            # meaningful thresholds, honestly reported (no clamp to fake zero).
            for thresh in (16, 128):
                expected = alpha_components(source, thresh)
                for frame in frames:
                    self.assertEqual(alpha_components(frame, thresh), expected)

    def test_committed_layer_assets_are_reproducible_and_timelines_match(self):
        sources = [ROOT / f'mods/aquarium/assets/{p["file"]}' for p in prepare.LAYER_PROFILES.values()]
        hashes = {p: hashlib.sha256(p.read_bytes()).digest() for p in sources}
        with tempfile.TemporaryDirectory() as temp:
            prepare.build(temp)
            for name in LAYER_NEW_ASSETS:
                generated = Path(temp) / name
                committed = ROOT / 'mods/aquarium/assets' / name
                self.assertEqual(generated.read_bytes(), committed.read_bytes(), name)
                species, _, facing = name[:-5].partition('-fin-')
                prof = prepare.LAYER_PROFILES[(species, facing)]
                with Image.open(ROOT / f'mods/aquarium/assets/{prof["file"]}') as src_handle:
                    source = src_handle.convert('RGBA')
                    intended = prepare.layer_frames(source, species, facing)
                durations = frame_durations(generated)
                with Image.open(generated) as clip:
                    self.assertTrue(clip.is_animated)
                    self.assertEqual(clip.size, (96, 96))
                    self.assertEqual(clip.info['loop'], 0)
                    # encoded frames may coalesce; decoded timeline is 1200 ms
                    # and matches every intended 100 ms slot.
                    self.assertEqual(sum(durations), 1200)
                    self.assertTrue(all(d > 0 and d % 100 == 0 for d in durations))
                    slot = 0
                    for i, duration in enumerate(durations):
                        clip.seek(i)
                        frame = clip.convert('RGBA')
                        for _ in range(duration // 100):
                            self.assertTrue(composited_equal(frame, intended[slot]),
                                            f'{species} {facing} slot {slot}')
                            slot += 1
                    self.assertEqual(slot, 12)
        self.assertEqual(hashes, {p: hashlib.sha256(p.read_bytes()).digest() for p in sources})

    def test_invalid_layer_dimensions_species_and_facing_are_rejected(self):
        cases = [(Image.new('RGBA', (10, 10)), 'ocean_sunfish', 'right'),
                 (Image.new('RGBA', (96, 96)), 'ocean_sunfish', 'up'),
                 # flounder is a valid layer species now; koi is not one.
                 (Image.new('RGBA', (96, 96)), 'koi', 'right'),
                 (Image.new('RGBA', (96, 96)), 'clownfish', 'left')]
        for image, species, facing in cases:
            with self.assertRaises(ValueError):
                prepare.layer_frames(image, species, facing)


def _visible_states(frames):
    """Count visibly distinct frames; RGB under alpha 0 never counts."""
    keys = set()
    for frame in frames:
        black = Image.alpha_composite(Image.new('RGBA', frame.size, 'black'), frame)
        white = Image.alpha_composite(Image.new('RGBA', frame.size, 'white'), frame)
        keys.add((frame.getchannel('A').tobytes(), black.tobytes(), white.tobytes()))
    return len(keys)


class RecoveredFinTests(unittest.TestCase):
    """Recovered layered loops (mandarinfish/lionfish/silver_arowana fans and
    the seahorse dorsal flutter): the same layer_frames renderer with exact
    recovered geometry. Unlike Sun/Puf these have no phase offset, so frame 0
    IS the source still, only 7 of 12 states are visibly distinct, and the
    lionfish's inseparable fringe component may merge into the main silhouette
    mid-cycle, so component parity must not be falsely asserted for it."""

    def _parts(self, key):
        prof = prepare.LAYER_PROFILES[key]
        with Image.open(ROOT / f'mods/aquarium/assets/{prof["file"]}') as handle:
            source = handle.convert('RGBA')
        mask = prepare._layer_mask(source, prof)
        fields, maxd = prepare._layer_fields(source, mask, prof)
        moving = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
        mp, sp = moving.load(), source.load()
        for y in range(96):
            for x in range(96):
                if mask[y][x]:
                    mp[x, y] = sp[x, y]
        return prof, source, mask, fields, maxd, moving

    def test_recovered_split_protection_bounds_and_period(self):
        for key in RECOVERED_KEYS:
            prof, source, mask, fields, maxd, moving = self._parts(key)
            sp, mp = source.load(), moving.load()
            source_path = ROOT / f'mods/aquarium/assets/{prof["file"]}'
            before = source_path.read_bytes()
            static_px = [(x, y) for y in range(96) for x in range(96)
                         if sp[x, y][3] > 0 and not mask[y][x]]
            self.assertGreater(sum(1 for y in range(96) for x in range(96) if mask[y][x]), 50)
            self.assertGreater(len(static_px), 500)
            # moving input is zero at every protected coordinate; the moving
            # layer is a byte-exact copy of the source at mask coordinates.
            for x, y in static_px:
                self.assertEqual(mp[x, y][3], 0)
            for y in range(96):
                for x in range(96):
                    if mask[y][x]:
                        self.assertEqual(mp[x, y], sp[x, y])
            # approved bounds: fans capped at their dmax (1.5 px), seahorse at
            # its measured sub-1.25 px flutter; never above the 2 px cap.
            cap = prof.get('dmax', prof.get('A', 1.25))
            self.assertLessEqual(maxd, cap + 1e-9)
            self.assertLessEqual(maxd, 2.0 + 1e-9)
            frames = prepare.layer_frames(source, *key)
            self.assertEqual(len(frames), 12)
            # frame 0 is the source still (visible; phase-0 sine) and the
            # field has period 12. Only 7 states are visibly distinct.
            self.assertTrue(composited_equal(frames[0], source), key)
            self.assertEqual(prepare.layer_frames(source, *key, 13)[12], frames[0])
            self.assertEqual(_visible_states(frames), 7)
            # the fin is not left static and the source has binary alpha only;
            # any fractional alpha in the frames is honest interpolation AA.
            self.assertGreater(changed_opaque_pixels(frames[3], source), 0)
            self.assertLessEqual({sp[x, y][3] for y in range(96) for x in range(96)}, {0, 255})
            aa = {frames[i].load()[x, y][3] for i in range(1, 12)
                  for y in range(96) for x in range(96) if 0 < frames[i].load()[x, y][3] < 255}
            self.assertTrue(aa, 'no interpolated AA in any moving frame')
            for frame in frames:
                fp = frame.load()
                for x, y in static_px:
                    self.assertEqual(fp[x, y], sp[x, y])
                for perimeter in [(0, 0, 96, 1), (0, 95, 96, 96), (0, 0, 1, 96), (95, 0, 96, 96)]:
                    self.assertIsNone(frame.getchannel('A').crop(perimeter).getbbox())
            self.assertEqual(source_path.read_bytes(), before)

    def test_recovered_gain_contour_provenance_and_components(self):
        for key in RECOVERED_KEYS:
            prof, source, mask, fields, maxd, moving = self._parts(key)
            sp, mp = source.load(), moving.load()
            frames = prepare.layer_frames(source, *key)
            pixels = [(x, y) for y in range(96) for x in range(96) if mask[y][x]]
            x0, y0 = max(0, min(p[0] for p in pixels) - 4), max(0, min(p[1] for p in pixels) - 4)
            x1, y1 = min(95, max(p[0] for p in pixels) + 4), min(95, max(p[1] for p in pixels) + 4)
            src_a = source.getchannel('A').point(lambda a: 255 if a >= 16 else 0)
            gained = lost = 0
            for i in (3, 9):
                theta = math.tau * i / 12
                fp = frames[i].load()
                for y in range(y0, y1 + 1):
                    for x in range(x0, x1 + 1):
                        in_src, in_out = src_a.load()[x, y], fp[x, y][3] >= 16
                        if in_out and not in_src:
                            gained += 1
                            # provenance: every sampler tap that carries any
                            # alpha reads the moving fin layer only, never
                            # fixed anatomy and never a source-alpha gate.
                            f = fields[y * 96 + x]
                            self.assertIsNotNone(f)
                            self.assertGreater(f[3], 0)
                            taps = _layer_taps(x, y, f, theta)
                            self.assertEqual(fp[x, y], _sample_layer_taps(moving, taps))
                            for tx, ty, _wt in taps:
                                if not mask[ty][tx]:
                                    self.assertEqual(mp[tx, ty][3], 0)
                        elif in_src and not in_out:
                            lost += 1
            self.assertGreater(gained, 0)
            if prof['mode'] == 'dorsal':
                # sub-pixel flutter: AA keeps the old edge above the 16
                # threshold, so an honest loop may lose nothing at all.
                self.assertEqual(lost, 0)
            else:
                self.assertGreater(lost, 0)
            # every opaque (>=128) source pixel stays within 3 px (MaxFilter 7)
            # of alpha >= 16 in every frame.
            src_opaque = source.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
            for frame in frames:
                dilated = frame.getchannel('A').point(lambda a: 255 if a >= 16 else 0) \
                    .filter(ImageFilter.MaxFilter(7))
                for y in range(96):
                    for x in range(96):
                        if src_opaque.load()[x, y]:
                            self.assertGreaterEqual(dilated.load()[x, y], 16)
            # honest silhouette components at both thresholds: no species ever
            # grows components; the lionfish fringe can merge (2->1 right,
            # 3->2 left) because its anal/pelvic mass is inseparable.
            for thresh in (16, 128):
                expected = alpha_components(source, thresh)
                counts = {alpha_components(frame, thresh) for frame in frames}
                self.assertLessEqual(max(counts), expected)
                if key[0] == 'lionfish':
                    self.assertLess(min(counts), expected, 'fringe never merges')
                    self.assertGreaterEqual(min(counts), 1)
                else:
                    self.assertEqual(counts, {expected})

    def test_recovered_committed_assets_are_reproducible_and_timelines_match(self):
        sources = [ROOT / f'mods/aquarium/assets/{p["file"]}'
                   for (s, f), p in prepare.LAYER_PROFILES.items() if (s, f) in RECOVERED_KEYS]
        hashes = {p: hashlib.sha256(p.read_bytes()).digest() for p in sources}
        with tempfile.TemporaryDirectory() as temp:
            prepare.build(temp)
            for name in RECOVERED_NEW_ASSETS:
                generated = Path(temp) / name
                committed = ROOT / 'mods/aquarium/assets' / name
                self.assertEqual(generated.read_bytes(), committed.read_bytes(), name)
                species, _, facing = name[:-5].partition('-fin-')
                prof = prepare.LAYER_PROFILES[(species, facing)]
                with Image.open(ROOT / f'mods/aquarium/assets/{prof["file"]}') as src_handle:
                    source = src_handle.convert('RGBA')
                    intended = prepare.layer_frames(source, species, facing)
                durations = frame_durations(generated)
                with Image.open(generated) as clip:
                    self.assertTrue(clip.is_animated)
                    self.assertEqual(clip.size, (96, 96))
                    self.assertEqual(clip.info['loop'], 0)
                    self.assertEqual(sum(durations), 1200)
                    self.assertTrue(all(d > 0 and d % 100 == 0 for d in durations))
                    slot = 0
                    for i, duration in enumerate(durations):
                        clip.seek(i)
                        frame = clip.convert('RGBA')
                        for _ in range(duration // 100):
                            self.assertTrue(composited_equal(frame, intended[slot]),
                                            f'{species} {facing} slot {slot}')
                            slot += 1
                    self.assertEqual(slot, 12)
        self.assertEqual(hashes, {p: hashlib.sha256(p.read_bytes()).digest() for p in sources})

    def test_recovered_invalid_species_facing_and_size_are_rejected(self):
        for image, species, facing in [
                (Image.new('RGBA', (10, 10)), 'mandarinfish', 'right'),
                (Image.new('RGBA', (96, 96)), 'seahorse', 'up'),
                (Image.new('RGBA', (96, 96)), 'moray_eel', 'right')]:
            with self.assertRaises(ValueError):
                prepare.layer_frames(image, species, facing)


FLOUNDER_NEW_ASSETS = ('flounder-caudal-right.webp', 'flounder-caudal-left.webp',
                       'flounder-inplace-right.png', 'flounder-inplace-left.png',
                       'flounder-inplace-gold-right.png', 'flounder-inplace-gold-left.png')
FLOUNDER_ORIGINALS = ('flounder.png', 'flounder-left.png', 'flounder-gold.png',
                      'flounder-left-gold.png', 'flounder-swim.webp', 'flounder-glide.webp')
# The three trailing-body fringe pixels stay static: x=25 (right) / x=70 (left).
FLOUNDER_FRINGE_X = {'right': 25, 'left': 70}
# Outer tail window (x range, y 38..60) where the fan honestly gains/loses.
FLOUNDER_TIP = {'right': (9, 14), 'left': (82, 87)}


class FlounderCaudalTests(unittest.TestCase):
    """Flounder isolated caudal fan: same root-flex layer renderer as the
    seahorse dorsal, with the approved 127-pixel column-only mask and its
    y<=49 cap keeping the three trailing-body fringe pixels static."""

    def _parts(self, facing):
        prof = prepare.LAYER_PROFILES[('flounder', facing)]
        with Image.open(ROOT / f'mods/aquarium/assets/{prof["file"]}') as handle:
            source = handle.convert('RGBA')
        mask = prepare._layer_mask(source, prof)
        fields, maxd = prepare._layer_fields(source, mask, prof)
        moving = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
        mp, sp = moving.load(), source.load()
        for y in range(96):
            for x in range(96):
                if mask[y][x]:
                    mp[x, y] = sp[x, y]
        return prof, source, mask, fields, maxd, moving

    def test_canonical_stills_come_from_the_committed_clip(self):
        assets = ROOT / 'mods/aquarium/assets'
        originals = [assets / name for name in FLOUNDER_ORIGINALS]
        hashes = {p: hashlib.sha256(p.read_bytes()).digest() for p in originals}
        flip = Image.Transpose.FLIP_LEFT_RIGHT
        with tempfile.TemporaryDirectory() as temp:
            fresh = prepare.flounder_canonical(temp)
            for name in ('flounder-inplace-right.png', 'flounder-inplace-left.png',
                         'flounder-inplace-gold-right.png', 'flounder-inplace-gold-left.png'):
                self.assertEqual((Path(temp) / name).read_bytes(),
                                 (assets / name).read_bytes(), name)
            # left is the exact mirror of right; gold is the house colorize of
            # right with the original alpha; gold-left mirrors gold-right.
            right = Image.open(assets / 'flounder-inplace-right.png').convert('RGBA')
            left = Image.open(assets / 'flounder-inplace-left.png').convert('RGBA')
            gold = Image.open(assets / 'flounder-inplace-gold-right.png').convert('RGBA')
            gold_left = Image.open(assets / 'flounder-inplace-gold-left.png').convert('RGBA')
            self.assertEqual(left.tobytes(), right.transpose(flip).tobytes())
            self.assertEqual(gold_left.tobytes(), gold.transpose(flip).tobytes())
            self.assertEqual(gold.getchannel('A').tobytes(), right.getchannel('A').tobytes())
            expected = ImageOps.colorize(ImageOps.grayscale(right), '#60401c', '#fff0a5',
                                         mid='#dba849')
            expected.putalpha(right.getchannel('A'))
            self.assertEqual(gold.tobytes(), expected.convert('RGBA').tobytes())
            # the returned fresh stills are the ones the loops are built from
            self.assertEqual(fresh['right'].tobytes(), right.tobytes())
            self.assertEqual(fresh['left'].tobytes(), left.tobytes())
        self.assertEqual(hashes, {p: hashlib.sha256(p.read_bytes()).digest() for p in originals})

    def test_mask_is_exactly_127_and_body_fringe_stays_static(self):
        for facing in ('right', 'left'):
            prof, source, mask, fields, maxd, moving = self._parts(facing)
            sp, mp = source.load(), moving.load()
            # the approved column-only mask: exactly 127 genuine fan pixels,
            # never the three trailing-body fringe pixels behind the plane.
            self.assertEqual(sum(1 for y in range(96) for x in range(96) if mask[y][x]), 127)
            fx = FLOUNDER_FRINGE_X[facing]
            fringe = [(fx, y) for y in (50, 51, 52)]
            for x, y in fringe:
                self.assertGreater(sp[x, y][3], 0)
                self.assertFalse(mask[y][x])
            static_px = [(x, y) for y in range(96) for x in range(96)
                         if sp[x, y][3] > 0 and not mask[y][x]]
            self.assertGreater(len(static_px), 500)
            for x, y in static_px:
                self.assertEqual(mp[x, y][3], 0)  # zero body input to the sampler
            frames = prepare.layer_frames(source, 'flounder', facing)
            self.assertEqual(len(frames), 12)
            # protected body, forebody/head and the continuous fin fringe
            # (including those three pixels) stay RGBA byte-exact everywhere.
            for frame in frames:
                fp = frame.load()
                for x, y in static_px:
                    self.assertEqual(fp[x, y], sp[x, y])
                for perimeter in [(0, 0, 96, 1), (0, 95, 96, 96), (0, 0, 1, 96), (95, 0, 96, 96)]:
                    self.assertIsNone(frame.getchannel('A').crop(perimeter).getbbox())

    def test_fan_provenance_bounds_and_silhouette(self):
        for facing in ('right', 'left'):
            prof, source, mask, fields, maxd, moving = self._parts(facing)
            sp, mp = source.load(), moving.load()
            frames = prepare.layer_frames(source, 'flounder', facing)
            self.assertEqual(prepare.layer_frames(source, 'flounder', facing, 13)[12], frames[0])
            # approved 1.4616 px root-flex bound (never above the 2 px cap)
            self.assertLessEqual(maxd, 2.0 + 1e-9)
            # phase-0 sine: frame 0 is the source still, 7 visible states
            self.assertTrue(composited_equal(frames[0], source))
            self.assertEqual(_visible_states(frames), 7)
            # Check actual fin-layer provenance everywhere, including the root
            # where the rejected sampler copied body pixels into empty space.
            lo, hi = FLOUNDER_TIP[facing]
            src_a = source.getchannel('A').point(lambda a: 255 if a >= 16 else 0)
            for i, frame in enumerate(frames):
                theta = math.tau * i / 12
                fp = frame.load()
                gained = lost = 0
                for y in range(96):
                    for x in range(96):
                        in_src, in_out = src_a.load()[x, y], fp[x, y][3] >= 16
                        at_tip = lo <= x <= hi and 38 <= y <= 60
                        if in_out and not in_src:
                            gained += at_tip
                            f = fields[y * 96 + x]
                            self.assertIsNotNone(f)
                            self.assertGreater(f[3], 0)
                            taps = _layer_taps(x, y, f, theta)
                            self.assertEqual(fp[x, y], _sample_layer_taps(moving, taps))
                            for tx, ty, _wt in taps:
                                if not mask[ty][tx]:
                                    self.assertEqual(mp[tx, ty][3], 0)
                        elif in_src and not in_out:
                            lost += at_tip
                if i in (3, 9):
                    self.assertGreater(gained, 0)
                    self.assertGreater(lost, 0)
            # one connected silhouette (fan stays attached to the body) and
            # opaque-source MaxFilter-7 coverage at both thresholds.
            src_opaque = source.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
            for thresh in (16, 128):
                for frame in frames:
                    self.assertEqual(alpha_components(frame, thresh), 1)
                    dilated = frame.getchannel('A').point(lambda a: 255 if a >= 16 else 0) \
                        .filter(ImageFilter.MaxFilter(7))
                    for y in range(96):
                        for x in range(96):
                            if src_opaque.load()[x, y]:
                                self.assertGreaterEqual(dilated.load()[x, y], 16)

    def test_committed_flounder_assets_are_reproducible_and_timelines_match(self):
        assets = ROOT / 'mods/aquarium/assets'
        originals = [assets / name for name in FLOUNDER_ORIGINALS]
        hashes = {p: hashlib.sha256(p.read_bytes()).digest() for p in originals}
        with tempfile.TemporaryDirectory() as temp:
            prepare.build(temp)
            for name in FLOUNDER_NEW_ASSETS:
                generated = Path(temp) / name
                committed = assets / name
                self.assertEqual(generated.read_bytes(), committed.read_bytes(), name)
            for facing in ('right', 'left'):
                generated = Path(temp) / f'flounder-caudal-{facing}.webp'
                with Image.open(assets / f'flounder-inplace-{facing}.png') as handle:
                    source = handle.convert('RGBA')
                    intended = prepare.layer_frames(source, 'flounder', facing)
                durations = frame_durations(generated)
                with Image.open(generated) as clip:
                    self.assertTrue(clip.is_animated)
                    self.assertEqual(clip.size, (96, 96))
                    self.assertEqual(clip.info['loop'], 0)
                    self.assertEqual(sum(durations), 1200)
                    self.assertTrue(all(d > 0 and d % 100 == 0 for d in durations))
                    slot = 0
                    for i, duration in enumerate(durations):
                        clip.seek(i)
                        frame = clip.convert('RGBA')
                        for _ in range(duration // 100):
                            self.assertTrue(composited_equal(frame, intended[slot]),
                                            f'flounder {facing} slot {slot}')
                            slot += 1
                    self.assertEqual(slot, 12)
        self.assertEqual(hashes, {p: hashlib.sha256(p.read_bytes()).digest() for p in originals})
