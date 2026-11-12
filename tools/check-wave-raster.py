"""Offline SVG coverage QA (not GPUI acceptance).

Run: uv run --with pillow python tools/check-wave-raster.py --out /tmp/aquarium-wave-raster
Requires macOS sips with SVG support. No app/window access. Outputs pixel evidence
and contact sheets; translation uses Pillow's bicubic sampler, not GPUI's sampler.
"""
import argparse
import json
import math
import subprocess
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SCALES = (0.75, 1, 1.25, 1.5, 1.75, 2)
WIDTHS = (104, 720, 2560)


def check(out):
    out.mkdir(parents=True, exist_ok=True)
    source = ET.parse(ROOT / 'mods/aquarium/assets/surface.svg').getroot()
    records = []
    for scale in SCALES:
        # All selected scales give integral tile dimensions. Fractional animation
        # offsets below exercise subpixel sampling independently of tile size.
        count = math.ceil(max(WIDTHS) / 400) + 1
        strip = ET.Element('svg', xmlns='http://www.w3.org/2000/svg',
                           width=str(400 * count * scale), height=str(48 * scale),
                           viewBox=f'0 0 {400 * count} 48')
        for i in range(count):
            tile = ET.fromstring(ET.tostring(source))
            tile.set('x', str(i * 400))
            strip.append(tile)
        svg = out / f'strip-{scale}.svg'
        png = svg.with_suffix('.png')
        svg.write_bytes(ET.tostring(strip))
        subprocess.run(['sips', '-s', 'format', 'png', str(svg), '--out', str(png)],
                       check=True, capture_output=True)
        raster = Image.open(png).convert('RGBA')
        assert raster.size == (int(count * 400 * scale), int(48 * scale))
        # Compare actual raster pixels around a tile join with the same wave
        # phase inside a tile (the artwork repeats every 200 logical pixels).
        radius = round(4 * scale)
        def patch(x):
            center = round(x * scale)
            crop = raster.crop((center - radius, 0, center + radius, raster.height))
            background = Image.new('RGBA', crop.size, '#092b36')
            return Image.alpha_composite(background, crop).convert('RGB')
        seam_delta = max(high for low, high in ImageChops.difference(patch(400), patch(200)).getextrema())
        for width in WIDTHS:
            w, h = round(width * scale), round(48 * scale)
            sheet = Image.new('RGB', (w, (h + 20) * 5), '#092b36')
            draw = ImageDraw.Draw(sheet)
            minima = []
            for step in range(161):
                left = -40 + step / 4
                frame = raster.transform((w, h), Image.Transform.AFFINE,
                                         (1, 0, -left * scale, 0, 1, 0),
                                         Image.Resampling.BICUBIC)
                # Below both strokes, gradient fill should cover every column.
                # Transparent pixels above the wave and at the fade are intended.
                row = frame.getchannel('A').crop((0, round(28 * scale), w, round(28 * scale) + 1))
                minimum, maximum = row.getextrema()
                minima.append(minimum)
                if step % 40 == 0:
                    y = (step // 40) * (h + 20)
                    draw.text((0, y), f'scale={scale} width={width} left={left} (paused=-40)', fill='white')
                    sheet.paste(frame, (0, y + 20), frame)
                if minimum == 0:
                    raise AssertionError(f'uncovered fill column: scale={scale} width={width} left={left}')
            sheet.save(out / f'coverage-{scale}-{width}.png')
            records.append(dict(scale=scale, width=width, phases=161, seam_max_channel_delta=seam_delta,
                                fill_row_alpha_min=min(minima), fill_row_alpha_max=minima and max(minima)))
    (out / 'metrics.json').write_text(json.dumps(records, indent=2) + '\n')
    print(f'{len(records) * 161} sampled frames: no transparent fill-row columns; evidence: {out}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    check(parser.parse_args().out)
