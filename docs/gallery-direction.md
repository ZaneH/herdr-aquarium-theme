# Gallery direction — Clearwater

Quiet space is the organizing material: the tank stays large and uninterrupted, with an even gallery margin that separates product from presentation. Meticulously crafted alignment, rather than added aquarium decoration, gives the image its finish.

A pale sage surround brings daylight to the composition. A restrained global midtone lift opens the existing teal water while preserving its depth, orange fish accents, and mint controls. The native palette itself is unchanged; this is explicitly a color-graded presentation, not an unedited capture.

The original two inhabitants establish scale and rhythm. Their positions, labels, habitat, and open Options panel remain exactly where the capture placed them. Painstaking restraint means no cloned fish, synthetic telemetry, replacement controls, or decorative plants masquerading as product features.

Typography stays outside the screenshot: a short title, the repository's existing product description, and a small disclosure. The product remains the visual authority. Master-level refinement here means crisp native-resolution pixels, carefully balanced margins, and truthful hierarchy, not an invented interface.

## Source and reproduction

- Input: `docs/preview-source.png`, byte-for-byte `preview.png` from base commit `5760cd21adfef6f3ba80277ad3045e113552542b`. Already public, cropped in-app screenshot with agent labels blurred. SHA-256: `a42938f0b68b94a14a528c9164ece2a7958a107d9487749a417bafd171c7846c`.
- No private `/tmp/aquarium*` capture was used. No new capture or GUI session was made.
- Run from the repository: `uv run --with pillow==11.3.0 python tools/prepare-preview.py`. Pillow is build-time only; its bundled default font avoids external font files.
- Output: `preview.png`, 1534 × 1164 RGB PNG. Input remains 1406 × 940, unscaled and uncropped by this pipeline, at (64, 148). Each channel receives `round(255 * (v / 255) ** 0.80)`. A sage surround, soft exterior shadow, title, subtitle, and disclosure are added outside the capture. Saving strips source metadata from the output.
- Issue #9's three comparison images were downloaded to `/tmp/issue9-ref{1,2,3}.png` and visually reviewed, alongside its older aquarium reference. They inform spacing, readable hierarchy, and restrained color only; none of their artwork, logos, or UI is reused.
- Source licenses remain unchanged: repository MIT art/code and Polyy.AI CC0 fish; see README and `mods/aquarium/assets/LICENSE.txt`. No external font or reference artwork is vendored.

## Refinement and limits

The first rendered card was visually inspected. The second pass gently opened midtones further (exponent 0.84 → 0.80) and aligned the disclosure to the screenshot's right edge. All controls and existing privacy blurs are retained, with no clipping or overlap. The native SVGs, runtime theme, and behavior were not changed.

## Runtime palette follow-up

The runtime habitat SVGs now share a brighter turquoise-water, mineral-sand palette in both modes. Fish text uses compact dark ink backings and tank-local status/focus colors, independent of the host theme; chrome and native controls retain the host theme. Paint-level contrast tests cover the habitat colors, not full native compositing or keyboard acceptance. The gallery images above are unchanged historical graded captures, not screenshots of this updated runtime. A future sanitized native capture in both host themes is needed before refreshing the gallery or claiming visual acceptance.

This deliberately shows only the immersive tank crop and its open settings, not a full app/sidebar view. It does not prove live movement, status transitions, or current runtime acceptance. Gallery-owner review of the final brightness and open-menu composition remains appropriate; a future cleaner capture must be separately sanitized before replacing the preserved input.
