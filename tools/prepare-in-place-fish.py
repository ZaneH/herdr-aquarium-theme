"""Build per-species procedural 2D tail motion (not authored swimming).

Run: uv run --with pillow==11.3.0 python tools/prepare-in-place-fish.py OUTPUT_DIRECTORY
Only the output directory is written. Sources are existing CC0-derived portraits.
"""
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw

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
TAIL_EDGE = {'clownfish': {'right': 48, 'left': 47},
             'blue_tang': {'right': 24, 'left': 71},
             'koi': {'right': 22, 'left': 73}}


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


if __name__ == '__main__':
    build(sys.argv[1])
