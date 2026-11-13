"""Run with Pillow 11.3.0; the gallery banner must regenerate byte-identically."""
import hashlib
import importlib.util
from pathlib import Path
import unittest
from tempfile import TemporaryDirectory
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prepare_preview', ROOT / 'tools/prepare-preview.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class PreviewTests(unittest.TestCase):
    def test_evidence_archives_banner_size_and_determinism(self):
        # Genuine sanitized captures stay pinned as product evidence.
        self.assertEqual(hashlib.sha256(preview.SOURCE.read_bytes()).hexdigest(), preview.EXPECTED)
        self.assertEqual(hashlib.sha256(preview.ARCHIVE.read_bytes()).hexdigest(), preview.ARCHIVE_SHA)
        committed = (ROOT / 'preview.png').read_bytes()
        original_root = preview.ROOT
        with TemporaryDirectory() as directory:
            try:
                preview.ROOT = Path(directory)
                preview.build()
                output = preview.ROOT / 'preview.png'
                first = output.read_bytes()
                self.assertEqual(first, committed, 'Committed preview must match regeneration')
                with Image.open(output) as banner:
                    self.assertEqual(banner.format, 'PNG')
                    self.assertEqual(banner.size, (1600, 1000))
                    self.assertEqual(banner.mode, 'RGB')
                    # Herdr Gallery cards are 16:10 with object-fit:cover from
                    # the top left (herdr.dev/_astro/gallery.CDRiCvXd.css);
                    # an exact 16:10 banner keeps that crop empty.
                    self.assertEqual(banner.width / banner.height, 16 / 10)
                preview.build()
                self.assertEqual(output.read_bytes(), first, 'Regeneration must be deterministic')
            finally:
                preview.ROOT = original_root

    def test_original_family_art_has_transparency_and_smaller_children(self):
        # No 96px raster sprite is enlarged: all three fish share original geometry.
        art = preview.clownfish()
        self.assertEqual(art.mode, 'RGBA')
        self.assertEqual(art.getpixel((0, 0))[3], 0)
        self.assertIsNotNone(art.getbbox())
        self.assertEqual(len(preview.FAMILY), 3)
        widths = [width for _, _, width, _ in preview.FAMILY]
        self.assertGreater(widths[0], widths[1])
        self.assertGreater(widths[1], widths[2])
        self.assertGreater(widths[2], 0)
        for cx, cy, width, _ in preview.FAMILY:
            self.assertGreater(cx - width / 2, 0)
            self.assertLess(cx + width / 2, 1600)
            self.assertGreater(cy - width / 2, 0)
            self.assertLess(cy + width / 2, 1000)

    def test_banner_fonts_are_bundled_and_licensed(self):
        # Regeneration must not depend on machine-installed fonts.
        for name in ('YoungSerif-Regular.ttf', 'InstrumentSans-Regular.ttf'):
            self.assertTrue((preview.FONTS / name).is_file(), f'Missing bundled font asset {name}')
        for name in ('YoungSerif-OFL.txt', 'InstrumentSans-OFL.txt'):
            self.assertIn('SIL OPEN FONT LICENSE Version 1.1',
                          (preview.FONTS / name).read_text())


if __name__ == '__main__':
    unittest.main()
