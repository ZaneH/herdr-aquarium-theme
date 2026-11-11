"""Build the original bubble art: uv run --with pillow python tools/prepare-bubbles.py"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / 'mods/aquarium/assets'


def bubble_frame(t, phase):
    image = Image.new('RGBA', (64, 384))
    draw = ImageDraw.Draw(image)
    for i in range(8):
        progress = (t + i / 8 + phase) % 1
        x = 32 + 15 * math.sin(i * 2.1 + progress * math.tau)
        y = 395 - progress * 420
        radius = 2 + i % 4
        alpha = round(105 * min(1, progress * 8, (1 - progress) * 8))
        draw.ellipse((x - radius, y - radius, x + radius, y + radius),
                     fill=(157, 224, 207, alpha // 12), outline=(183, 239, 228, alpha), width=1)
        draw.point((round(x - radius / 3), round(y - radius / 2)), fill=(230, 255, 250, alpha))
    return image


def prepare():
    OUT.mkdir(parents=True, exist_ok=True)
    for side, phase in [('left', 0), ('right', 0.37)]:
        frames = [bubble_frame(i / 180, phase) for i in range(180)]
        frames[0].save(OUT / f'bubbles-{side}.png')
        frames[0].save(OUT / f'bubbles-{side}.webp', save_all=True, append_images=frames[1:],
                       duration=50, loop=0, lossless=True, method=3)
        with Image.open(OUT / f'bubbles-{side}.webp') as clip:
            assert clip.is_animated and clip.n_frames == 180
            assert clip.size == (64, 384) and clip.info['loop'] == 0
        assert all(frame.getbbox() for frame in frames)
        assert frames[0].tobytes() != frames[90].tobytes()
    print('Prepared two native bubble streams and their paused posters')


if __name__ == '__main__':
    prepare()
