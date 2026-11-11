# Dense-school source cost (issue 5)

## Integrated-source rerun after discovery, lifecycle, palette and geometry fixes

This supersedes the child-discovery timing table measured at `6241385`.
The coordinator ran the final integrated root source; this document uses that
output, not a rerun of the implementer's older worktree. Production files were read only. This is **not a live paint benchmark** and does
not complete issue 5's CPU/GPU/decoded-image-memory acceptance check.

```sh
node tools/benchmark-aquarium.mjs --self-check
node tools/benchmark-aquarium.mjs > /tmp/aquarium-benchmark-final.jsonl
```

Raw samples and complete metadata: `/tmp/aquarium-benchmark-final.jsonl`.
No dependencies, timing assertions, or CI timing threshold. Seven samples of 100 calls each, 30 render
warmups; fixed case order. Values below are medians in milliseconds per call.

Measured 2026-11-11T16:33:36.755Z; production revision `0450417839b352011251c814ca14fb7d6b1b90bc`.
Node v26.12.1, V8 14.6.202.34-node.40, darwin 27.0.0, Apple M1 (8 cores).

Source SHA-256:

- `main.js`: `ab25416321f2de86af67ba8d5f1fd4a9fb1de27dc58128391213d87a5768f4f7`
- `model.js`: `1cfee89af4e269e9745997e6d6aedee81c5d18d48df1f59f7b58122c1b3fcdcd`
- `motion.js`: `91132dd2de48f533b9743e7a51b8e5779bf91db3ddf00b36d362892912598eb6`

| Fish | Shape | Listed | Arrangement | Nodes | Render | Discovery | Grouping | Scheduler |
|---:|---|---:|---|---:|---:|---:|---:|---:|
|0|flat|0|organized|55|0.03177|0.00011|0.00014|no task|
|0|flat|0|free|55|0.02653|0.00008|0.00011|no task|
|0|nested|0|organized|55|0.02649|0.00007|0.00009|no task|
|0|nested|0|free|55|0.02653|0.00007|0.00009|no task|
|0|hidden|0|organized|55|0.02630|0.00007|0.00009|no task|
|0|hidden|0|free|55|0.02630|0.00007|0.00009|no task|
|100|flat|100|organized|901|0.56617|0.00605|0.01367|no task|
|100|flat|100|free|1102|0.66410|0.00611|0.01381|0.01162|
|100|nested|100|organized|821|0.51812|0.00604|0.01907|no task|
|100|nested|100|free|1022|0.58707|0.00604|0.01874|0.00258|
|100|hidden|10|organized|797|0.51324|0.00739|0.02018|no task|
|100|hidden|10|free|997|0.58541|0.00738|0.01957|0.00241|
|250|flat|250|organized|2175|1.43690|0.01522|0.03821|no task|
|250|flat|250|free|2676|1.80736|0.01534|0.03831|0.02869|
|250|nested|250|organized|1975|1.40231|0.01514|0.05292|no task|
|250|nested|250|free|2476|1.62465|0.01547|0.05249|0.00423|
|250|hidden|25|organized|1914|1.39406|0.01896|0.05514|no task|
|250|hidden|25|free|2414|1.63188|0.01851|0.05551|0.00374|

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
single broods remain separate followup cases. Current geometry assigns separate
scroll bands to taller-than-tank families and to multiple fitting families that
each exceed half the viewport in both dimensions. Single fitting families and
ordinary full-tank routes remain unchanged; ordinary routes may still cross.
This static target separation is not native clickability or collision acceptance.

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
