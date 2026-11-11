# Dense-school source cost (issue 5)

## Current-source rerun after child discovery

This supersedes the pre-discovery timing table from commit `2f84609`.
Production files were read only. This is **not a live paint benchmark** and does
not complete issue 5's CPU/GPU/decoded-image-memory acceptance check.

```sh
node tools/benchmark-aquarium.mjs --self-check
node tools/benchmark-aquarium.mjs > /tmp/aquarium-benchmark-discovery.jsonl
```

Raw samples and complete metadata: `/tmp/aquarium-benchmark-discovery.jsonl`.
No dependencies or timing assertions. Seven samples of 100 calls each, 30 render
warmups; fixed case order. Values below are medians in milliseconds per call.

Measured 2026-11-11T15:48:03.146Z; production revision `624138546649e59218aa539159812ccf102e4ffc`.
Node v26.12.1, V8 14.6.202.34-node.40, darwin 27.0.0, Apple M1 (8 cores).

Source SHA-256:

- `main.js`: `d1e8bfbe17835b6d0ce78cd275982fdefd7dd993c5a2a84a45af8730e905f5ea`
- `model.js`: `b540f40f1310f7890d5786e1d77e2e8590b01ea0ddcfcce9f6ecfa2a0f89785e`
- `motion.js`: `91132dd2de48f533b9743e7a51b8e5779bf91db3ddf00b36d362892912598eb6`

| Fish | Shape | Listed | Arrangement | Nodes | Render | Discovery | Grouping | Scheduler |
|---:|---|---:|---|---:|---:|---:|---:|---:|
|0|flat|0|organized|55|0.03081|0.00011|0.00013|no task|
|0|flat|0|free|55|0.02723|0.00008|0.00011|no task|
|0|nested|0|organized|55|0.02681|0.00007|0.00009|no task|
|0|nested|0|free|55|0.02706|0.00007|0.00009|no task|
|0|hidden|0|organized|55|0.02736|0.00007|0.00009|no task|
|0|hidden|0|free|55|0.02677|0.00007|0.00009|no task|
|100|flat|100|organized|901|0.52262|0.00612|0.01369|no task|
|100|flat|100|free|1102|0.63044|0.00631|0.01390|0.01185|
|100|nested|100|organized|821|0.49638|0.00611|0.01877|no task|
|100|nested|100|free|1022|0.57193|0.00610|0.01876|0.00245|
|100|hidden|10|organized|797|0.47568|0.00763|0.01968|no task|
|100|hidden|10|free|997|0.55472|0.00752|0.02052|0.00265|
|250|flat|250|organized|2175|1.42278|0.01541|0.03651|no task|
|250|flat|250|free|2676|1.72924|0.01526|0.03620|0.02929|
|250|nested|250|organized|1975|1.33961|0.01579|0.05075|no task|
|250|nested|250|free|2476|1.55040|0.01611|0.05046|0.00438|
|250|hidden|25|organized|1914|1.33722|0.01915|0.05367|no task|
|250|hidden|25|free|2414|1.53091|0.01881|0.05291|0.00381|

## Fixture and measured scope

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

Scheduler samples jump the synthetic clock to successive deadlines: callback
cost, not real wakeup frequency or CPU utilization. Empty/organized cases have
no pending callback. Bounded-depth families and element counts scale roughly
with fish count; this does not establish asymptotic linearity. Per-fish terminal
`all.find` has quadratic worst-case comparisons; grouping walks ancestry per
fish, so deep chains can also be quadratic. These are source-level caveats,
not an isolated measured egregious hotspot or a reason for speculative edits.
Many non-agent terminals, deep chains, narrow/immersive views and oversized
single broods remain separate followup cases.

Proxy overhead, VM/Node versus native JS engine, GC and fixed-order warming
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
