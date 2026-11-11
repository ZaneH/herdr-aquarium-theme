"""Run with Pillow 11.3.0; the gallery must not repaint the native capture."""
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
    def test_native_pixels_archive_and_deterministic_frame(self):
        self.assertEqual(hashlib.sha256((ROOT / 'docs/preview-source.png').read_bytes()).hexdigest(),
                         'a42938f0b68b94a14a528c9164ece2a7958a107d9487749a417bafd171c7846c')
        self.assertEqual(hashlib.sha256(preview.SOURCE.read_bytes()).hexdigest(), preview.EXPECTED)
        with Image.open(preview.SOURCE) as source:
            self.assertEqual(source.mode, 'RGB')
            self.assertEqual(source.size, (1406, 600))
            pixels = source.tobytes()
        committed = (ROOT / 'preview.png').read_bytes()
        original_root = preview.ROOT
        with TemporaryDirectory() as directory:
            try:
                preview.ROOT = Path(directory)
                preview.build()
                output = preview.ROOT / 'preview.png'
                first = output.read_bytes()
                self.assertEqual(first, committed, 'Committed preview must match regeneration')
                with Image.open(output) as card:
                    self.assertEqual(card.size, (1534, 824))
                    self.assertEqual(card.mode, 'RGB')
                    self.assertEqual(card.crop((64, 148, 1470, 748)).tobytes(), pixels)
                preview.build()
                self.assertEqual(output.read_bytes(), first)
            finally:
                preview.ROOT = original_root


if __name__ == '__main__':
    unittest.main()
