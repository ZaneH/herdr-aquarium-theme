#!/usr/bin/env python3
"""Render original Gallery promotional art, not a screenshot (issue #9).

Run: uv run --offline --with pillow==11.3.0 python tools/prepare-preview.py
Only Pillow and the bundled SIL OFL fonts are required. See docs/gallery-direction.md.
"""
import hashlib
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "tools/fonts"
SIZE = (1600, 1000)  # Gallery .shot is 16:10, cover, top left.
SS = 2
SOURCE = ROOT / "docs/preview-source-live.png"
EXPECTED = "86b6df54cc69dc3f6b2eacb198d94c7dbf48fc472d97f7882ee19f794e599003"
ARCHIVE = ROOT / "docs/preview-source.png"
ARCHIVE_SHA = "a42938f0b68b94a14a528c9164ece2a7958a107d9487749a417bafd171c7846c"
# Same-species, smaller children communicate a real product feature, not telemetry.
FAMILY = ((1130, 493, 620, -9), (1370, 674, 238, -17), (1210, 760, 156, -12))


def path(draw, commands, fill=None, stroke=None, width=1):
    """Sample cubic outlines at final supersampled resolution; no SVG dependency."""
    points = []
    for command in commands:
        if len(command) == 2:
            points.append(command)
        else:
            x0, y0 = points[-1]
            x1, y1, x2, y2, x3, y3 = command
            for step in range(1, 33):
                t = step / 32
                u = 1 - t
                points.append((u**3*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t**3*x3,
                               u**3*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t**3*y3))
    scaled = [(round(x*SS), round(y*SS)) for x, y in points]
    if fill is not None:
        draw.polygon(scaled, fill=fill)
    if stroke is not None:
        draw.line(scaled, fill=stroke, width=round(width*SS), joint="curve")


def vertical(size, stops):
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)
    for y in range(size[1]):
        t = y / max(1, size[1]-1)
        for (a, c0), (b, c1) in zip(stops, stops[1:]):
            if t <= b:
                mix = max(0, (t-a)/(b-a))
                color = tuple(round(p+(q-p)*mix) for p, q in zip(c0, c1))
                draw.line((0, y, size[0], y), fill=color)
                break
    return image


def water():
    # Low-resolution analytical light field is smoothly resampled, never noisy.
    small = Image.new("RGB", (400, 250))
    pixels = []
    for y in range(250):
        for x in range(400):
            light = math.exp(-(((x-326)/171)**2 + ((y+28)/156)**2))
            side = math.exp(-(((x-390)/160)**2 + ((y-155)/145)**2))
            pixels.append((round(5+115*light+3*side), round(43+174*light+35*side),
                           round(62+133*light+26*side)))
    small.putdata(pixels)
    canvas = small.resize((SIZE[0]*SS, SIZE[1]*SS), Image.Resampling.BICUBIC).convert("RGBA")
    rays = Image.new("RGBA", canvas.size)
    d = ImageDraw.Draw(rays)
    for x, w, alpha in ((925, 100, 17), (1150, 50, 26), (1370, 200, 24)):
        path(d, [(x, -40), (x+w, -40), (x-140, 900), (x-400, 900)], (215, 255, 222, alpha))
    canvas = Image.alpha_composite(canvas, rays.filter(ImageFilter.GaussianBlur(23*SS)))
    # Broad elliptical surface reflections sit behind all subjects and lettering.
    surface = Image.new("RGBA", canvas.size)
    d = ImageDraw.Draw(surface)
    for y, alpha in ((-90, 35), (-58, 19), (-22, 12)):
        path(d, [(680, y+70), (900, y+170, 1370, y+210, 1670, y+38)],
             stroke=(208, 255, 229, alpha), width=2)
    return Image.alpha_composite(canvas, surface)


def habitat(canvas):
    d = ImageDraw.Draw(canvas)
    for shape, top, bottom in (
        ([(0, 953), (530, 907, 1030, 796, 1600, 828), (1600, 1000), (0, 1000)],
         (73, 147, 141), (27, 96, 109)),
        ([(0, 1000), (720, 970, 1180, 805, 1600, 850), (1600, 1000)],
         (140, 191, 164), (67, 134, 130)),
        ([(660, 1000), (1080, 886, 1320, 893, 1600, 912), (1600, 1000)],
         (198, 214, 175), (142, 180, 154)),
    ):
        mask = Image.new("L", canvas.size)
        path(ImageDraw.Draw(mask), shape, 255)
        gradient = vertical(canvas.size, [(0, top), (.8, top), (1, bottom)])
        canvas.paste(gradient, (0, 0), mask)
    # Receding blades, deliberately low contrast to keep attention on the family.
    for x, h in ((1455, 285), (1512, 365), (1575, 245)):
        path(d, [(x, 880), (x-60, 810, x-100, 880-h, x-28, 880-h),
                 (x-73, 880-h+110, x+20, 795, x, 880)], (59, 144, 133, 255))
    return canvas


def clownfish():
    """Original smooth illustration: shaded orange, pearl bands, translucent fins."""
    size = (600*SS, 380*SS)
    fish = Image.new("RGBA", size)
    d = ImageDraw.Draw(fish)
    navy = (27, 74, 75, 255)
    # Rear fins and tail are drawn before the body, with purposeful curved rays.
    fins = [
        [(183, 181), (134, 162, 93, 117, 39, 115), (61, 155, 61, 214, 36, 248),
         (100, 253, 139, 216, 183, 213), (183, 181)],
        [(194, 129), (211, 65, 260, 35, 296, 72), (320, 39, 358, 63, 374, 92),
         (406, 76, 432, 101, 444, 131), (194, 129)],
        [(247, 241), (255, 296, 295, 321, 338, 291), (369, 286, 384, 256, 383, 237), (247, 241)],
    ]
    fin_color = vertical(size, [(0, (252, 198, 120)), (.32, (242, 141, 71)),
                                (.66, (211, 110, 61)), (1, (86, 123, 105))])
    for shape in fins:
        mask = Image.new("L", size)
        path(ImageDraw.Draw(mask), shape, 255)
        fish.paste(fin_color, (0, 0), mask)
        path(d, shape, stroke=(44, 93, 89, 255), width=2)
    for i in range(8):
        path(d, [(171, 196), (118, 178+i*4, 84, 142+i*12, 50, 126+i*15)],
             stroke=(255, 194, 110, 170), width=1.5)
        path(d, [(212+i*27, 140), (218+i*24, 111, 228+i*22, 83, 241+i*23, 70+i*5)],
             stroke=(255, 188, 95, 160), width=1.4)
        path(d, [(268+i*12, 247), (274+i*12, 264, 288+i*10, 282, 299+i*9, 291-i*3)],
             stroke=(255, 190, 116, 170), width=1.3)
    body = [(147, 193), (184, 112, 285, 94, 374, 117),
            (435, 126, 475, 147, 492, 177), (512, 182, 529, 190, 515, 201),
            (501, 205, 513, 217, 496, 224), (448, 263, 375, 277, 291, 264),
            (217, 260, 179, 229, 147, 208), (147, 193)]
    mask = Image.new("L", size)
    path(ImageDraw.Draw(mask), body, 255)
    shade = vertical(size, [(0, (255, 234, 154)), (.30, (255, 197, 106)),
                            (.44, (255, 158, 67)), (.57, (245, 115, 47)),
                            (.72, (167, 78, 45)), (1, (38, 102, 104))]).convert("RGBA")
    fish.paste(shade, (0, 0), mask)
    # Pearl bands are clipped to the body; their charcoal rims follow the curvature.
    bands = Image.new("RGBA", size)
    bd = ImageDraw.Draw(bands)
    for shape in (
        [(194, 105), (166, 156, 191, 220, 213, 262), (241, 272),
         (223, 216, 215, 161, 236, 111), (194, 105)],
        [(303, 102), (279, 150, 304, 183, 287, 213), (268, 243, 287, 269, 286, 280),
         (337, 282), (339, 252, 323, 229, 339, 205), (357, 181, 324, 147, 355, 111), (303, 102)],
        [(432, 126), (410, 162, 413, 219, 430, 255), (464, 241),
         (449, 212, 447, 169, 464, 145), (432, 126)],
    ):
        path(bd, shape, (231, 246, 216, 255), navy, 6)
    pearl = vertical(size, [(0, (255, 255, 235)), (.35, (255, 253, 228)),
                            (.52, (223, 242, 211)), (.73, (128, 183, 162)),
                            (1, (67, 129, 128))]).convert("RGBA")
    # Preserve the ink contours while shading the interior of every pearl band.
    interior = bands.convert("L")
    interior = interior.point(lambda value: 255 if value > 180 else 0)
    bands.paste(pearl, (0, 0), interior)
    bands.putalpha(Image.composite(bands.getchannel("A"), Image.new("L", size), mask))
    fish = Image.alpha_composite(fish, bands)
    d = ImageDraw.Draw(fish)
    path(d, body, stroke=(43, 84, 77, 255), width=2)
    path(d, [(192, 149), (256, 99, 356, 116, 398, 134)],
         stroke=(255, 221, 148, 170), width=3)
    # Fin overlays the middle band. Fine rays lend texture without raster enlargement.
    path(d, [(363, 188), (324, 191, 317, 237, 354, 251),
             (384, 242, 390, 212, 363, 188)], (249, 155, 72, 225), navy, 2)
    for i in range(5):
        path(d, [(365, 199), (350, 211, 344, 225+i*4, 348+i*5, 244)],
             stroke=(255, 214, 141, 190), width=1)
    path(d, [(472, 190), (459, 205, 459, 219, 469, 226)],
         stroke=(171, 80, 39, 255), width=2)
    def ellipse(box, fill):
        d.ellipse(tuple(round(v*SS) for v in box), fill=fill)
    ellipse((457, 158, 487, 188), (255, 202, 103, 255))
    ellipse((463, 161, 486, 185), navy)
    ellipse((467, 163, 482, 179), (9, 43, 53, 255))
    ellipse((468, 164, 474, 170), (250, 255, 231, 255))
    path(d, [(499, 210), (505, 211, 508, 210, 512, 208)], stroke=navy, width=2)
    return ImageOps.mirror(fish)


def family(canvas):
    art = clownfish()
    for cx, cy, width, angle in FAMILY:
        scaled = art.resize((width*SS, round(width*380/600)*SS), Image.Resampling.LANCZOS)
        scaled = scaled.rotate(angle, Image.Resampling.BICUBIC, expand=True)
        canvas.alpha_composite(scaled, (cx*SS-scaled.width//2, cy*SS-scaled.height//2))
    return canvas


def foreground(canvas):
    d = ImageDraw.Draw(canvas)
    # A single cluster frames the right edge; tips echo the swimming direction.
    for x, y, dx, h, color in (
        (1515, 1020, -180, 310, '#176f70'), (1552, 1030, -53, 445, '#206e6d'),
        (1553, 1030, 100, 360, '#09565e'), (1482, 1040, -210, 225, '#0c6468'),
        (1588, 1050, -110, 271, '#074653'), (1430, 1030, -155, 160, '#09535c'),
    ):
        path(d, [(x, y), (x+dx*.6, y-h*.22, x+dx-75, y-h*.8, x+dx, y-h),
                 (x+dx-35, y-h*.65, x+55, y-h*.3, x, y)], color)
        path(d, [(x, y), (x+30, y-h*.3, x+dx-45, y-h*.7, x+dx, y-h)],
             stroke=(139, 211, 171, 35), width=1.3)
    return canvas


def lettering(canvas):
    d = ImageDraw.Draw(canvas)
    def text(x, y, words, font, size, color):
        face = ImageFont.truetype(FONTS / font, size*SS)
        d.text((x*SS, y*SS), words, font=face, fill=color, anchor="lt", stroke_width=0)
    text(94, 144, "Herdr", "YoungSerif-Regular.ttf", 166, '#edf9e9')
    text(94, 335, "Aquarium", "YoungSerif-Regular.ttf", 126, '#edf9e9')
    text(102, 557, "Your agents, as", "InstrumentSans-Regular.ttf", 43, '#c7e9d9')
    text(102, 614, "a school of fish.", "InstrumentSans-Regular.ttf", 43, '#c7e9d9')
    text(102, 840, "25 species. Real agent families.", "InstrumentSans-Regular.ttf", 30, '#b7dcd0')
    return canvas


def build():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED, "Unexpected source"
    assert hashlib.sha256(ARCHIVE.read_bytes()).hexdigest() == ARCHIVE_SHA, "Unexpected archive"
    canvas = lettering(foreground(family(habitat(water()))))
    canvas = canvas.convert("RGB").resize(SIZE, Image.Resampling.LANCZOS)
    assert canvas.size == (1600, 1000)
    canvas.save(ROOT / "preview.png", optimize=True)


if __name__ == "__main__":
    build()
