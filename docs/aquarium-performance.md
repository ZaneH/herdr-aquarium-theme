# Dense-school source cost (issue 5)

Measured 2026-11-11, base `de3be2f1f90f312ef9e09bdac90cbe79fce9ba1a`.
Production files were read only. This is **not a live paint benchmark** and does
not complete issue 5's CPU/GPU/decoded-image-memory acceptance check.

## Reproduce

```sh
node tools/benchmark-aquarium.mjs --self-check
node tools/benchmark-aquarium.mjs > /tmp/aquarium-benchmark.jsonl
```

No dependencies. Node v26.12.1, V8 14.6.202.34-node.40, Darwin 27.0.0,
Apple M1 (8 cores). Output includes source SHA-256s, revision, environment,
and all seven samples. Each sample is 100 calls, after 30 render warmups.
Fixed order; no timing thresholds. Medians below are milliseconds/call.
Source is read at execution time, not embedded: rerun after combined changes.

| Agents | Shape | Arrangement | Description nodes | Render | Grouping alone | Scheduler callback |
|---:|---|---|---:|---:|---:|---:|
|0|flat|organized|55|0.03094|0.00013|no task|
|0|flat|free|55|0.02858|0.00010|no task|
|0|nested|organized|55|0.02804|0.00009|no task|
|0|nested|free|55|0.02791|0.00009|no task|
|100|flat|organized|901|0.52317|0.01359|no task|
|100|flat|free|1102|0.62783|0.01335|0.01226|
|100|nested|organized|821|0.48235|0.01853|no task|
|100|nested|free|1022|0.55397|0.01869|0.00248|
|250|flat|organized|2175|1.41430|0.03625|no task|
|250|flat|free|2676|1.68391|0.03646|0.03007|
|250|nested|organized|1975|1.33274|0.04999|no task|
|250|nested|free|2476|1.52237|0.05115|0.00440|

## What actually ran

The current `main.js` class runs in a Node VM with current model/motion helpers.
Imports are removed only to supply proxy element builders and synthetic Herdr
snapshots. Builders allocate descriptions and retain children and method
arguments, execute `when`, but do not execute event/style callbacks. Render
includes grouping, geometry, details, options construction and motion sync.
It excludes module startup and init. The self-check traverses the retained
result to verify 20 fish buttons, family scheduler population, and cancellation.

900x500 workspace, active window, motion enabled, slow speed, smooth turns,
bubbles/water enabled, options closed. Statuses cycle working/idle/blocked/done.
Nested fixtures contain ten-fish broods, roots every ten addresses and bounded
ancestry (up to five parent edges); flat fixtures have no parents. Terminal
count equals agent count. No real terminals or agents are created. Scheduler
samples advance the synthetic clock directly to each next deadline; they
measure callback work, not real wakeup frequency. Organized/empty cases have
no pending callback, so tiny no-op timings are intentionally not reported.

## Evidence and limits

100→250 agents is 2.5× input: render grows 2.68–2.76×; description nodes are
approximately linear; flat free scheduler grows 2.45×. This supports roughly
linear behavior only over these fixtures, not an asymptotic guarantee. Source
inspection shows a per-fish `all.find` terminal lookup: quadratic worst-case
comparison count even in flat schools. It was not isolated with native profiling
and is not justification for speculative production changes. Grouping walks
ancestry for every agent: bounded-depth fixtures are near-linear, but an
unbounded chain can be quadratic. Deep chains, many non-agent terminals,
oversized single broods, narrow/immersive views and adversarial cycles need
separate coverage. No egregious measured scheduler hotspot found.

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

Followup: rerun this script on combined child-discovery changes, retain JSONL,
then separately establish check process ownership from implementation or process
tracing before isolated startup CPU/RSS experiments. Actual crowded-school
paint CPU/GPU and decoded residency require an authorized isolated renderer
with real counters; paused/hidden live work also remains unmeasured.
