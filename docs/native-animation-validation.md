# Native animation validation: diagnostic decoder grid

Source: `60c42b1`. Raw captures are private, not committed:
`.git/aquarium-reports/native-fin-playback/2026-11-12T16-05-00Z/`.
No production code, artwork, layout or preference changes were made.

## Method

An external generated fixture's wrapper pinned the 22 shipped tail clips as
native `image()` elements in labelled 108×108 cells. A flat diagnostic background
and fixed integer positions removed routes, transforms, waves and bubbles;
there was no JavaScript frame timer or code selecting individual frames.
All 22 installed assets matched source SHA-256 hashes.

The evidence window contains 36 screenshot requests covering 4.17 s, after
approximately 0.5 s warmup; capture-start timestamps span 4.105 s. Its total
fixture-visible time was 4.85 s. Herdr was already frontmost, never raised.
Screenshots save the last rendered frame, not a synchronized paint barrier.

## Independently reviewed results

The coordinator recomputed crop hashes from all 36 raw screenshots using the
recorded cell coordinates and inspected native contact sheets for all species.
Every clip varied; none was a constant image. Unique captured crop counts:

| Species | Left-facing | Right-facing |
|---|---:|---:|
| Clownfish | 8 | 11 |
| Blue tang | 11 | 11 |
| Koi | 12 | 12 |
| Largemouth bass | 12 | 12 |
| Rainbow trout | 12 | 12 |
| Sockeye salmon | 12 | 10 |
| Piranha | 12 | 12 |
| Swordfish | 11 | 12 |
| Bluefin tuna | 12 | 11 |
| Channel catfish | 12 | 12 |
| Anglerfish | 8 | 8 |

Every clip also had byte-identical recurring crops with capture-start gaps
approximately 1.15–1.30 s, consistent with its encoded 1200 ms cycle. This is
not an exact measurement of the native playback period. External sampling
(~119 ms) can skip 100 ms source frames; unique counts are lower bounds, not
an encoded-frame-count assertion or framerate benchmark. Anglerfish has eight
coalesced encoded frames; its total encoded timeline remains 1200 ms.

Changes concentrated toward the tail in the fixed cells. The broad half-image
comparison does not establish native-pixel body immutability or explain every
head-region difference; offline decoded-frame tests cover the fixed-body design.

## Capture failures and restoration

Four earlier windows were discarded: one undersampled capture and three script
failures. The worker retried beyond the requested single-window bound. Total
fixture-visible time across five windows was approximately **13.6 s**, not 5 s;
only the final 4.85 s window supplies the evidence above. No further capture was
requested after review. Failures and raw artifacts are retained privately.

The owned fixture tree and layouts were restored after the attempts, and
`aquarium-immersive` was reselected. Captured settings/shared/window/view hashes
were unchanged; the coordinator independently compared those hashes and
confirmed the restored layout and empty app-error list.

## Scope and remaining gates

Native animated-WebP playback is evidenced for all 11 shipped species in both
directions. This diagnostic does **not** establish production route/facing
reversals, pause/inactivity gating, pointer/keyboard comfort, uninterrupted
human visual acceptance, resource budgets, or image restart/seek/play-once/
completion controls. Fourteen other species remain still and untouched.
