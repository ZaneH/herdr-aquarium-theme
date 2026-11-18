# Gallery direction — Sunlit shoal

## Design philosophy

**Sunlit shoal** treats open water as a material rather than a backdrop. Darkness has weight; light has direction. Broad, meticulously crafted transitions between the two create a space that feels inhabited before any subject enters it. The quiet conceptual thread is companionship: related forms travel together without a diagram explaining their relationship.

Color behaves like light passing through depth. Pearl and pale jade belong near the surface; saturated lagoon blue occupies the middle distance; the deepest silhouettes hold the foreground. A small concentration of warm orange creates the focal point. Painstaking attention to reflected color makes every form belong to the same water, rather than sit on top of it.

Scale communicates kinship and distance. One confident form leads two smaller echoes, their spacing creating an unhurried rhythm. Fins, plant blades and the sloping bed share a current. Master-level execution means refining these relationships, not filling every opening with another decorative object.

Typography is a substantial, rounded presence balanced against fluid organic contours. Words remain sparse and essential. Their generous counters and luminous edges share the scene's softness, while exact alignment and breathing room preserve immediate recognition at small scale. The composition should feel labored over with care, not assembled from a kit.

## Brief and design tokens

Issue #9 asks for a bright, relaxing aquarium presentation that remains honest about the theme. The earlier proofs were rejected: generic text plus scattered sprites, followed by a blurry 6.4× clownfish and awkward copy. Neither is the final direction.

- Abyss `#073348`, lagoon `#087F8C`, sunlit water `#8FE4CE`, pearl `#EDF9E9`, coral `#FF8546`, sand `#B8CDA8`.
- Young Serif Regular: the substantial, softly sculpted product title. Instrument Sans Regular: plain-language description and species/family claim. Both bundled under SIL OFL in `tools/fonts/` with their license texts; copied from the installed canvas-design skill's font collection. Young Serif is by the Young Serif Project Authors / Noir Blanc Rouge; Instrument Sans is by the Instrument Sans Project Authors.
- Left-aligned type balances an inward-facing clownfish family at right. A turquoise light canopy, receding bed and darker foreground plants establish three-dimensional space without UI cards or sticker shadows.

```text
┌─────────────────────────────────────────────┐
│ Herdr                    sunlit canopy      │
│ Aquarium                        light       │
│                          parent fish        │
│ Your agents, as             child           │
│ a school of fish.                 child     │
│ 25 species. Real agent families.     plants │
└─────────────────────────────────────────────┘
```

The title is the identification, not an unnecessary eyebrow. The family is the memorable focal point; planting stays at the perimeter. The gradient lights the habitat and subjects rather than decorating a flat layout. No claims about live status, performance, or acceptance appear in the artwork.

### Local visual review

The full 1600 × 1000 output, the actual 392 × 245 thumbnail, and a combined contact sheet were opened directly for review. The first iteration's neutral Bricolage title, heavy fish outlines and flat seabed bands were refined: Young Serif gives the title a recognizable voice; the parent is larger; pearl bands and fins now shade with the orange body; the bed layers darken toward the foreground. No additional decorative species or fake UI was introduced.

At thumbnail size, the title and warm parent/child grouping remain immediately recognizable, the light shafts read more clearly than at full size, and the planting gives a foreground anchor. The species/family line is intentionally secondary and small at card size. The fish remain stylized illustration, not photorealistic or a promise of new runtime art. Final local proofs: `/tmp/gallery-banner-full.png`, `/tmp/gallery-banner-thumb.png`, `/tmp/gallery-banner-contact-sheet.png` (temporary review files, not repository assets).

## Artwork and provenance

`preview.png` is **original composed promotional illustration, not a screenshot**. The fish and habitat are drawn as smooth supersampled Bézier geometry by `tools/prepare-preview.py`, with shaded bodies, translucent ribbed fins and clipped white bands. They evoke the shipped clownfish species and parent/child grouping, but are not the exact runtime sprites or runtime rendering. No paid image generation or new renderer dependency is involved.

The source pack in the existing local Downloads archive was inspected: the highest studio/sun sprite frames are 96px, not a suitable source for a large hero. The shipped `habitat-full-bright-v1.svg` and `habitat-bright-v1.svg` were also inspected for the theme's water/grass/sand vocabulary. Neither the source pack nor runtime assets are modified or required for regeneration. The shipped fish pack is Polyy.AI's CC0 1.0 artwork; this banner's geometry is original project artwork under the repository's MIT license.

## Authoritative gallery sizing

The public stylesheet `https://herdr.dev/_astro/gallery.CDRiCvXd.css` specifies:

- `.shot{aspect-ratio:16 / 10;overflow:hidden}`
- `.shot img{width:100%;height:100%;object-fit:cover;object-position:top left}`

The card is approximately **392 × 245 logical pixels**. The output is exactly **1600 × 1000 RGB PNG**, so the top-left cover crop removes nothing. The full image and a 392 × 245 proof must both be inspected; the small descriptive line is secondary, not the thumbnail's primary message.

## Reproduction and checks

```sh
uv run --offline --with pillow==11.3.0 python tools/prepare-preview.py
uv run --offline --with pillow==11.3.0 python -m unittest discover -s tests -p test_preview.py
git diff --check
```

Pillow is build-time only. Rendering uses bundled fonts and deterministic geometry, with no network, system font, random noise or runtime capture dependency. Byte-identical PNG reproduction is checked in the pinned Pillow environment; other Pillow/FreeType versions are not a byte-identity guarantee.

## Preserved evidence (unchanged)

- `docs/preview-source-live.png`, 1406 × 600 RGB PNG. SHA-256: `86b6df54cc69dc3f6b2eacb198d94c7dbf48fc472d97f7882ee19f794e599003`. Genuine sanitized native workspace-panel capture: five real fish, two roots and three children, Options closed, private text blurred, no grading.
- `docs/preview-source.png`, 1406 × 940 historical archive at base commit `5760cd2`. SHA-256: `a42938f0b68b94a14a528c9164ece2a7958a107d9487749a417bafd171c7846c`.

Neither evidence file is banner input; both are checksum-pinned. This illustration proves nothing about motion, targeting, keyboard behavior or native acceptance. Local visual review is not published Gallery acceptance.
