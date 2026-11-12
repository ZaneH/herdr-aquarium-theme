# Animation coverage: all 25 species

This is the per-species record for the Free-floating in-place loops. It covers the
current approved algorithms only: for the 11 tail species a 96 × 96 still, a fixed
head/facing, and vertical column shear capped at two pixels, tapering to zero at a
measured caudal-fin boundary; for the moray eel a full body-undulation wave (its own
profile, below); for the four flowing-fin species a fixed torso/head core with a
bounded 2D fin warp (its own profile, below); for the two sharks a caudal-joint
rotation about the measured peduncle root (its own profile, below). Twelve source frames at 100 ms, no new
clock or mask system. The WebP encoder may coalesce identical consecutive source frames
into longer encoded frames; the decoded 1200 ms timeline must still match the intended
frame at every 100 ms slot. The tail species' still/gold PNG fallbacks and all Organized
travelling clips are unchanged; the eel gets matched canonical side fallbacks; the fin
species reuse their existing norm/gold stills as-is; the sharks reuse theirs too.
18 species are now animated; 7 remain still.

"Not shipped" means not added in this batch. It does not mean a species cannot be animated.
The tail-only algorithm cannot separate fins that share the same image columns; future
per-species fin artwork or a pivot/rotation rig is feasible work, not an impossibility.
Native visual and performance acceptance remains open for every species, including the
shipped ones. All 25 species have right and left stills, gold stills, swim/glide clips and
both facings; asset availability is not a blocker for any row.

## Shipped (11)

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
| anglerfish | 20/78 | narrow caudal fin; the pelvic fin starts inside the body, so the band stops before it. The encoder coalesces duplicate source frames into 8 encoded frames, but the decoded 1200 ms timeline matches all 12 intended slots. |

## Shipped body wave (1): moray_eel

The eel has no caudal fin, so it uses an approved body-undulation profile instead of
column shear: a travelling sine wave `dy = A(x,y)·sin(2πi/12 − 2πx/26)` with a 1.6 px
amplitude, per-column vertical inverse displacement and premultiplied bilinear
sampling (no integer shear, no mesh). Amplitude is zero inside a fixed head disc
(r0 = 14 px around the measured eye anchor at 30,35) and ramps smoothly to full over
the neck (r1 = 26 px); the head, eyes and mouth are RGBA byte-exact in every frame, and
the body is deliberately allowed to deform. Both old source poses face left, so the
canonical SIDE still `moray_eel-left.png` is the only source: the RIGHT loop and stills
are mirrors of the LEFT ones, the travelling wave still propagates head-to-tail after
mirroring, and the plain left-facing `moray_eel.png` pose is not reused. Because a
travelling wave is nowhere zero at any instant, frame 0 differs from the source still
by at most 1.6 px; the head disc is exact in all frames. Transparent-perimeter and
alpha connectivity (16/128) are preserved; the small premultiplied edge softening is
accepted without a full rig. Paused/blocked/done eels use matched side stills
`moray_eel-inplace-{left,right}.png` and `moray_eel-inplace-gold-{left,right}.png`, pixel
copies/mirrors of the same canonical sources, so the eel never shows the old facing or
jumps between unrelated poses.
Loops: `moray_eel-body-{left,right}.webp`. Native in-app visual acceptance stays open,
like every species.

## Shipped flowing fins (4): betta, fancy_goldfish, freshwater_angelfish, manta_ray

The three veil-finned species lack a clean caudal-only column band; the manta
swims with broad pectoral wings instead of a caudal fin. Each facing uses its own
measured profile: a torso ellipse plus a head disc form a protected core that is
RGBA byte-exact in every frame; outside it an empirical falloff weight
(`smoothstep(min(torso gap, head gap)/ramp)`, not a claimed physical distance) ramps a
per-species motion field up to a 2 px displacement, applied as an inverse warp with
premultiplied bilinear sampling. Betta and fancy goldfish flow their fans diagonally;
the angelfish flaps its dorsal/anal fins mostly horizontally while its caudal fan
wags vertically. Because the wave is a travelling sine, frame 0 is not the source
still — the same approved deviation as the eel.

Known limit: the small premultiplied resampling softens antialiased fin edges, and
thin one-pixel fin threads can break or merge across the 12 frames — fine-thread
connected-component counts are **not** preserved and this is stated rather than
hidden. The tests instead check the cheaper guarantee that every opaque source
appendage pixel is still represented (alpha ≥ 16) within a 3 px neighborhood in
every frame. No spine rig, full 3D rotation or native in-app proof is claimed.
Paused/blocked/done fish fall back to the existing norm/gold stills, which already
face correctly on both sides, so no canonical still copies were needed.
Loops: `<species>-fin-{right,left}.webp`.

### Manta ray wing flap

The manta has no caudal fin: the pectoral wings are the swimming appendage. Its
loop reuses the flowing-fin engine with a measured torso/head core plus an
explicit motion region: outside the core, only the wing pixels warp — the long
whiptail band (x 0–43 right / 55–95 left, y 46–53, the whip and its dots) is
RGBA byte-exact in every frame. The motion is a tiny mostly-vertical wing flex
whose phase varies with height (a unit vector times a 2 px cap, so the
wings can expand into transparent pixels without pinning contours); it is small
procedural 2D flex, not a physically precise 3D rig. Both facings' still and gold
portraits already face correctly and are reused unchanged.
Loops: `manta_ray-fin-{right,left}.webp`. Native in-app visual acceptance stays
open, like every species.

## Shipped caudal-joint (2): great_white_shark, hammerhead_shark

The column-shear trial for the sharks was rejected (history below). The accepted
algorithm instead rotates the whole caudal silhouette as one unit about the
measured peduncle root: a scalar angle `A·sin(2πi/12)`, locally scaled by a
smoothstep over the 4-column tailward attachment so the seam to the preserved
trunk stays continuous, then an inverse rotation with premultiplied bilinear
sampling inside a small reviewed region only. Frame 0 is the source still; the
period is 12 with 7 distinct visible states; maximum tail-tissue displacement is
1.3–1.46 px (<= 2 px bound). There is no source-alpha output gate, so the loop
honestly gains and loses contour pixels at the lobe edges, and the silhouette
(both lobes attached at the peduncle) stays one connected component in every
frame. Roots, amplitudes and regions were measured on each facing's own still;
both facings already face correctly, so paused/blocked/done fallbacks reuse the
existing norm/gold PNGs unchanged.
Loops: `<species>-caudal-{right,left}.webp`. Native in-app visual acceptance stays
open, like every species.

| species | root R/L | amplitude rad R/L | region R/L (x0–x1, y0–y1) |
|---|---|---|---|
| great_white_shark | (23.5, 42.0) / (72.5, 58.5) | 0.062 / 0.085 | 8–27, 22–53 / 69–87, 47–75 |
| hammerhead_shark | (24.0, 55.5) / (72.0, 54.0) | 0.07 / 0.072 | 3–27, 44–67 / 69–92, 40–64 |

## Rejected column-shear trials (1, historical)

History: the sharks were first tried as column-shear tail loops and rejected
with visible defects (a rubbery hinge sliding both lobes against the narrow
peduncle on the great white, and a detached, hooked lower lobe on the
hammerhead, whose lobes are only a few pixels thick). They have since shipped
with the caudal-joint rotation above; the rows below are the remaining
reject of that older algorithm. Missing source assets are not the blocker.

| species | evidence | concrete blocker | what would help |
|---|---|---|---|
| silver_arowana | 21/78 | the band boundary crosses the trailing tips of the long dorsal and anal fins. Shear moves those fin tips with the caudal fan, leaving a visible one-to-two-pixel step at the boundary in both facings. | A tail-only mask that excludes the dorsal/anal tips, or art with a clear peduncle. Moving the edge inward would shear more body. |

## Not shipped: distinct anatomy, no separable caudal fin (6)

These fail the tail algorithm's first assumption: there is no discrete caudal fin, or a different
fin (pectoral, dorsal, anal, fringe) occupies the same columns. Shearing the band would
deform that fin or the body silhouette rather than beat a tail. They need species-specific
fin motion artwork or a fin mask/rig, not a different edge number. The moray eel
moved to the shipped body wave above; betta, fancy_goldfish and freshwater_angelfish
moved to the shipped flowing fins above; manta_ray moved to the shipped wing-flap
profile above; the sharks moved to the shipped caudal-joint profile above.

| species | concrete reason |
|---|---|
| mandarinfish | huge pectoral fan occupies the tail columns and would shear with the tail |
| lionfish | giant fan pectoral fin overlaps the caudal band |
| pufferfish_inflated | dorsal and anal fins sit inside the caudal band; two fins would deform |
| seahorse | vertical posture and prehensile tail, no caudal fin |
| ocean_sunfish | no caudal fin; the clavus rudder is fused to the dorsal/anal fins |
| flounder | top-down oval with a continuous fin fringe; no discrete caudal fin |

## What a future batch would need

1. A per-species way to isolate the moving fins (authored transparent fin layers, or a
   reviewed mask) instead of one rectangular column band.
2. A pivot at the peduncle and rotation/flex, at least for long trailing fins,
   rather than a vertical translation. (Shipped for the two sharks; see the
   caudal-joint section above.)
3. New or redrawn stills where the caudal fan does not touch dorsal/anal/pectoral tips.
4. Re-run the same gates: both facings, 12 source frames at 100 ms with a decoded
   1200 ms timeline that matches every intended slot (encoded frames may coalesce),
   fixed body/head/eyes/pelvic-fin alpha, transparent perimeter, byte-identical sources,
   deterministic WebP generation, and an inspected contact sheet. Native acceptance is
   still separate and open.

Generation and tests: `tools/prepare-in-place-fish.py`; `tests/test_in_place_fish.py`,
`tests/model.test.mjs`, `tests/facing.test.mjs`. Trials and contact sheets are build-time
artifacts outside the checkout.
