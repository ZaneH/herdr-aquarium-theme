# Gallery direction — Clearwater

Quiet space is the organizing material: the tank stays large and uninterrupted, with an even gallery margin that separates product from presentation. Meticulously crafted alignment, rather than added aquarium decoration, gives the image its finish.

A pale sage surround brings daylight to the composition. The actual runtime now supplies the brighter turquoise water and mineral sand: no gallery grading is applied to this fresh native capture. Painstaking restraint keeps native colors authoritative.

Five real inhabitants establish scale and rhythm: two roots and three child fish. Their positions, habitat, status captions, and closed Options control remain where the native capture placed them. No cloned fish, synthetic telemetry, replacement controls, or decorative plants masquerade as product features. Only private text was blurred before this pipeline received its input.

Typography stays outside the screenshot: a short title, the repository's existing product description, and a small disclosure. Master-level refinement means balanced margins and truthful hierarchy, not an invented interface. The existing restrained frame is reused rather than introducing a new visual design.

## Fresh native source and reproduction

- Input: `docs/preview-source-live.png`, 1406 × 600 RGB PNG. SHA-256: `86b6df54cc69dc3f6b2eacb198d94c7dbf48fc472d97f7882ee19f794e599003`.
- Parent/operator captured the actual **workspace panel**, not immersive mode, after the bright habitat asset identities, placement spread, and peek changes at source revision `5a3cf63`. The native window was 2880 × 1740; the aquarium-only crop was (536, 84, 2880, 1084), 2344 × 1000, resized to 1406 × 600 before sanitization. The panel was temporarily raised to the supported 500 px maximum and restored to 320 px afterward. Normal speed / Smooth turning preferences were unchanged. Options is closed; native Immersive and Options buttons remain visible.
- Parent visually approved the sanitized input: all five fish are clear; agent names and both footer/details-strip lines are strongly blurred, while native Working/Resting captions remain readable. No sidebar or terminal content is included. Only this approved sanitized PNG was copied into the repository; private originals and their paths are not published.
- No grading, repositioning, synthesized fish, or reconstructed UI was applied. Resizing and privacy sanitization precede the pinned input; pixel-preservation claims below apply to that sanitized 1406 × 600 input, not the original capture raster.
- Run: `uv run --with pillow==11.3.0 python tools/prepare-preview.py`. Pillow is build-time only; its bundled default font avoids external font files.
- Output: `preview.png`, 1534 × 824 RGB PNG. The sanitized input is pasted unscaled and uncropped at (64, 148), with **identical RGB pixels throughout that rectangle**. No gamma/LUT/color change occurs. A sage surround, soft exterior shadow, title, subtitle, and disclosure are added outside the capture; source metadata is not propagated to the output.
- Regression: `uv run --with pillow==11.3.0 python -m unittest discover -s tests -p test_preview.py` verifies pinned source bytes, legacy archive checksum, dimensions, exact source-region RGB equality, and byte-identical repeated generation.
- Source licenses remain unchanged: repository MIT art/code and Polyy.AI CC0 fish; see README and `mods/aquarium/assets/LICENSE.txt`. No external fonts or reference artwork are vendored.

## Preserved historical archive

`docs/preview-source.png` remains byte-for-byte unchanged: the already-public 1406 × 940 screenshot originally taken from `preview.png` at base commit `5760cd21adfef6f3ba80277ad3045e113552542b`. SHA-256: `a42938f0b68b94a14a528c9164ece2a7958a107d9487749a417bafd171c7846c`. It is an archive, not the current generator input.

The earlier gallery card used that dark immersive capture with its open settings and a global midtone exponent of 0.80. That grading is removed from the active pipeline. Earlier issue #9 comparison references informed restrained spacing and hierarchy only; none of their artwork, logos, or UI is reused.

## Refinement and limits

The current card deliberately presents a clean workspace-panel crop with Options closed and all five fish visible, rather than a full app/sidebar view. Native colors are already bright; the frame must not recolor them. The second-pass checks are exact source-pixel preservation, consistent existing margins, readable exterior captions, and no added graphics over the native rectangle.

This still documents the captured workspace appearance only. It does not prove movement, turning smoothness, hit targeting, keyboard behavior, status transitions, inactive-window lifecycle, immersive appearance, or acceptance in both host themes. Those require separate native evidence. Gallery-owner review remains appropriate; future replacements must be independently sanitized and pinned before publication.
