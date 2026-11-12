"""Build one-species procedural 2D tail motion (not authored swimming).

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


def tail_frames(source, facing):
    """Shift tail columns vertically by integer pixels; never resample the head.

    Right-facing art has its tail on the left. The front half (including the
    middle column) is copied verbatim. Weight tapers linearly to zero at body.
    Integer shifts deliberately avoid blur; maximum displacement is two pixels.
    """
    if source.size != (SIZE, SIZE) or facing not in ('right', 'left'):
        raise ValueError('Expected a 96x96 portrait and right/left facing')
    source = source.convert('RGBA')
    frames = []
    for i in range(FRAME_COUNT):
        frame = source.copy()
        for x in range(SIZE):
            tail_distance = max(0, 48 - x) if facing == 'right' else max(0, x - 47)
            dy = round(2 * tail_distance / 48 * math.sin(math.tau * i / FRAME_COUNT))
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
    sheet = Image.new('RGBA', (SIZE * FRAME_COUNT, (SIZE + 20) * 2))
    draw = ImageDraw.Draw(sheet)
    for row, facing in enumerate(('right', 'left')):
        suffix = '' if facing == 'right' else '-left'
        with Image.open(ASSETS / f'clownfish{suffix}.png') as source:
            frames = tail_frames(source, facing)
        frames[0].save(output / f'clownfish-tail-{facing}.webp',
                       save_all=True, append_images=frames[1:], duration=FRAME_MS,
                       loop=0, lossless=True, exact=True, method=6)
        for i, frame in enumerate(frames):
            y = row * (SIZE + 20)
            draw.text((i * SIZE + 2, y + 2), f'{facing} {i}', fill='white')
            sheet.paste(frame, (i * SIZE, y + 20))
    sheet.save(output / 'contact-sheet.png')


if __name__ == '__main__':
    build(sys.argv[1])
