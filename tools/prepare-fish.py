"""Run: uv run --with pillow python tools/prepare-fish.py /path/to/pack.zip"""
import io
import math
import sys
import zipfile
from pathlib import Path
from PIL import Image, ImageOps

OUT = Path(__file__).resolve().parents[1] / 'mods/aquarium/assets'
# Source models do not all share the same starting orientation.
RIGHT = {'largemouth_bass': 15, 'freshwater_angelfish': 0}


def route(turning):
    """12-second loop: two slow traversals, with a half-turn at each end."""
    poses = []
    for direction in (1, -1):
        facing = 0 if direction == 1 else 15
        for step in range(105):
            progress = step / 104
            x = 16 + (384 * (progress if direction == 1 else 1 - progress))
            y = 12 + 3 * math.sin(step / 104 * math.tau)
            poses.append((round(x), round(y), facing))
        for step in range(15):
            angle = (facing + step + 1) % 30 if turning else (facing + 15) % 30
            poses.append((400 if direction == 1 else 16, 12, angle))
    return poses


def floating_poses(turning):
    """Facing for two superimposed native drift loops, not a six-second U-turn."""
    for step in range(800):
        phase = math.tau * step / 800
        vx = 0.6 * math.sin(phase) - 0.8 * math.sin(2 * phase)
        # shortcut: facing and native drift are not phase-locked (#1); replace independent clocks before accepting movement.
        angle = round(math.atan2(0.12 * math.cos(phase), vx) * 30 / math.tau) % 30
        yield angle if turning else (0 if vx >= 0 else 15)


def prepare(archive):
    OUT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as pack:
        (OUT / 'LICENSE.txt').write_bytes(pack.read('LICENSE.txt'))
        sources = [name for name in pack.namelist()
                   if name.startswith('sprite/96px_studio/') and name.endswith('_nopalette.png')]
        assert len(sources) == 25, 'Expected the original 25-species pack'
        for source in sources:
            species = Path(source).name.removesuffix('_nopalette.png')
            sheet = Image.open(io.BytesIO(pack.read(source))).convert('RGBA')
            assert sheet.size == (768, 384)
            frames = [sheet.crop(((i % 8) * 96, (i // 8) * 96,
                                  (i % 8 + 1) * 96, (i // 8 + 1) * 96)) for i in range(30)]
            right = RIGHT.get(species, 22)
            fish = frames[right]
            fish.save(OUT / f'{species}.png')
            gold = ImageOps.colorize(ImageOps.grayscale(fish), '#60401c', '#fff0a5', mid='#dba849')
            gold.putalpha(fish.getchannel('A'))
            gold.save(OUT / f'{species}-gold.png')
            for turning in (False, True):
                poses = [frames[(right + angle) % 30] for angle in floating_poses(turning)]
                suffix = 'swim' if turning else 'glide'
                # Native floating buttons supply the travel; these clips only change facing.
                for speed, multiplier in [('', 1), ('-slow', 2)]:
                    poses[0].save(OUT / f'{species}-float-{suffix}{speed}.webp', save_all=True,
                                  append_images=poses[1:], duration=(40 + sum(map(ord, species)) % 26) * multiplier,
                                  loop=0, lossless=False, quality=82, method=3)
                animation = []
                for x, y, angle in route(turning):
                    canvas = Image.new('RGBA', (512, 128))
                    canvas.alpha_composite(frames[(right + angle) % 30], (x, y))
                    animation.append(canvas)
                # Phase-offset species so the entire school does not turn in unison.
                phase = sum(map(ord, species)) % len(animation)
                animation = animation[phase:] + animation[:phase]
                suffix = 'swim' if turning else 'glide'
                animation[0].save(OUT / f'{species}-{suffix}.webp', save_all=True,
                                  append_images=animation[1:], duration=50, loop=0,
                                  lossless=False, quality=82, method=3, minimize_size=False)
            print(f'Prepared {species}', flush=True)


if __name__ == '__main__':
    prepare(sys.argv[1])
