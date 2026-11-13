"""Build per-species procedural 2D tail motion (not authored swimming).

Run: uv run --with pillow==11.3.0 python tools/prepare-in-place-fish.py OUTPUT_DIRECTORY
Only the output directory is written. Sources are existing CC0-derived portraits.
"""
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'mods/aquarium/assets'
SIZE = 96
FRAME_MS = 100
FRAME_COUNT = 12

# Last body column before the caudal fin, measured on each committed still.
# Clownfish art has its tail across the whole rear half. Blue tang is a
# conventional side view whose separate yellow fin is only about 24 columns
# wide; shearing its blue body would deform the palette mark and outline.
# Koi is also a clean side view: its forked caudal fin starts 22 columns from
# the rear edge, and the pelvic/anal fins beside it stay in the fixed body.
# The reviewed batch below adds conventional forked/lunate caudal fins whose
# peduncle is clear of other fins; each facing is measured on its own still.
TAIL_EDGE = {'clownfish': {'right': 48, 'left': 47},
             'blue_tang': {'right': 24, 'left': 71},
             'koi': {'right': 22, 'left': 73},
             'largemouth_bass': {'right': 22, 'left': 76},
             'rainbow_trout': {'right': 18, 'left': 77},
             'sockeye_salmon': {'right': 16, 'left': 79},
             'piranha': {'right': 23, 'left': 72},
             'swordfish': {'right': 14, 'left': 82},
             'bluefin_tuna': {'right': 21, 'left': 76},
             'channel_catfish': {'right': 21, 'left': 74},
             # Anglerfish: the caudal fin is narrow and its pelvic fin starts a
             # few columns inside the body, so the band must stop before it.
             'anglerfish': {'right': 20, 'left': 78}}


def tail_frames(source, facing, species='clownfish'):
    """Shift tail columns vertically by integer pixels; never resample the head.

    Right-facing art has its tail on the left. Everything from the tail edge
    toward the head is copied verbatim. Weight tapers linearly to zero at the
    body. Integer shifts deliberately avoid blur; maximum displacement is two
    pixels.
    """
    if source.size != (SIZE, SIZE) or facing not in ('right', 'left') or species not in TAIL_EDGE:
        raise ValueError('Expected a known species, a 96x96 portrait and right/left facing')
    edge = TAIL_EDGE[species][facing]
    reach = edge if facing == 'right' else SIZE - 1 - edge
    source = source.convert('RGBA')
    frames = []
    for i in range(FRAME_COUNT):
        frame = source.copy()
        for x in range(SIZE):
            tail_distance = max(0, edge - x) if facing == 'right' else max(0, x - edge)
            dy = round(2 * tail_distance / reach * math.sin(math.tau * i / FRAME_COUNT))
            if not dy:
                continue
            frame.paste((0, 0, 0, 0), (x, 0, x + 1, SIZE))
            # Crop rather than wrap. Existing portraits have ample transparent
            # vertical margin; the tests ensure no opaque perimeter is created.
            top, bottom = max(0, -dy), min(SIZE, SIZE - dy)
            frame.paste(source.crop((x, top, x + 1, bottom)), (x, top + dy))
        frames.append(frame)
    return frames


# Joint rotation keeps both shark caudal lobes coherent where column shear tore them.
# Each facing has its own root and four-column blend into the stationary trunk.
CAUDAL_PROFILES = {
    ('great_white_shark', 'right'): dict(
        file='great_white_shark.png', tail_side='L', root=(23.5, 42.0),
        preserve_x=25, full_x=21, amplitude_rad=0.062, region=(8, 27, 22, 53)),
    ('great_white_shark', 'left'): dict(
        file='great_white_shark-left.png', tail_side='R', root=(72.5, 58.5),
        preserve_x=71, full_x=75, amplitude_rad=0.085, region=(69, 87, 47, 75)),
    ('hammerhead_shark', 'right'): dict(
        file='hammerhead_shark.png', tail_side='L', root=(24.0, 55.5),
        preserve_x=25, full_x=21, amplitude_rad=0.07, region=(3, 27, 44, 67)),
    ('hammerhead_shark', 'left'): dict(
        file='hammerhead_shark-left.png', tail_side='R', root=(72.0, 54.0),
        preserve_x=71, full_x=75, amplitude_rad=0.072, region=(69, 92, 40, 64)),
}


def caudal_frames(source, species, facing, count=FRAME_COUNT):
    """Inverse-rotate the caudal silhouette about the peduncle root.

    Scalar angle = amplitude*sin(2*pi*i/12); the local angle is that times a
    smoothstep over the 4-column tailward attachment, zero at the trunk. The
    warp region is the only resampled area; outside it, and on zero-weight
    columns inside it, pixels are byte copies (frame starts as a copy of the
    source). Premultiplied bilinear over the 4 neighbours keeps anti-aliased
    edges halo-free; no source-alpha output gate, so contours gain and lose
    honestly. Frame 0 is the source still.
    """
    key = (species, facing)
    if source.size != (SIZE, SIZE) or key not in CAUDAL_PROFILES:
        raise ValueError('Expected a known shark, a 96x96 portrait and right/left facing')
    prof = CAUDAL_PROFILES[key]
    source = source.convert('RGBA')
    sp = source.load()
    x0, x1, y0, y1 = prof['region']
    rx, ry = prof['root']
    x_fix, x_full = prof['preserve_x'], prof['full_x']
    span = (x_fix - x_full) if prof['tail_side'] == 'L' else (x_full - x_fix)
    frames = []
    for i in range(count):
        theta = prof['amplitude_rad'] * math.sin(math.tau * i / FRAME_COUNT)
        frame = source.copy()
        po = frame.load()
        for qy in range(y0, y1 + 1):
            for qx in range(x0, x1 + 1):
                dist = (x_fix - qx) if prof['tail_side'] == 'L' else (qx - x_fix)
                wgt = _smoothstep(dist / span) if dist > 0 else 0.0
                if wgt == 0.0:
                    continue  # byte-exact preserved trunk
                th = wgt * theta
                dx, dy = qx - rx, qy - ry
                # inverse rotation: source position = R(-th) (q - root) + root
                sx = rx + math.cos(-th) * dx - math.sin(-th) * dy
                sy = ry + math.sin(-th) * dx + math.cos(-th) * dy
                if sx < 0 or sy < 0 or sx > SIZE - 1 or sy > SIZE - 1:
                    po[qx, qy] = (0, 0, 0, 0)
                    continue
                xi, yi = int(math.floor(sx)), int(math.floor(sy))
                fx, fy = sx - xi, sy - yi
                # premultiplied bilinear, same operation order as the reviewed
                # prototype: pm = rgb*(alpha/255), unpremultiply *255/alpha
                c0 = c1 = c2 = aa = 0.0
                for jj, wy in ((0, 1.0 - fy), (1, fy)):
                    for ii, wx in ((0, 1.0 - fx), (1, fx)):
                        wt = wx * wy
                        if wt == 0:
                            continue
                        r, g, b, a = sp[xi + ii, yi + jj]
                        f = a / 255.0
                        c0 += r * f * wt
                        c1 += g * f * wt
                        c2 += b * f * wt
                        aa += a * wt
                if aa < 0.5:
                    po[qx, qy] = (0, 0, 0, 0)
                else:
                    po[qx, qy] = (int(max(0, min(255, round(c0 * 255.0 / aa)))),
                                  int(max(0, min(255, round(c1 * 255.0 / aa)))),
                                  int(max(0, min(255, round(c2 * 255.0 / aa)))),
                                  int(round(aa)))
        frames.append(frame)
    return frames


# Approved moray-eel body wave. The plain moray_eel.png also faces left but is
# a different pose; the canonical SIDE still moray_eel-left.png is the only
# source. The right-facing loop is a mirror of the left frames, so a mirrored
# travelling wave still runs head-to-tail. Per-column vertical inverse
# displacement with premultiplied bilinear sampling: the eel body itself is
# allowed to deform (no caudal fin), only the head disc stays fixed.
EEL_SOURCE = 'moray_eel-left.png'
EEL_GOLD_SOURCE = 'moray_eel-left-gold.png'
EEL = dict(anchor=(30.0, 35.0), r0=14.0, r1=26.0, amp=1.6, wl=26.0)


def _smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def eel_amplitude(x, y):
    distance = math.hypot(x - EEL['anchor'][0], y - EEL['anchor'][1])
    return EEL['amp'] * _smoothstep((distance - EEL['r0']) / (EEL['r1'] - EEL['r0']))


def body_wave_frames(source, count=FRAME_COUNT):
    """Inverse-map each frame: out(x,y) = source(x, y - dy(x,y,i)).

    A travelling sine wave is nowhere zero at any instant, so frame 0 is
    deliberately not the source still (documented deviation, <= amp px);
    pixels inside the fixed head disc are copied byte-exact.
    """
    if source.size != (SIZE, SIZE):
        raise ValueError('Expected a 96x96 eel portrait')
    source = source.convert('RGBA')
    px = source.load()
    frames = []
    for i in range(count):
        frame = Image.new('RGBA', (SIZE, SIZE))
        po = frame.load()
        for y in range(SIZE):
            for x in range(SIZE):
                dy = eel_amplitude(x, y) * math.sin(
                    math.tau * i / FRAME_COUNT - math.tau * x / EEL['wl'])
                if abs(dy) < 1e-9:
                    po[x, y] = px[x, y]
                    continue
                sy = min(max(y - dy, 0.0), SIZE - 1.0001)
                y0 = int(sy)
                f = sy - y0
                # premultiplied bilinear between rows y0, y0+1 (no alpha halo)
                top, bot = [], []
                for dst, r in ((top, y0), (bot, min(y0 + 1, SIZE - 1))):
                    pr, pg, pb, pa = px[x, r]
                    dst.extend((pr * pa, pg * pa, pb * pa, pa))
                a = top[3] + f * (bot[3] - top[3])
                ai = int(round(a))
                po[x, y] = (0, 0, 0, 0) if ai == 0 else (
                    int(round((top[0] + f * (bot[0] - top[0])) / a)),
                    int(round((top[1] + f * (bot[1] - top[1])) / a)),
                    int(round((top[2] + f * (bot[2] - top[2])) / a)), ai)
        frames.append(frame)
    return frames


def build_eel(output):
    """Write the six eel assets: body-wave WebPs and matched side stills/golds.

    Stills are pixel copies/mirrors of the canonical side sources so a paused
    or finished eel never jumps between unrelated poses or faces backwards.
    """
    output = Path(output)
    left = body_wave_frames(Image.open(ASSETS / EEL_SOURCE))
    right = [ImageOps.mirror(frame) for frame in left]
    for facing, frames in (('left', left), ('right', right)):
        frames[0].save(output / f'moray_eel-body-{facing}.webp',
                       save_all=True, append_images=frames[1:], duration=FRAME_MS,
                       loop=0, lossless=True, exact=True, method=6)
    still = Image.open(ASSETS / EEL_SOURCE).convert('RGBA')
    gold = Image.open(ASSETS / EEL_GOLD_SOURCE).convert('RGBA')
    for name, image in (('inplace-left.png', still), ('inplace-right.png', ImageOps.mirror(still)),
                        ('inplace-gold-left.png', gold), ('inplace-gold-right.png', ImageOps.mirror(gold))):
        image.save(output / f'moray_eel-{name}')
    # Small phase sheet beside the tail contact sheet, same layout convention.
    sheet = Image.new('RGBA', (SIZE * 4, (SIZE + 20) * 2))
    draw = ImageDraw.Draw(sheet)
    for row, (facing, frames) in enumerate((('left', left), ('right', right))):
        for i, phase in enumerate((0, 3, 6, 9)):
            draw.text((i * SIZE + 2, row * (SIZE + 20) + 2), f'moray_eel {facing} {phase}', fill='white')
            sheet.paste(frames[phase], (i * SIZE, row * (SIZE + 20) + 20))
    sheet.save(output / 'contact-sheet-eel.png')


# Approved flowing-fin species (betta, fancy_goldfish, freshwater_angelfish):
# the torso ellipse + head disc stay byte-exact; outside that core a small
# 2D inverse warp with a per-species motion field and premultiplied bilinear
# sampling makes the fins flow. Still/gold fallbacks reuse the existing norm
# and gold PNG poses as-is (both facings already face correctly). The manta
# ray reuses the same engine with an optional motion region so its whiptail
# band stays byte-exact while the wings flex.
def _betta_motion(prof):
    tx = prof['torso'][0]
    def motion(x, y):
        return 0.3, 0.93, math.tau * prof['s'] * (x - tx) / 18.0
    return motion


def _goldfish_motion(prof):
    tx = prof['torso'][0]
    def motion(x, y):
        return 0.25, 1.0, math.tau * prof['s'] * (x - tx) / 20.0
    return motion


def _manta_region(x, y, prof):
    # Wings flap; the whiptail band (x0, x1, y0, y1) stays byte-exact so the
    # long thin tail and its dots are never resampled.
    x0, x1, y0, y1 = prof['tailband']
    if x0 <= x <= x1 and y0 <= y <= y1:
        return False
    return fin_influence(x, y, prof) > 0


def _manta_motion(prof):
    ty = prof['torso'][1]
    n = math.hypot(0.15, 0.99)

    def motion(x, y):
        # Mostly vertical wing flex; the unit vector bounds displacement.
        return 0.15 / n, 0.99 / n, math.tau * (y - ty) / 60.0
    return motion


def _angelfish_motion(prof):
    tx, ty, rx, ry = prof['torso']
    def motion(x, y):
        u, v = (x - tx) / rx, (y - ty) / ry
        if abs(v) > abs(u):
            # dorsal/anal triangles + ventral streamers: horizontal flapping
            return 0.99, 0.12, math.tau * (y - ty) / 22.0
        # caudal fan/streamers behind the disc: vertical wag, wave travels tailward
        return 0.14, 0.99, math.tau * prof['s'] * (x - tx) / 16.0
    return motion


# Reviewed torso/head bounds keep scales, faces and fin roots fixed.
# s = +1 for right-facing (tail at low x), -1 for left-facing (tail at high x).
FIN_PROFILES = {
    ('betta', 'right'): dict(
        file='betta.png', torso=(61, 44, 24, 11), head=(78, 43, 12),
        s=1.0, amp=2.0, ramp=2.75, motion=_betta_motion),
    ('betta', 'left'): dict(
        file='betta-left.png', torso=(35, 44, 24, 11), head=(18, 43, 12),
        s=-1.0, amp=2.0, ramp=2.75, motion=_betta_motion),
    ('fancy_goldfish', 'right'): dict(
        file='fancy_goldfish.png', torso=(60, 50, 22, 17), head=(78, 48, 13),
        s=1.0, amp=1.8, ramp=2.75, motion=_goldfish_motion),
    ('fancy_goldfish', 'left'): dict(
        file='fancy_goldfish-left.png', torso=(40, 50, 22, 17), head=(18, 48, 13),
        s=-1.0, amp=1.8, ramp=2.75, motion=_goldfish_motion),
    ('freshwater_angelfish', 'right'): dict(
        file='freshwater_angelfish.png', torso=(50, 46, 20, 17), head=(70, 44, 11),
        s=1.0, amp=2.0, ramp=2.75, motion=_angelfish_motion),
    ('freshwater_angelfish', 'left'): dict(
        file='freshwater_angelfish-left.png', torso=(46, 46, 20, 17), head=(26, 44, 11),
        s=-1.0, amp=2.0, ramp=2.75, motion=_angelfish_motion),
    # Manta ray: pectoral wings flap, whiptail band (tail + dots) byte-exact.
    ('manta_ray', 'right'): dict(
        file='manta_ray.png', torso=(59, 49, 15, 8), head=(75, 49, 7),
        tailband=(0, 43, 46, 53), amp=2.0, ramp=3.0,
        region=_manta_region, motion=_manta_motion),
    ('manta_ray', 'left'): dict(
        file='manta_ray-left.png', torso=(43, 49, 14, 8), head=(24, 49, 8),
        tailband=(55, 95, 46, 53), amp=2.0, ramp=3.0,
        region=_manta_region, motion=_manta_motion),
}


def fin_influence(x, y, prof):
    """Empirical head/torso falloff, not a physical distance.
    Nonpositive values protect the core; head falloff keeps the face quiet."""
    tx, ty, rx, ry = prof['torso']
    hx, hy, hr = prof['head']
    torso_gap = (math.sqrt((x - tx) ** 2 / rx ** 2 + (y - ty) ** 2 / ry ** 2) - 1.0) * min(rx, ry)
    head_gap = math.hypot(x - hx, y - hy) / hr - 1.0
    return min(torso_gap, head_gap)


def fin_frames(source, species, facing, count=FRAME_COUNT):
    """Inverse warp: out(x,y) = source(x - dx, y - dy); identity (byte copy)
    inside the protected core; premultiplied bilinear outside. A profile with
    a motion region (manta whiptail) also byte-copies pixels outside it. The
    travelling fin wave is never all-zero, so frame 0 is not the source still
    (documented eel-approved deviation). Max displacement is capped at 2 px."""
    key = (species, facing)
    if source.size != (SIZE, SIZE) or key not in FIN_PROFILES:
        raise ValueError('Expected a known fin species, a 96x96 portrait and right/left facing')
    prof = FIN_PROFILES[key]
    source = source.convert('RGBA')
    px = source.load()
    motion = prof['motion'](prof)
    amp, ramp = prof['amp'], prof['ramp']
    fields = []
    for y in range(SIZE):
        for x in range(SIZE):
            d = fin_influence(x, y, prof)
            w = _smoothstep(d / ramp) if d > 0 else 0.0
            region = prof.get('region')
            if region is not None and not region(x, y, prof):
                w = 0.0
            ax, ay, ph = motion(x, y)
            vec = math.hypot(ax, ay)
            assert amp * vec <= 2.0 + 1e-9, (amp, ax, ay)
            fields.append((w, ax * amp, ay * amp, ph))
    frames = []
    for i in range(count):
        theta = math.tau * i / FRAME_COUNT
        frame = Image.new('RGBA', (SIZE, SIZE))
        po = frame.load()
        k = 0
        for y in range(SIZE):
            for x in range(SIZE):
                w, ax, ay, ph = fields[k]; k += 1
                if w == 0.0:
                    po[x, y] = px[x, y]
                    continue
                s = w * math.sin(theta - ph)
                sx, sy = x - ax * s, y - ay * s
                sx = min(max(sx, 0.0), SIZE - 1.0001)
                sy = min(max(sy, 0.0), SIZE - 1.0001)
                x0, y0 = int(sx), int(sy)
                fx, fy = sx - x0, sy - y0
                x1, y1 = min(x0 + 1, SIZE - 1), min(y0 + 1, SIZE - 1)
                # premultiplied bilinear over 4 neighbours (no alpha halo)
                tr = [px[x0, y0], px[x1, y0], px[x0, y1], px[x1, y1]]
                prem = [(c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3]) for c in tr]
                wts = ((1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy)
                a = sum(p[3] * wt for p, wt in zip(prem, wts))
                ai = int(round(a))
                po[x, y] = (0, 0, 0, 0) if ai == 0 else (
                    int(round(sum(p[0] * wt for p, wt in zip(prem, wts)) / a)),
                    int(round(sum(p[1] * wt for p, wt in zip(prem, wts)) / a)),
                    int(round(sum(p[2] * wt for p, wt in zip(prem, wts)) / a)), ai)
        frames.append(frame)
    return frames


# The original flounder portraits face front/back; camera 0 in the existing
# lossy travel clip provides a clear right-facing pose, mirrored for the left.
# Load each frame before reading its duration; gold retains the source alpha.
FLOUNDER_CLIP = 'flounder-swim.webp'
FLOUNDER_TURN_SLOT = 112
FLOUNDER_PHASE = 143
FLOUNDER_CROP = (400, 12, 496, 108)


def flounder_canonical(output):
    """Write the 4 canonical flounder stills from the committed source clip
    and return the fresh normal stills for loop generation."""
    with Image.open(ASSETS / FLOUNDER_CLIP) as clip:
        target_ms = ((FLOUNDER_TURN_SLOT - FLOUNDER_PHASE) % 240) * 50
        start_ms = 0
        right = None
        for i in range(clip.n_frames):
            clip.seek(i)
            frame = clip.convert('RGBA')  # load before reading the duration
            duration = clip.info['duration']
            if start_ms <= target_ms < start_ms + duration:
                right = frame
                break
            start_ms += duration
        if right is None:
            raise ValueError(f'No frame covers {target_ms} ms in {FLOUNDER_CLIP}')
    right = right.crop(FLOUNDER_CROP)
    left = ImageOps.mirror(right)
    gold_right = ImageOps.colorize(ImageOps.grayscale(right), '#60401c', '#fff0a5',
                                   mid='#dba849')
    gold_right.putalpha(right.getchannel('A'))
    gold_left = ImageOps.mirror(gold_right)
    for name, image in (('inplace-right.png', right), ('inplace-left.png', left),
                        ('inplace-gold-right.png', gold_right),
                        ('inplace-gold-left.png', gold_left)):
        image.save(Path(output) / f'flounder-{name}')
    return {'right': right, 'left': left}


# Layered appendage loops (ocean_sunfish, pufferfish_inflated): the actual
# appendage pixels are split from the source once and ONLY that moving layer
# is warped; every other occupied source pixel is restored RGBA byte-exact afterwards,
# so fixed anatomy is never resampled, never leaks into gained contour and
# leaves no frozen fin outline. Profiles copy the reviewed finlayer concept.
# 'rootx'/'fanmax'/'fanmin' anchor the puffer at the actual fan root (17/78),
# not the old body junction (24/71), so the tail never opens a slit; 'base'
# is only the phase reference. Because the wave has a phase offset, frame 0
# is deliberately not the source still (same approved deviation as the eel).
LAYER_PROFILES = {
    ('ocean_sunfish', 'right'): dict(
        file='ocean_sunfish.png',
        torso=(49, 46, 37, 19), head=(74, 45, 12),
        bands=[(30, 48, 12, 31), (30, 48, 65, 84)],
        joints=[(38, 33), (38, 67)], ang=0.082, off=1.05,
        clavus=(11, 32, 29, 67)),
    ('ocean_sunfish', 'left'): dict(
        file='ocean_sunfish-left.png',
        torso=(47, 46, 37, 19), head=(22, 45, 12),
        bands=[(47, 65, 12, 31), (47, 65, 65, 84)],
        joints=[(57, 33), (56, 67)], ang=0.082, off=1.05,
        clavus=(67, 32, 85, 67)),
    ('pufferfish_inflated', 'right'): dict(
        file='pufferfish_inflated.png',
        poly=[(7, 32), (17, 32), (24, 43), (25, 62), (7, 62)],
        fanmax=17, rootx=17, base=24, amp=2.0, waglen=26.0,
        upperfin=(17, 36, 23, 37)),
    ('pufferfish_inflated', 'left'): dict(
        file='pufferfish_inflated-left.png',
        poly=[(88, 32), (78, 32), (71, 43), (70, 62), (88, 62)],
        fanmin=78, rootx=78, base=71, amp=2.0, waglen=26.0,
        upperfin=(59, 78, 23, 37)),
    # Recovered layered fans (mandarinfish/lionfish/silver_arowana below):
    # geometry recovered from the parent-approved worker art and re-derived
    # offline from the committed PNGs with pinned Pillow 11.3.0. 'rot' fans
    # rotate tangentially about a joint, 'sway' drags the veil horizontally,
    # 'dorsal' (seahorse) flutters the small dorsal fin about its root.
    ('mandarinfish', 'right'): dict(
        file='mandarinfish.png', mode='rot',
        poly=[(58, 56), (79, 56), (79, 75), (56, 75)],
        joint=(68, 55), ang=0.06, taper=5.0, dmax=1.5),
    ('mandarinfish', 'left'): dict(
        file='mandarinfish-left.png', mode='rot',
        poly=[(18, 58), (43, 58), (43, 77), (17, 77)],
        joint=(31, 57), ang=0.06, taper=5.0, dmax=1.5),
    ('lionfish', 'right'): dict(
        file='lionfish.png', mode='sway',
        poly=[(24, 57), (70, 57), (70, 82), (18, 82), (18, 63)],
        A=1.5, y0=55.0, rv=6.0, xa=24.0, xb=70.0, fw=6.0),
    ('lionfish', 'left'): dict(
        file='lionfish-left.png', mode='sway',
        poly=[(30, 57), (72, 57), (72, 82), (30, 82)],
        A=1.5, y0=55.0, rv=6.0, xa=30.0, xb=72.0, fw=6.0),
    ('silver_arowana', 'right'): dict(
        file='silver_arowana.png', mode='rot', capx=(None, 19),
        poly=[(2, 38), (10, 39), (18, 44), (22, 48), (18, 52), (9, 56), (2, 56)],
        joint=(20, 48), ang=0.065, taper=4.0, dmax=1.5),
    ('silver_arowana', 'left'): dict(
        file='silver_arowana-left.png', mode='rot', capx=(77, None), capy=(36, None),
        poly=[(93, 34), (93, 60), (78, 60), (73, 48), (78, 42), (81, 34)],
        joint=(75, 48), ang=0.065, taper=4.0, dmax=1.5),
    ('seahorse', 'right'): dict(
        file='seahorse.png', mode='dorsal', root=(35.0, 47.0), amp=0.07, feather=4.0,
        inbox=lambda x, y: x <= 35 and 36 <= y <= 55, rootdist=lambda x: 35.0 - x),
    ('seahorse', 'left'): dict(
        file='seahorse-left.png', mode='dorsal', root=(60.0, 47.0), amp=0.07, feather=4.0,
        inbox=lambda x, y: x >= 60 and 36 <= y <= 55, rootdist=lambda x: x - 60.0),
    # Flounder caudal fan: same 'dorsal' root-flex engine as the seahorse. The
    # moving mask is the genuine 127-px fan strictly behind the preserve plane
    # (x<=25 right / x>=70 left); the y<=49 cap keeps the three trailing-body
    # fringe pixels at y=50..52 static. Loop sources are the canonical stills
    # freshly generated from the committed source clip in build().
    ('flounder', 'right'): dict(
        file='flounder-inplace-right.png', mode='dorsal', root=(26.0, 48.0), amp=0.07, feather=4.0,
        inbox=lambda x, y: x <= 25 and y <= 49, rootdist=lambda x: 26.0 - x),
    ('flounder', 'left'): dict(
        file='flounder-inplace-left.png', mode='dorsal', root=(69.0, 48.0), amp=0.07, feather=4.0,
        inbox=lambda x, y: x >= 70 and y <= 49, rootdist=lambda x: x - 69.0),
}


def _padded_region(boxes_or_poly):
    m = Image.new('L', (SIZE, SIZE), 0)
    d = ImageDraw.Draw(m)
    if len(boxes_or_poly[0]) == 2:  # polygon
        d.polygon(boxes_or_poly, fill=255)
    else:  # band rects, padded 3 px like the reviewed concept
        for x0, x1, y0, y1 in boxes_or_poly:
            d.rectangle([x0 - 3, y0 - 3, x1 + 3, y1 + 3], fill=255)
    return m.filter(ImageFilter.MaxFilter(7)).load()


def _layer_mask(source, prof):
    """Moving mask = the actual appendage pixels + their AA fringe only.
    Sunfish: fin tissue inside the band rects, strictly outside the body
    (the pad alone would wrongly claim body/clavus fringe). Puffer: the fan
    is the only opaque content at/before the fan root column."""
    px = source.load()
    if 'bands' in prof:
        pad = _padded_region(prof['bands'])
        return [[px[x, y][3] > 0 and pad[x, y] and fin_influence(x, y, prof) > 0
                 and any(x0 <= x <= x1 and y0 <= y <= y1
                         for x0, x1, y0, y1 in prof['bands'])
                 for x in range(SIZE)] for y in range(SIZE)]
    if prof.get('mode') == 'dorsal':
        inbox = prof['inbox']
        return [[bool(px[x, y][3] > 0 and inbox(x, y)) for x in range(SIZE)]
                for y in range(SIZE)]
    if 'mode' in prof:
        # fan: genuine opaque fin pixels inside the polygon (+cap cuts)
        m = Image.new('L', (SIZE, SIZE), 0)
        ImageDraw.Draw(m).polygon(prof['poly'], fill=255)
        mp = m.load()
        cx0, cx1 = prof.get('capx', (None, None))
        cy0, cy1 = prof.get('capy', (None, None))
        mask = [[False] * SIZE for _ in range(SIZE)]
        for y in range(SIZE):
            for x in range(SIZE):
                ok = mp[x, y] > 0 and px[x, y][3] > 0
                if ok and ((cx0 is not None and x < cx0) or (cx1 is not None and x > cx1)
                           or (cy0 is not None and y < cy0) or (cy1 is not None and y > cy1)):
                    ok = False
                mask[y][x] = ok
        return mask
    limit = prof.get('fanmax')
    return [[px[x, y][3] > 0 and (x <= limit if limit is not None else x >= prof['fanmin'])
             for x in range(SIZE)] for y in range(SIZE)]


def _layer_fields(source, mask, prof):
    """Geometric fields on the padded support; static opaque pixels get no
    field (their warp output is transparent, restored by the static composite)."""
    px = source.load()
    fields = [None] * (SIZE * SIZE)
    maxd = 0.0
    mode = prof.get('mode')
    if mode in ('rot', 'sway'):
        # recovered fans: geometric field on the padded polygon support;
        # only the moving layer is sampled, so new coverage is genuine fin.
        pad = _padded_region(prof['poly'])
        for y in range(SIZE):
            for x in range(SIZE):
                if not pad[x, y]:
                    continue
                if mode == 'rot':
                    jx, jy = prof['joint']
                    rx_, ry_ = x - jx, y - jy
                    r = math.hypot(rx_, ry_)
                    d_ = min(prof['ang'] * r, prof['dmax']) * _smoothstep(r / prof['taper'])
                    maxd = max(maxd, d_)
                    if r > 0:
                        fields[y * SIZE + x] = (-ry_ / r, rx_ / r, 0.0, d_)
                else:
                    h = _smoothstep((x - prof['xa']) / prof['fw']) * _smoothstep((prof['xb'] - x) / prof['fw'])
                    d_ = prof['A'] * _smoothstep((y - prof['y0']) / prof['rv']) * h
                    maxd = max(maxd, d_)
                    fields[y * SIZE + x] = (1.0, 0.0, 0.0, d_)
        return fields, maxd
    if mode == 'dorsal':
        # seahorse: support is the dilated mask itself, minus protected
        # occupied source coords; tangential flutter about the fin root.
        m = Image.new('L', (SIZE, SIZE), 0)
        for y in range(SIZE):
            for x in range(SIZE):
                if mask[y][x]:
                    m.putpixel((x, y), 255)
        support = m.filter(ImageFilter.MaxFilter(7)).load()
        rx, ry = prof['root']
        for y in range(SIZE):
            for x in range(SIZE):
                if not support[x, y]:
                    continue
                if px[x, y][3] > 0 and not mask[y][x]:
                    continue  # protected bony trunk/head/tail
                w = _smoothstep(prof['rootdist'](x) / prof['feather'])
                dx, dy = x - rx, y - ry
                r = math.hypot(dx, dy)
                d_ = prof['amp'] * r * w
                maxd = max(maxd, d_)
                if r > 0 and d_ > 0:
                    fields[y * SIZE + x] = (-dy / r, dx / r, 0.0, d_)
        return fields, maxd
    if 'bands' in prof:  # sunfish: coherent tangential rotation per fin joint
        pad = _padded_region(prof['bands'])
        jd, ja, ang, off = prof['joints'][0], prof['joints'][1], prof['ang'], prof['off']
        for y in range(SIZE):
            for x in range(SIZE):
                if not pad[x, y] or fin_influence(x, y, prof) <= 0:
                    continue
                (jx, jy), ph = (jd, 0.0) if y < 46 else (ja, off)
                rx_, ry_ = x - jx, y - jy
                r = math.hypot(rx_, ry_)
                d_ = min(ang * r, 1.5) * _smoothstep(fin_influence(x, y, prof) / 3.0)
                maxd = max(maxd, d_)
                if r > 0:
                    fields[y * SIZE + x] = (-ry_ / r, rx_ / r, ph, d_)
    else:  # puffer: horizontal wag tapering to zero at the actual fan root
        pad = _padded_region(prof['poly'])
        for y in range(SIZE):
            for x in range(SIZE):
                if not pad[x, y] or (px[x, y][3] > 0 and not mask[y][x]):
                    continue  # outside support, or protected body slice
                d_ = prof['amp'] * _smoothstep(abs(x - prof['rootx']) / 4.0)
                maxd = max(maxd, d_)
                fields[y * SIZE + x] = (1.0, 0.0, math.tau * (x - prof['base']) / prof['waglen'], d_)
    return fields, maxd


def layer_frames(source, species, facing, count=FRAME_COUNT):
    """Warp ONLY the moving layer (premultiplied bilinear, same sampler order
    as the flowing fins), then restore the original protected pixels (every
    non-moving alpha>0 pixel) on top. Source alpha identifies anatomy; it is
    never used to clip the output, so the contour expands into transparent
    space honestly. Max displacement: 1.5 px sunfish / 2.0 px puffer."""
    key = (species, facing)
    if source.size != (SIZE, SIZE) or key not in LAYER_PROFILES:
        raise ValueError('Expected a known layer species, a 96x96 portrait and right/left facing')
    prof = LAYER_PROFILES[key]
    source = source.convert('RGBA')
    px = source.load()
    mask = _layer_mask(source, prof)
    fields, maxd = _layer_fields(source, mask, prof)
    assert maxd <= (1.5 if 'bands' in prof else 2.0) + 1e-9, maxd
    moving = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    mp = moving.load()
    for y in range(SIZE):
        for x in range(SIZE):
            if mask[y][x]:
                mp[x, y] = px[x, y]
    frames = []
    for i in range(count):
        theta = math.tau * i / FRAME_COUNT
        frame = Image.new('RGBA', (SIZE, SIZE))
        po = frame.load()
        k = 0
        for y in range(SIZE):
            for x in range(SIZE):
                f = fields[k]; k += 1
                if f is None or f[3] == 0.0:
                    po[x, y] = mp[x, y]
                    continue
                ax, ay, ph, d = f
                s = math.sin(theta - ph)
                sx, sy = x - ax * d * s, y - ay * d * s
                sx = min(max(sx, 0.0), SIZE - 1.0001)
                sy = min(max(sy, 0.0), SIZE - 1.0001)
                x0, y0 = int(sx), int(sy)
                fx, fy = sx - x0, sy - y0
                x1, y1 = min(x0 + 1, SIZE - 1), min(y0 + 1, SIZE - 1)
                tr = [mp[x0, y0], mp[x1, y0], mp[x0, y1], mp[x1, y1]]
                prem = [(c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3]) for c in tr]
                wts = ((1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy)
                a = sum(p[3] * wt for p, wt in zip(prem, wts))
                ai = int(round(a))
                po[x, y] = (0, 0, 0, 0) if ai == 0 else (
                    int(round(sum(p[0] * wt for p, wt in zip(prem, wts)) / a)),
                    int(round(sum(p[1] * wt for p, wt in zip(prem, wts)) / a)),
                    int(round(sum(p[2] * wt for p, wt in zip(prem, wts)) / a)), ai)
        for y in range(SIZE):
            for x in range(SIZE):
                if px[x, y][3] > 0 and not mask[y][x]:
                    po[x, y] = px[x, y]
        frames.append(frame)
    return frames


def build(output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    # Flounder stills are regenerated from the committed source clip in every
    # build, and the fresh canonical images are the loop inputs (never a
    # possibly stale committed copy). The public stem is -caudal- (the fin
    # prefix belongs to the IN_PLACE_FIN species).
    flounder_stills = flounder_canonical(output)
    for (species, facing), prof in LAYER_PROFILES.items():
        if species == 'flounder':
            frames = layer_frames(flounder_stills[facing], species, facing)
            stem = 'caudal'
        else:
            with Image.open(ASSETS / prof['file']) as source:
                frames = layer_frames(source, species, facing)
            stem = 'fin'
        frames[0].save(output / f'{species}-{stem}-{facing}.webp',
                       save_all=True, append_images=frames[1:], duration=FRAME_MS,
                       loop=0, lossless=True, exact=True, method=6)
    for (species, facing), prof in FIN_PROFILES.items():
        with Image.open(ASSETS / prof['file']) as source:
            frames = fin_frames(source, species, facing)
        frames[0].save(output / f'{species}-fin-{facing}.webp',
                       save_all=True, append_images=frames[1:], duration=FRAME_MS,
                       loop=0, lossless=True, exact=True, method=6)
    for (species, facing), prof in CAUDAL_PROFILES.items():
        with Image.open(ASSETS / prof['file']) as source:
            frames = caudal_frames(source, species, facing)
        frames[0].save(output / f'{species}-caudal-{facing}.webp',
                       save_all=True, append_images=frames[1:], duration=FRAME_MS,
                       loop=0, lossless=True, exact=True, method=6)
    rows = [(species, facing) for species in TAIL_EDGE for facing in ('right', 'left')]
    sheet = Image.new('RGBA', (SIZE * FRAME_COUNT, (SIZE + 20) * len(rows)))
    draw = ImageDraw.Draw(sheet)
    for row, (species, facing) in enumerate(rows):
        suffix = '' if facing == 'right' else '-left'
        with Image.open(ASSETS / f'{species}{suffix}.png') as source:
            frames = tail_frames(source, facing, species)
        frames[0].save(output / f'{species}-tail-{facing}.webp',
                       save_all=True, append_images=frames[1:], duration=FRAME_MS,
                       loop=0, lossless=True, exact=True, method=6)
        for i, frame in enumerate(frames):
            y = row * (SIZE + 20)
            draw.text((i * SIZE + 2, y + 2), f'{species} {facing} {i}', fill='white')
            sheet.paste(frame, (i * SIZE, y + 20))
    sheet.save(output / 'contact-sheet.png')
    build_eel(output)


if __name__ == '__main__':
    build(sys.argv[1])
