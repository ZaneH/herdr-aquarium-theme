#!/usr/bin/env python3
"""Build the gallery card from the preserved public screenshot (no app access).

Run: uv run --with pillow==11.3.0 python tools/prepare-preview.py
"""
from pathlib import Path
import hashlib
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/preview-source.png"
EXPECTED = "a42938f0b68b94a14a528c9164ece2a7958a107d9487749a417bafd171c7846c"


def build():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED, "Unexpected source"
    with Image.open(SOURCE) as image:
        shot = image.convert("RGB")
    assert shot.size == (1406, 940)
    # Gentle global midtone lift; no local repainting or reconstructed UI.
    lut = [round(255 * (v / 255) ** 0.80) for v in range(256)]
    shot = shot.point(lut * 3)
    canvas = Image.new("RGB", (1534, 1164), "#edf2eb")
    draw = ImageDraw.Draw(canvas)
    # Pillow's bundled font keeps regeneration independent of system fonts.
    draw.text((64, 38), "Herdr Aquarium", font=ImageFont.load_default(size=36), fill="#183e43")
    draw.text((65, 88), "Your coding agents, as a school of fish.",
              font=ImageFont.load_default(size=19), fill="#466263")
    shadow = Image.new("RGBA", canvas.size)
    ImageDraw.Draw(shadow).rectangle((64, 159, 1469, 1098), fill=(15, 45, 49, 36))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow.filter(ImageFilter.GaussianBlur(14)))
    canvas.paste(shot, (64, 148))
    draw = ImageDraw.Draw(canvas)
    draw.text((64, 1112), "Immersive view / native Herdr theme",
              font=ImageFont.load_default(size=16), fill="#466263")
    disclosure = "Color-graded screenshot · labels blurred"
    font = ImageFont.load_default(size=16)
    width = draw.textlength(disclosure, font=font)
    draw.text((1470 - width, 1112), disclosure, font=font, fill="#466263")
    canvas.convert("RGB").save(ROOT / "preview.png", optimize=True)


if __name__ == "__main__":
    build()
