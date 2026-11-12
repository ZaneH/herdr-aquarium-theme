# Animation coverage: all 25 species

This is the per-species record for the Free-floating in-place tail loop. It covers the
current approved algorithm only: a 96 × 96 still, a fixed head/facing, and vertical column
shear capped at two pixels, tapering to zero at a measured caudal-fin boundary. Twelve
frames at 100 ms, no new clock or mask system. The still/gold PNG fallback and the
Organized travelling clips are unchanged.

"Not shipped" means not added in this batch. It does not mean a species cannot be animated.
The current algorithm cannot separate fins that share the same image columns; future
per-species fin artwork or a pivot/rotation rig is feasible work, not an impossibility.
Native visual and performance acceptance remains open for every species, including the
shipped ones. All 25 species have right and left stills, gold stills, swim/glide clips and
both facings; asset availability is not a blocker for any row.

## Shipped (10)

Both facings were generated and reviewed at phases 0/3/6/9; the loop exists as
`<species>-tail-{right,left}.webp`. An edge is the fixed-body boundary: for right-facing
art the first body column to the right of the tail band; for left-facing art the last body
column to the left of it. Each facing is measured on its own still.

| species | edge R/L | why the fixed band is safe |
|---|---|---|
| clownfish | 48/47 | original pilot; tail occupies the rear half as a separate silhouette |
| blue_tang | 24/71 | narrow separate yellow caudal fin; blue body and palette mark stay fixed |
| koi | 22/73 | forked caudal fin separates from the patterned body; pelvic/anal fins fixed |
| largemouth_bass | 22/76 | forked caudal fin behind a narrow peduncle; anal fin outside the band |
| rainbow_trout | 18/77 | forked caudal fin; anal fin begins outside the band |
| sockeye_salmon | 16/79 | forked caudal fin, clean peduncle |
| piranha | 23/72 | forked caudal fin; anal fin only at the band boundary |
| swordfish | 14/82 | lunate caudal fin on a very thin peduncle |
| bluefin_tuna | 21/76 | thin lunate caudal fin; rear dorsal finlets shear with the peduncle by at most ~1 px, below visible scale |
| channel_catfish | 21/74 | forked caudal fin; barbels and adipose fin outside the band |

## Reviewed but not shipped (4)

These have a discrete caudal fin and were inspected as trial loops. Three showed
visible defects; anglerfish has a narrower candidate whose encoded playback still
needs validation. Missing source assets are not the blocker.

| species | evidence | concrete blocker | what would help |
|---|---|---|---|
| great_white_shark | facing R/L 25/80 | heterocercal tail is one large swept unit; shifting it as columns slides both lobes against the narrow peduncle and reads as a rubbery hinge, worst at the long upper lobe. The left still is a different pose, so this is not a mirror artefact. | Authored tail flex about the peduncle joint, or a tail-only layer with a pivot. Edge tuning alone would either cut the lobe or move body columns. |
| hammerhead_shark | 26/78 | caudal lobes are only a few pixels thick; a two-pixel shift is comparable to lobe thickness, producing a visible step/hook and a detached, rubbery lower lobe. | Redraw the tail with a thicker peduncle and authored flex, or a per-fin rotation rig. A mask over this art is not enough. |
| silver_arowana | 21/78 | the band boundary crosses the trailing tips of the long dorsal and anal fins. Shear moves those fin tips with the caudal fan, leaving a visible one-to-two-pixel step at the boundary in both facings. | A tail-only mask that excludes the dorsal/anal tips, or art with a clear peduncle. Moving the edge inward would shear more body. |
| anglerfish | trial R/L 24/71 and 20/78 | wide bounds shear the adjacent pelvic fin. Narrow bounds preserve it but WebP coalesces duplicate source frames into 8 encoded frames. A lower encoded frame count alone is not a defect or host limitation. | Validate the narrowed loop's total duration, timeline and visible anatomy; accept coalescing if playback is equivalent. Do not widen the band over the pelvic fin just to satisfy a frame-count assertion. |

## Not shipped: distinct anatomy, no separable caudal fin (11)

These fail the algorithm's first assumption: there is no discrete caudal fin, or a different
fin (pectoral, dorsal, anal, fringe) occupies the same columns. Shearing the band would
deform that fin or the body silhouette rather than beat a tail. They need species-specific
fin motion artwork or a fin mask/rig, not a different edge number.

| species | concrete reason |
|---|---|
| betta | caudal, dorsal and anal fins form one continuous mass; there is no peduncle |
| fancy_goldfish | translucent veil tail overlaps the pelvic/anal fins and body; no separable band |
| mandarinfish | huge pectoral fan occupies the tail columns and would shear with the tail |
| freshwater_angelfish | long trailing ventral streamers cross the tail columns |
| manta_ray | no caudal fin; the pectoral wings are the swimming appendage, and the art is near-silhouette |
| lionfish | giant fan pectoral fin overlaps the caudal band |
| pufferfish_inflated | dorsal and anal fins sit inside the caudal band; two fins would deform |
| moray_eel | continuous dorsal/anal fringe, no caudal fin, curled side view |
| seahorse | vertical posture and prehensile tail, no caudal fin |
| ocean_sunfish | no caudal fin; the clavus rudder is fused to the dorsal/anal fins |
| flounder | top-down oval with a continuous fin fringe; no discrete caudal fin |

## What a future batch would need

1. A per-species way to isolate the moving fins (authored transparent fin layers, or a
   reviewed mask) instead of one rectangular column band.
2. A pivot at the peduncle and rotation/flex, at least for swept shark lobes and long
   trailing fins, rather than a vertical translation.
3. New or redrawn stills where the caudal fan does not touch dorsal/anal/pectoral tips.
4. Re-run the same gates: both facings, 12 × 100 ms, fixed body/head/eyes alpha,
   transparent perimeter, byte-identical sources, deterministic WebP generation, and an
   inspected contact sheet. Native acceptance is still separate and open.

Generation and tests: `tools/prepare-in-place-fish.py`; `tests/test_in_place_fish.py`,
`tests/model.test.mjs`, `tests/facing.test.mjs`. Trials and contact sheets are build-time
artifacts outside the checkout.
