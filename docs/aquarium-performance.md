# Aquarium performance evidence (issue 5)

Native process evidence below shows significant unresolved dense-school active CPU cost. Neither the historical proxy nor the native observations complete resource acceptance.

## HISTORICAL: b50a31f source-proxy rerun (not current source)

The table and scope in this historical section describe the source/tool revisions recorded here, **not current production source** or current native performance.

### Integrated-source rerun after discovery, lifecycle, palette and geometry fixes

This supersedes all earlier single-pending-timer proxy measurements, including
runs at `6241385` and `0450417`: those fixtures could silently lose concurrent
timers. Production source hashes remain those of `0450417`; the corrected
benchmark tool is measured at `b50a31f`.
The coordinator ran the final integrated root source; this document uses that
output, not a rerun of the implementer's older worktree. Production files were read only. This is **not a live paint benchmark** and does
not complete issue 5's CPU/GPU/decoded-image-memory acceptance check.

```sh
node tools/benchmark-aquarium.mjs --self-check
node tools/benchmark-aquarium.mjs > /tmp/aquarium-benchmark-queue-final.jsonl
```

Raw samples and complete metadata: `/tmp/aquarium-benchmark-queue-final.jsonl`.
No dependencies, timing assertions, or CI timing threshold. Seven samples of 100 calls each, 30 render
warmups; fixed case order. Values below are medians in milliseconds per call.

Measured 2026-11-11T16:43:37.618Z; repository revision `b50a31f44398d226534ef394e844417fdf5d74bd`.
Node v26.12.1, V8 14.6.202.34-node.40, darwin 27.0.0, Apple M1 (8 cores).

Source SHA-256:

- `main.js`: `ab25416321f2de86af67ba8d5f1fd4a9fb1de27dc58128391213d87a5768f4f7`
- `model.js`: `1cfee89af4e269e9745997e6d6aedee81c5d18d48df1f59f7b58122c1b3fcdcd`
- `motion.js`: `91132dd2de48f533b9743e7a51b8e5779bf91db3ddf00b36d362892912598eb6`

| Fish | Shape | Listed | Arrangement | Nodes | Render | Discovery | Grouping | Scheduler |
|---:|---|---:|---|---:|---:|---:|---:|---:|
|0|flat|0|organized|55|0.03174|0.00011|0.00014|null|
|0|flat|0|free|55|0.02658|0.00008|0.00011|null|
|0|nested|0|organized|55|0.02685|0.00007|0.00009|null|
|0|nested|0|free|55|0.02695|0.00007|0.00009|null|
|0|hidden|0|organized|55|0.02652|0.00007|0.00009|null|
|0|hidden|0|free|55|0.02652|0.00007|0.00009|null|
|100|flat|100|organized|902|0.55676|0.00606|0.01383|null|
|100|flat|100|free|1077|0.66958|0.00604|0.01385|0.01213|
|100|nested|100|organized|822|0.51584|0.00607|0.01906|null|
|100|nested|100|free|997|0.58894|0.00608|0.01912|0.00265|
|100|hidden|10|organized|797|0.51559|0.00810|0.01988|null|
|100|hidden|10|free|997|0.59419|0.00801|0.01984|0.00261|
|250|flat|250|organized|2176|1.43920|0.01504|0.03624|null|
|250|flat|250|free|2614|1.83599|0.01556|0.03652|0.02899|
|250|nested|250|organized|1976|1.41702|0.01492|0.05026|null|
|250|nested|250|free|2414|1.64429|0.01516|0.05196|0.00436|
|250|hidden|25|organized|1914|1.38572|0.02030|0.05560|null|
|250|hidden|25|free|2414|1.65569|0.01979|0.05531|0.00494|

### Historical fixture and measured scope

The current `main.js` class runs in a Node VM with all current model/motion
exports. Imports are removed only to supply proxy builders and synthetic Herdr
snapshots. Source is loaded at execution time, not embedded. Builders allocate
and retain descriptions/arguments, execute `when`, but not event/style callbacks.
Render includes discovery, grouping, geometry, details, options and motion sync;
module startup/init are excluded. Separate discovery/grouping samples isolate
current helpers (grouping uses already-discovered fish).

900x500 workspace, active window, animation enabled, slow/smooth,
bubbles/water enabled, options closed. Statuses cycle working/idle/blocked/done.
Flat has no parents. Nested and hidden use identical ten-fish broods with up to
five parent edges. Flat/nested list every fish in `agents()`; **hidden lists only
roots**, while `terminals()` contains all fish as live raw records with
`program.agent: true`, `program.shell: false`, status, parent, name and cwd.
Raw done is normalized by production discovery, not by the fixture.
Every measured case asserts the rendered unique fish count equals the requested
count. Self-check lists only two roots, requires all 18 hidden descendants plus
a raw orphan whose parent is absent to render, and verifies the orphan has an
independent motion family and that cancellation parks scheduling. Removing
production discovery therefore fails the self-check rather than silently
benchmarking two roots. No real agents or terminals are created.

Scheduler samples retain all pending tasks with absolute synthetic deadlines
and per-task cancellation, dispatching the earliest deadline on each tick.
Free samples measure queue selection plus real dispatched callbacks, including
possible early completion-expiry work, and the dispatch assertion overhead—not
pure motion callback cost, real wakeup frequency, or CPU utilization.
Empty/organized scheduler values are `null`: not sampled, **not** evidence of
no timers (organized cases can own completion-expiry tasks). The current tool
(revision later than `b50a31f`) measures **36 combinations**: fish counts 0, 2,
5, 10, 100 and 250 across flat/nested/hidden shapes and organized/free
arrangements, and hashes `main.js`, `model.js`, `motion.js` and
`presentation.js`. Free scenes are classified before timing: a free scene with
no persistent moving families (every family parked by blocked descendants or
done leaders) drains its transient expiry tasks untimed and reports
`scheduler: null` plus a `schedulerNote` — a legitimately empty queue, asserted
rather than silently timed — while a free scene that does contain moving
families asserts every sampled tick dispatches a real callback, so empty-tick
overhead can never be reported as callback cost. These are source-description
samples only; no native materialization, paint, CPU or GPU gains are claimed. Nodes are counted
in a final render after synthetic timer sampling, whereas render timing occurs
before the clock advances; these are not necessarily identical frames. Free
scheduler dispatch can expire shimmers before that count, while organized cases
leave their timers pending. Self-check also
verifies concurrent listed done-agent expiries and working-agent motion survive
and cancel independently. Bounded-depth families and element counts scale roughly
with fish count; this does not establish asymptotic linearity. Per-fish terminal
`all.find` has quadratic worst-case comparisons; grouping walks ancestry per
fish, so deep chains can also be quadratic. These are source-level caveats,
not an isolated measured egregious hotspot or a reason for speculative edits.
Many non-agent terminals, deep chains, narrow/immersive views and oversized
single broods remain separate followup cases. Current geometry assigns separate
scroll bands to taller-than-tank families and to multiple fitting families that
each exceed half the viewport in both dimensions. Single fitting families and
ordinary full-tank routes remain unchanged; ordinary routes may still cross.
This static target separation is not native clickability or collision acceptance.

Proxy/assertion overhead, VM/Node versus native JS engine, GC and fixed-order warming
limit absolute timing relevance. There is no native materialization, layout,
paint, image loading/decoding, GPU measurement, CPU utilization, RSS, or decoded
residency measurement here. No RGBA estimates are presented as memory use.

Installed native guide says `herdr-app check` checks initial descriptions and
eager native elements but does not lay out, run deferred rows, nested renders,
or later async states. Its in-process versus IPC implementation was **not
established**, and check was not run or timed: CLI RSS must not be called
native-render RSS without that discovery. This source-only scope avoids
interacting with the live app/home/layout/preferences entirely.

Followup: retain JSONL and rerun after further source changes; separately establish check process ownership from implementation or process
tracing before isolated startup CPU/RSS experiments. Actual crowded-school
paint CPU/GPU and decoded residency require an authorized isolated renderer
with real counters; paused/hidden live work also remains unmeasured.


## Bounded feed comparison mode (source-only, current source)

Measured 2026-11-12, repository revision `1d74af02f8240a317921b573dd5a279771f6f123`.
Source SHA-256: `main.js` `a36651e1f97119e5b48adb4348f8ea496d3628151caa942af4c88af44e007662`,
`model.js` `97c4413ab2aaa4036cde4005ff1bb3217f486f26eb6d7e165c59aace7f78e70e`,
`motion.js` `3dbe6bb4e8e848de75dfcd75611d1c39685688be53870d827cd9668777fba519`,
`presentation.js` `c82ccb5269aee737290c4144ee080c076de5261b92e9d1b5996eb689afa16b60`.

```sh
node tools/benchmark-aquarium.mjs --self-check
node tools/benchmark-aquarium.mjs --feed > /tmp/aquarium-reports/aquarium-benchmark-feed-2026-11-12.jsonl
```

The historical benchmark never drops food, so it cannot describe the feeding
halo shipped at `564508b`. The new `--feed` flag runs the same synthetic VM
fixture for ordinary flat free-floating scenes of 2, 5 and 10 fish and
compares a **no-food baseline render** against the **same fixture after an
actual `dropFood()` call**. The label is therefore food+feedback (pellet +
feeding halo + feeding-goal motion descriptions) **versus no food** — not
halo-only, and not native CPU/FPS/GPU. Samples use the existing conventions:
7 repeats of 100 calls, 30 warmup renders, source hashes and revision in the
metadata line; the normal 36-combination matrix is unchanged and `--feed`
runs only these three comparisons.

The mode asserts, per count: pellet and halo (`aquarium-food`,
`aquarium-food-halo` descriptions) exist only while food is active — absent in
the baseline, present after `dropFood`, gone after the ten-second expiry
dispatches and gone after suspension clears live food; the queue gains
**exactly one** food expiry task over the original motion/shimmer tasks
(baseline 1/2/3 tasks for 2/5/10 fish become 2/3/4), repeated food renders add
no per-frame timer, and expiry and suspension each cancel the food task from
the queue; all samples are finite.

Medians in milliseconds per call from one ordered baseline-then-food run
(source-description differences, not a statistically controlled cost estimate):

| Fish | Baseline nodes | Food nodes | Baseline render | Food+feedback render | Median delta |
|---:|---:|---:|---:|---:|---:|
|2|83|85|0.06307|0.06287|-0.00020|
|5|115|117|0.08059|0.07841|-0.00218|
|10|167|169|0.12509|0.11566|-0.00942|

The food subtree adds two element descriptions per scene. The negative deltas
do not establish a speedup or zero cost: fixed ordering, VM warmup and timing
variation can affect these small samples. Repeated counterbalanced runs would
be needed for a reliable source-level cost comparison. This establishes
**neither native gain nor native cost** — halo animation, paint and any
FPS/CPU effect of feeding remain unmeasured. The full JSONL
with all raw samples: `/tmp/aquarium-reports/aquarium-benchmark-feed-2026-11-12.jsonl`.

## Actual native process evidence: synthetic 250, enabled versus paused

Measured source commit: **`5a3cf635808f0e6c0cee56d64ee34c58a6276fe7`**.
The fixture copied production `main.js`, `model.js`, and `motion.js`, changing
only main's Herdr import to a fixture shim. SHA-256 of original source:

- `main.js`: `756c7ebdcd9ab1cd90fd2be671d88d77a9d33580dd89bf30f8a46801b56ac25e`
- `model.js`: `bcb50c71de32404d57ab1f42b297f7e6e1de00594ab257a5761abb8c7d046fa4`
- `motion.js`: `91132dd2de48f533b9743e7a51b8e5779bf91db3ddf00b36d362892912598eb6`

### Target and controlled scene

Actual native GUI/rendering host **PID 945**, executable
`Herdr.app/Contents/MacOS/Herdr`, bundle `dev.herdr.app`, owns the app IPC
socket `herdr-app.sock`. Executable/start identity was unchanged across samples.
This is not CLI/check process RSS. Parent independently verified actual OS
foreground PID 945 and visibly painted fish before capture.

The scene contained **250 independent SYNTHETIC roots, all working**, with all
25 species represented 10 times each; it was explicitly labeled synthetic/not
telemetry. It does not represent 250 actual worker terminals. Parent recorded
viewport **1440 × 822** for the source body beneath a **48-pixel banner** in the
870-pixel layout. Both conditions used this same full-width scene, Normal speed,
Smooth turning, free-floating arrangement, and effects false (water and bubbles
off). Parent confirmed two native paused frames A/B were pixel-identical before
the paused GO; this is a static positive control, not an FPS measurement.

The shim makes shared preferences fixture-local/read-only and app commands
no-ops. Its `realWindow() ?? { active: true }` fallback lets headless checks run
without a window snapshot; it is not proof of window activity. OS foreground
was independently verified for the live measurements, and visibly painted fish
provided a separate positive control. CLI checks do not establish native rendering
performance.

### OS process results

Each condition had a 5-second warmup then 31 OS samples over approximately
30 seconds, at 1 Hz. No screenshots, UI changes or switches occurred during
these official windows under the parent's protocol. Values below are copied
from the actual per-condition JSON (RSS KiB divided by 1024 for MiB).

| Counter | Enabled | Fixture paused |
|---|---:|---:|
| Elapsed (s) | 30.007799 | 30.008802 |
| Cumulative CPU delta (CPU s) | 30.430000 | 0.490000 |
| CPU (% of one logical CPU) | 101.406970 | 1.632854 |
| RSS start (MiB) | 230.359 | 237.703 |
| RSS end (MiB) | 210.891 | 237.719 |
| RSS min (MiB) | 210.547 | 237.703 |
| RSS max (MiB) | 230.359 | 237.734 |
| RSS mean (MiB) | 211.355 | 237.713 |

Enabled window: 2026-11-11 **23:28:37.985559–23:29:07.992582 UTC**;
paused: **23:32:51.343420–23:33:21.351443 UTC**. CPU is cumulative process
CPU-time delta divided by monotonic elapsed time; 100% equals one logical CPU,
not the whole machine. The observed difference is **99.774 percentage points**.
Active consumption near **one full core is significant and unresolved**, not
evidence that the dense scene is lightweight.

This is a single sequential whole-app enabled-versus-paused observation, not
isolated motion cost. Both free-floating conditions use PNG assets and construct
both directional image builders; there is no asserted animated-WebP/static-PNG
decode difference. Face, position, opacity, native transitions/tasks and fresh
initial pose can differ. Background app work, OS load, sequential cache/allocator
history, short warmup and sampling overhead confound attribution. Higher paused
RSS does not establish that pause allocates more or animation saves memory.

### Earlier actual small-school observation (different workload)

An earlier 60-second PID 945 capture observed **2 roots + 3 real workers = 5
fish**, saved Normal/Smooth, in the actual workspace. It collected 61 samples
from **2026-11-11 17:12:12.357933–17:13:12.371292 UTC**, monotonic elapsed
**60.014809 s**. Cumulative CPU **1572.48 → 1593.31 s**, delta **20.83 CPU s**,
yielded **34.708100% of one logical CPU**. RSS start/min **239.500 MiB**,
end/max **259.000 MiB**, mean **244.269 MiB**.

These are actual small-school/full-app metrics, not a 250-fish baseline. Real
terminal/worker updates, other workspace/background activity and the parent's
concurrent native-frame capture confound them. No matched idle baseline was
collected. Do **not** compare these numbers apples-to-apples with the synthetic
250 scene or extrapolate per-fish costs.

### Short native stack diagnostic, outside the official windows

A separately authorized unprivileged `sample 945 3` succeeded with symbols and
unchanged process identity. The main thread had 855 stack observations, with a
763-observation GPUI draw branch and 635-observation prepaint subtree. Within
that subtree were a QuickJS/script `call_render_once` path (210 observations),
a sibling native `ScriptView::draw` branch (193), and native layout/Taffy work
(106); native paint work was also visible. These are inclusive sampled stack
occurrences, **not exclusive CPU percentages**: nested counts overlap and must
not be added. Blocking waits on other threads are not CPU-hotness evidence.

The evidence is mixed script snapshot plus native tree/build/layout/paint work,
not an exclusive JS-versus-native bottleneck verdict or exact JS source-line
attribution. Production JS has no requestAnimationFrame/per-frame loop, but the
**native host can execute QuickJS snapshots during render**. Absence of a JS
per-frame scheduler does not mean rendering never re-enters JS.

### Limits and local evidence

No GPU counters, decoded-image residency, frame rate/FPS, leak conclusion or
resource-acceptance claim is supported. RSS is process residency, not private
footprint, aquarium-only memory or GPU memory. Further controlled repetitions
and correctness-preserving investigation of repeated snapshots and native tree
work are needed before optimizing or claiming acceptable dense-school cost.

Durable **local-only** artifacts under the repository's root Git directory
(`.git/aquarium-reports/live-nativeqa/`, not a worktree's `.git` pointer):

- `perf-active.json`, `perf-active.md`, `perf-paused.json`, `perf-paused.md`
- `perf-comparison.md`
- `native250-sample.txt`, `native250-profile-summary.md`
- `small-school-process-report.md`, `small-school-process-samples.json`

These local artifacts are not published raw traces or private captures. This
document records the bounded numeric findings without embedding screenshots or
raw stack traces. Later in the pass, PID 945 exited and a new GUI host, PID 54019,
started at 18:49:34 local time. No restart command was issued; the cause is
unconfirmed. Both official measurements and the stack diagnostic predate that
change and must not be attributed to the replacement process. The historical source-proxy table above remains useful only
for its recorded source-level scope, not as a substitute for these native costs.

## Actual native ordinary-school evidence: synthetic 2/5/10, enabled versus paused

Measured 2026-11-12, repository revision `38564a18276a76bb772ff2e696117ca9f7c71523`
using `tools/prepare-native-fixture.mjs`. Production source SHA-256:
`main.js` `7865128da91914c8bd8cd1cbd054142be48ebc3f14370f7680cd2c4db73a683b`,
`model.js` `aed0bd1f2825d03e3c00f2676b44f434472951b9b988ba2716ee3e248031f775`,
`motion.js` `3dbe6bb4e8e848de75dfcd75611d1c39685688be53870d827cd9668777fba519`,
`presentation.js` `c82ccb5269aee737290c4144ee080c076de5261b92e9d1b5996eb689afa16b60`.
The fixture `model.js`/`motion.js`/`presentation.js` are byte-identical production copies;
per-condition manifests under the report directory record installed == generated hashes.
Both conditions use Normal/Smooth Free-floating with bubbles and waves enabled and no food.
The deterministic species mix includes the three reviewed tail loops. Unlike the historical
250-root effects-off/PNG scene, this is not a movement-only comparison.

Native GUI host **PID 80325**, `/Users/me/Applications/Herdr.app/Contents/MacOS/Herdr`,
bundle `dev.herdr.app`, owner of `herdr-app.sock` (established by OS process queries, not the
CLI). Start time `Wed Nov 11 23:38:56 2026`, unchanged across every window. Each condition had
a 5-second warmup then a 15-second official window with 1 Hz OS cumulative process CPU-time and
RSS samples plus per-sample foreground checks; only windows with all 16 samples showing Herdr
frontmost count as valid, and windows that failed this are kept as invalid evidence. No shots,
checks or status calls occurred inside official windows. Banner OCR confirmed the shown scene
before every window; enabled screenshot A/B pairs differ and paused pairs are byte-identical
(static control). 100% equals one logical CPU.

| Condition | CPU (% of one logical CPU) | RSS start (MiB) | RSS end (MiB) | RSS mean (MiB) |
|---|---:|---:|---:|---:|
| 2 enabled | 22.03 | 163.656 | 164.156 | 163.897 |
| 2 paused | 0.73 | 235.906 | 216.828 | 233.534 |
| 5 enabled | 26.31 | 239.109 | 239.656 | 239.384 |
| 5 paused | 0.73 | 240.531 | 240.672 | 240.499 |
| 10 enabled | 32.06 | 237.719 | 248.078 | 235.493 |
| 10 paused | 1.20 | 280.328 | 253.875 | 265.454 |

These are single sequential whole-app observations per condition, not attribution: app user
activity (the operator used other apps between windows), whole-app background work, sequential
cache/allocator history and the short 15-second windows confound any comparison, and RSS
differences must not be read as pause or animation memory effects. The worker returned to
`aquarium`; the coordinator then restored the last observed pre-run `aquarium-immersive`
layout and verified it. The coordinator independently recomputed all six CPU/RSS summaries
from the raw samples and checked stable process identity and 16/16 foreground samples. Raw JSON, manifests, invalid windows and the
full report are kept local-only under `.git/aquarium-reports/ordinary-native/2026-11-12T06-10-00/`.
The fixture mod and two fixture layouts were intentionally left installed for parent
inspection; existing user layout/mod files, terminals and saved preferences were not edited. No GPU, FPS or
decoded-image-residency claims are supported by this run.

## Bounded read-only live ordinary stack diagnostic (ordinary-profile, 2026-11-12)

One 3-second unprivileged `/usr/bin/sample` of the live GUI host, PID 80325
(`/Users/me/Applications/Herdr.app/Contents/MacOS/Herdr`, version 0.1.15), taken
at 01:10:42 local while Herdr was the foreground app (`lsappinfo info ASN:0x0-0x117117`
showed `(in front)`, `type="Foreground"`). PID identity (command + start time
2026-11-11 23:38:56) was verified before and after the capture and matched; no CLI
helper was sampled. Scene per `herdr-app status`: layout `aquarium-immersive`,
active space `herdr-aquarium-theme`, agent `t2`. Installed mod (plain copy at
`~/.config/herdr-app/mods/aquarium/`, not a git checkout; repo revision 8ea1e8c)
SHA-1 (from `shasum`, independently checked by the coordinator):
`main.js` `a7654e954893a32f0656feaf50f58df9e3a043fa`,
`model.js` `cf912d8c418034d52bc45ad366e7cda3e53a571f`,
`motion.js` `b86e6c121aec5a36a2f7076985671c68a572f5b3`,
`presentation.js` `9f4a99ec1896dba741843caac726770d17ffaf5a`.
Raw output: `.git/aquarium-reports/ordinary-profile/20261112T011041/sample.txt` (local-only).

Inclusive sample counts (1275 main-thread samples in 3 s; paths overlap, wait
points are not exclusive CPU, and overlapping paths must not be summed): the main
run loop serviced the main dispatch queue in 850; `gpui_macos::window::step` 825;
`Window::draw` 576, of which `draw_roots` 368 and inside it
`AnyElement::prepaint_as_root` 354 — a deep nested `Div::prepaint` chain that stays
near-constant (~353 down to ~349) across dozens of nesting levels, i.e. the
substantial native tree prepaint appears in the sampled draw path. This alone does not
establish that every element is re-prepainted on every frame. Top Herdr-internal leaf
frames: `BoundsTree::insert` 26, `ElementId::hash` 15, `SmolStr::hash` 13,
`materialize_component` 13, `compute_flexbox_layout` 19 (+ block 9),
`resolve_ops` 11, `ElementId::eq` 12. The mod's own JS render path
(`ShellRuntime::build_snapshot` / `call_render` via rquickjs) is 3 samples
(3 of 1275 main-thread observations). This is not an exclusive CPU percentage;
the short capture does not rule out script or materialization costs in other scenes.

Comparison with the earlier `native250-sample.txt` is qualitative only: different
PID, scene (live school with eight pilot species supported at 8ea1e8c, not eight
observed families; layout `aquarium-immersive`), sample
duration and tool conditions; numbers are not comparable.

Finding: native layout/prepaint is a worthwhile investigation target in this capture.
The host controls redraw scheduling and exposes no documented dirty-region API to mods;
this limits available remedies but does not prove that repository-level improvements
are exhausted. One concrete source-level candidate is `drawFish`/`pose` in
`mods/aquarium/main.js`: Free-floating constructs both facing images per fish and
sets one to opacity zero. Building only the needed facing could reduce description
tree size, subject to smooth-turn/attention/facing regressions. The sample does not
establish whether invisible images incur measurable work or predict a native CPU
saving. No GPU, FPS, resource-acceptance or exclusive-attribution claim follows
from this single capture.

Source-tree result for the `drawFish`/`pose` candidate: the redundant second
facing image is removed only in non-animating free renders (pause, suspension,
inactive window), which now build exactly one selected-facing image per fish —
one fewer image description per fish per parked frame. While animating, both
facings stay mounted deliberately: the hard turn (turning disabled) swaps facing
instantly at full container opacity and the smooth turn reveals the new facing
over a 200 ms container fade. Retaining the pair is a conservative choice pending
native swap/decode timing checks, not evidence that a single image cannot work.
Decoded-image residency is documented above as unestablished, and this pass did
not validate native swap/decode timing.
The active-window benchmark cases are unchanged by design (they legitimately
retain both facings), so no render/median movement there is expected or claimed.
This is a description-count change in parked frames only; it is not a native
CPU, FPS, GPU or memory benefit claim.

## Actual native ordinary-school feed comparison: food + halo versus no food (2026-11-12)

Repository revision `1aca9ef55bc0b3f4a728f8b5cb05cce90e435595`, clean. Same
bounded protocol as the ordinary-school evidence above, via
`tools/prepare-native-fixture.mjs` (`--count 2|5|10`, `--food` for the
autoplay pellet, no `--paused`), one recorded window per condition on
GUI host Herdr PID 80325 (`dev.herdr.app`, unchanged start identity,
Herdr frontmost at every 1 Hz sample). Food autoplay drops one pellet 250 ms
after mod init (10 s expiry); a pre-window screenshot proved the pellet
visible before each official window and a post-window screenshot proved it
still present after (window ended ~6.1 s after the drop, inside the 10 s
expiry). Banner OCR per condition confirmed `FOOD AUTOPLAY ON` / `FOOD OFF`.
A preliminary pellet-detector check aborted before any official sampling: its
12×12 solid-core requirement was too large for the bordered pellet. After
correcting that detector, six official windows were recorded; no failed timing
window was discarded. Official windows: 5.035–5.054 s at 1 Hz cumulative CPU +
RSS, after approximately 1 s warmup. The cost includes the
pellet, its feedback ripple and any fish goal state it primes.

| Condition | CPU s / ~5 s | % of one logical CPU | RSS mean (MiB) |
|---|---:|---:|---:|
| 2 food | 1.27 | 25.22 | 220.03 |
| 2 no food | 1.21 | 23.99 | 221.39 |
| 5 food | 1.39 | 27.51 | 221.95 |
| 5 no food | 1.45 | 28.69 | 222.42 |
| 10 food | 1.65 | 32.70 | 219.22 |
| 10 no food | 1.63 | 32.28 | 222.10 |

Food-minus-no-food differences were +1.24, −1.18 and +0.42 **percentage
points** of one logical CPU for 2, 5 and 10 roots respectively. One short run
per condition, always food before no food, cannot separate an effect cost from
run/order variability or establish a noise bound. This is not evidence of zero
cost or a speedup; no GPU, FPS or decoded-image-residency claim follows. Raw
per-sample JSON, manifests, per-condition hash chains and screenshots are
local-only under `.git/aquarium-reports/feed-native/2026-11-12T06-56-28Z/`.

## 2026-11-12: matched native A/B for the terminal-lookup index candidate (issue #5 minimal)

Local/private evidence; raw artifacts under
`.git/aquarium-reports/schoolcpu-native/2026-11-12T14-18-47Z/` (not committed).

Matched native A/B on GUI host Herdr PID 80325 (`dev.herdr.app`, unchanged start
identity, Herdr frontmost at every sample; never raised). Arm A = `main.js` at
`5af7141` (two `all.find` terminal scans); arm B = the render-local
`terminalByAddress` Map change (`main.js` SHA-256
`0b8372dfa4f31ae7957b1b953c4df2b4305db01173bdb6c0ee60008f071fd3c6`). Synthetic fixtures from
`tools/prepare-native-fixture.mjs` (baseline generated from a /tmp repo copy
with the git-baseline `main.js`; both 250-root fixtures used a /tmp generator
copy with the count allowlist widened — repo files untouched). Same everything
else per window: 10 working roots, free arrangement, speed `normal`,
bubbles/water on, motion enabled, food off, only `aquarium.js` differing;
installed hashes and `herdr-app check` verified outside every official window.
Order A-B-B-A, one attempt per scheduled window, 3 s warmup + 10 s official at
1 Hz cumulative CPU + RSS + foreground; 11/11 Herdr-frontmost samples required.

All four count-10 windows were valid (11/11 front samples each):

| Window | Arm | CPU s / actual elapsed s | % of one logical CPU | RSS mean (MiB) |
|---|---|---|---:|---:|
| 1 | A | 3.15 / 10.048 | 31.349 | 217.112 |
| 2 | B | 3.13 / 10.048 | 31.149 | 210.639 |
| 3 | B | 3.17 / 10.047 | 31.551 | 211.439 |
| 4 | A | 3.24 / 10.045 | 32.254 | 211.689 |

B−A: −0.45 **percentage points** of one logical CPU (arm means 31.35 vs 31.80),
−1.42 % relative to A. Both adjacent ordered pairs are negative (−0.20, −0.70
pp), but two paired repeats in one session are not a reliable long-term
estimate: arm A's own windows differ by 0.90 pp, whole-app CPU confounds both
arms, and no statistical support exists for any noise or zero-cost claim. The
ordinary 10-root scene shows no clear native CPU effect either way for this
change; this is not a native paint proof of the source-only dense gain.

The small lookup change is retained to replace repeated per-fish linear scans
with one render-local index, preserving first-match semantics and next-render
freshness. It is not a demonstrated solution to the active CPU cost in #5.

**250-root stress arm: invalid pre-measurement condition, not measured.**
`herdr-app check` failed on both generated 250-root fixtures (baseline and
candidate), reporting `interrupted` at different render-stack sites, while both
10-root fixtures passed. The captured errors do not establish the underlying
interruption mechanism or whether a live 250-root window would fail. Per the
validation gate, no 250-root fixture was installed or measured: no partial 250
performance data exists. A dense-scene native benefit therefore remains
unproven.

Banner OCR outside the official windows confirmed `10 ROOTS — ENABLED — FOOD
OFF` before and after; `status.errors` stayed `[]`; the owned fixture mod tree
and both fixture layouts were restored byte-identical, `shared.json`,
`window.json`, `settings.json` were byte-unchanged, and the captured current
layout (`aquarium-immersive`) was restored.

## Background fidelity note (2026-11-12, source `ff01452`)

The earlier generator-based ordinary-school, food and terminal-lookup
comparisons used fixtures without the production bright habitat background
(`habitat-bright-v1.svg`, `fit: cover`). Their internally matched comparisons
remain measurements of those isolated scenes, but omit the faithful production
background cost. Dark fixture labels did not demonstrate a production contrast
defect: the corresponding production layouts already provided the bright SVG.

The generator now includes that byte-identical asset through a fixture-local
layout background; native paint was independently confirmed (see
`docs/native-fixture.md`). New background-bearing CPU/RSS windows are **not
directly comparable** to old background-less windows without matched
re-measurement. No CPU change is claimed from this fixture correction.

## Bubbles and surface waves native comparison, 2 roots (2026-11-12, source `f765d76`)

Whole-app Herdr CPU/RSS comparison of the native bubbles layer and the native
surface-wave layer on the bright-background fixture, using the existing
production `aquarium.bubbles` and `aquarium.water` shared flags overridable in
the fixture shim. Four conditions — A bubbles+surface on, B bubbles off, C
surface off, D both off — each measured twice in mirrored order A-B-C-D-D-C-B-A,
one attempt per recorded window, 3 s warmup plus a 10 s official 1 Hz window
(11/11 frontmost samples, identity stable). A preliminary installed-file hash
comparison aborted before any official window; after correcting that check,
all eight planned windows were recorded. Only the fixture-local `shared()` returns
and the banner text differed; animate on, free arrangement, normal speed, food
off, same avatars/data/backdrop. Raw evidence:
`.git/aquarium-reports/effects-native/2026-11-12T15-21-23Z/` (private).

| Condition | CPU % mean (one logical CPU) | RSS mean of window means (MiB) |
|---|---:|---:|
| A: bubbles on, surface on | 22.58 | 269.6 |
| B: bubbles off, surface on | 23.39 | 282.4 |
| C: bubbles on, surface off | 22.88 | 282.2 |
| D: both off | 21.78 | 278.1 |

Window-level CPU (CPU % = 100 × CPU-s delta ÷ actual elapsed): A 22.97/22.19,
B 23.29/23.50, C 22.99/22.78, D 21.37/22.19.

Relative to A, bubbles off changed CPU by **+0.81 percentage points**,
surface off by **+0.30 pp**, and both off by **−0.80 pp**. These are simple
contrasts against the all-on case, not isolated component costs. The non-additive
interaction contrast is **−1.91 pp**; the two A windows differ by 0.78 pp and
the D windows by 0.82 pp. Two observations per condition cannot distinguish
reliable savings from session variability or establish an interaction mechanism.
**Neither layer is a demonstrated optimization target**, and no zero-cost
claim follows.

RSS window means rose from 239.5 to 299.7 MiB in run order, across fixture
reloads. This design cannot distinguish cache/allocator retention from other
memory growth, including retained work. It establishes neither a leak nor a
per-layer memory cost.

Paint verification (shots and OCR outside the official windows): banner OCR read
the true per-condition flags on all 8 windows; edge-strip glyph analysis shows
bubble glyphs present in every ON window and absent in every OFF window; with
bubbles held off, the 48-px surface strip differs on ~96 % of left-half pixels
(+3.3/+2.2/+1.4 mean RGB, matching `surface.svg`'s mint blend) while the rows
below are byte-identical, so the static background waves are cleanly separated
from the animated overlay.

Limitations: whole-app inclusive comparison (layer removal), not an exclusive
CPU/GPU attribution or noise bound; 2 paired repeats in one session are not
statistical proof; ordinary fish motion phase and system variability apply; no
GPU/FPS measurement or proof of continuous animation from the sampled stills.
The owned fixture tree, both fixture layouts and selected layout were restored;
captured settings/shared/window/view hashes were unchanged.
