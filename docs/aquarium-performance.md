# Dense-school source cost (issue 5)

## Integrated-source rerun after discovery, lifecycle, palette and geometry fixes

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

Scheduler samples retain all pending tasks with absolute synthetic deadlines
and per-task cancellation, dispatching the earliest deadline on each tick.
Free samples measure queue selection plus real dispatched callbacks, including
possible early completion-expiry work, and the dispatch assertion overhead—not
pure motion callback cost, real wakeup frequency, or CPU utilization.
Empty/organized scheduler values are `null`: not sampled, **not** evidence of
no timers (organized cases can own completion-expiry tasks). Nodes are counted
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
