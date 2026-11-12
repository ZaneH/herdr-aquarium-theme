"""Build per-species procedural 2D tail motion (not authored swimming).

Run: uv run --with pillow==11.3.0 python tools/prepare-in-place-fish.py OUTPUT_DIRECTORY
Only the output directory is written. Sources are existing CC0-derived portraits.
"""
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

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


def build(output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
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
