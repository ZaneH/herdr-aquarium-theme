#!/usr/bin/env python3
"""Frame the sanitized native workspace screenshot without changing its pixels.

Run: uv run --with pillow==11.3.0 python tools/prepare-preview.py
"""
from pathlib import Path
import hashlib
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/preview-source-live.png"
EXPECTED = "86b6df54cc69dc3f6b2eacb198d94c7dbf48fc472d97f7882ee19f794e599003"


def build():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED, "Unexpected source"
    with Image.open(SOURCE) as image:
        shot = image.convert("RGB")
    assert shot.size == (1406, 600)
    # The runtime is already bright: preserve every sanitized source RGB pixel.
    canvas = Image.new("RGB", (1534, 824), "#edf2eb")
    draw = ImageDraw.Draw(canvas)
    # Pillow's bundled font keeps regeneration independent of system fonts.
    draw.text((64, 38), "Herdr Aquarium", font=ImageFont.load_default(size=36), fill="#183e43")
    draw.text((65, 88), "Your coding agents, as a school of fish.",
              font=ImageFont.load_default(size=19), fill="#466263")
    shadow = Image.new("RGBA", canvas.size)
    ImageDraw.Draw(shadow).rectangle((64, 159, 1469, 758), fill=(15, 45, 49, 36))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow.filter(ImageFilter.GaussianBlur(14)))
    canvas.paste(shot, (64, 148))
    draw = ImageDraw.Draw(canvas)
    draw.text((64, 772), "Workspace panel / native Herdr theme",
              font=ImageFont.load_default(size=16), fill="#466263")
    disclosure = "Native colors · private text blurred"
    font = ImageFont.load_default(size=16)
    width = draw.textlength(disclosure, font=font)
    draw.text((1470 - width, 772), disclosure, font=font, fill="#466263")
    canvas.convert("RGB").save(ROOT / "preview.png", optimize=True)


if __name__ == "__main__":
    build()
