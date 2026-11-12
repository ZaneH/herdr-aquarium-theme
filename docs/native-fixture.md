# Synthetic native fixture

`tools/prepare-native-fixture.mjs` prepares an isolated, read-only Herdr mod tree
for bounded native checks of the aquarium. It only writes a new output directory.
It does not install, launch, switch layouts, read terminal content or change saved
settings.

```sh
node tools/prepare-native-fixture.mjs --out /tmp/aquarium-native-5
node tools/prepare-native-fixture.mjs --out /tmp/aquarium-native-5-paused --count 5 --paused
node tools/prepare-native-fixture.mjs --out /tmp/aquarium-native-10-food --count 10 --food
node tools/prepare-native-fixture.mjs --out /tmp/aquarium-native-5-cycle --attention-cycle
herdr-app check /tmp/aquarium-native-5/mods/aquarium-native-fixture
```

Parameters are only the synthetic root count (`2`, `5` or `10`), `--paused`
(enabled is the default) and `--food` (start one pellet after 250 ms when the real
host reports an active window, enabled motion and free arrangement).

## What is generated

```text
OUT/
  fixture.json
  mods/aquarium-native-fixture/
    main.js              synthetic banner wrapper + optional startup food
    aquarium.js          production main.js with only the Herdr import and ART root redirected
    fixture-herdr.js     local synthetic data and fixture-only settings
    model.js             byte-for-byte production copy
    motion.js            byte-for-byte production copy
    presentation.js      byte-for-byte production copy
    assets/              byte-for-byte production assets copy
    mod.json
  layouts/
    aquarium-native-fixture.json
    aquarium-native-fixture-attention.json
```

The primary layout has exactly the requested number of working synthetic roots.
The attention layout adds one synthetic raw child with `status: "blocked"` under
the first root, so production discovery, family grouping and blocked attention
can be observed without creating or changing a real terminal. Documentation,
hashes and the two layout names are recorded in `fixture.json`.

## Background and banner fidelity

Both generated layouts carry the same background block as the non-immersive
production `aquarium` layout — `{ "image":
"mods/aquarium-native-fixture/assets/habitat-bright-v1.svg", "fit": "cover" }` —
pointing at the byte-identical copied asset, so fixture captures show the real
backdrop the production ink (`#0a2028`) and focus paints were chosen for. The
path stays fixture-local (`aquarium-native-fixture`); production layouts,
mods and assets are never touched. The provenance banner paints an explicit
dark navy bar (`#173b46`) with white text (`#ffffff`) so it stays readable
against the bright backdrop; that styling is on the diagnostic banner bar
only, never the fish labels.

The historical fixtures generated before this change omitted the background
block entirely, so raw captures showed a dark scene and the navy fish labels were
hard to read. That was a fixture fidelity gap only: it did **not** demonstrate a
production contrast defect, because the production layouts always painted the
versioned bright habitat behind the same ink. Native CPU/RSS comparisons
recorded in `docs/aquarium-performance.md` were measured within that
missing-background fixture; see the note there before comparing numbers.

Native observation (2026-11-12): a fresh `--count 2 --paused` fixture shown
once for 1.4 s painted the bright backdrop, dark fish labels and white-on-navy
banner. The coordinator independently inspected the capture. Herdr was already
frontmost; the original fixture files and selected layout were restored, with
settings/shared/window/view hashes unchanged. Private evidence:
`.git/aquarium-reports/fixture-background/2026-11-12T15-08-03Z/`.
This is paint confirmation, not physical-input or performance acceptance.

The shim:

- returns synthetic agents, terminals and one synthetic space;
- uses a deterministic conventional species mix, including the reviewed
  animated `clownfish`, `blue_tang` and `koi` species;
- keeps `aquarium.paused`, arrangement, speed, turning, bubbles and water
  fixture-local;
- makes `run`/`setShared` no-ops and `nextCommand` never resolve;
- returns the real Herdr window snapshot only. There is no `active: true`
  fallback that could make a headless check look like live animation.

## Opt-in timed attention cycle (`--attention-cycle`)

Only the attention layout gains the cycle. The synthetic child walks a
deterministic four-phase sequence. Banner T+ values are the scheduled fixture
timeline, not measured wall-clock or paint timestamps; native callbacks may run late:

```text
T+0ms     WORKING   child status "working"
T+3000ms  BLOCKED   child status "blocked"
T+6000ms  WORKING-2 child status "working"
T+9000ms  BLOCKED-2 child status "blocked"
T+9200ms  fixture-only suspension interrupts the final approach (no further timers)
```

Each phase dwells 3000 ms, far above the ~400 ms production status-transition
target (CLI capture latency itself is unmeasured), so a capture is unlikely
to race a transition. The wrapper renders
` — ATTENTION CYCLE: <LABEL> PHASE <N>/4 T+<MS>MS` into the banner, so each
capture records its own phase and timestamp. 200 ms into the final BLOCKED-2
phase the wrapper performs the production pause path once — `this.suspended =
true`, `this.stopMotion()`, `attentionCycle.suspend()`, callback `cx.notify()` —
and the banner appends ` — INTERRUPTED (SUSPENDED) AT T+9200MS`, so the
interruption is recorded with its state and time. There is no recurring frame
loop: the wrapper schedules at most three bounded one-shot phase
cx.timer.after callbacks plus that single 200 ms interruption callback, never
reuses the init context (each callback receives and forwards its own cx),
guards stale callbacks behind `this.closed`, and `close()` cancels every native
handle plus the cycle clock (`attentionCycle.close()` drops every pending
callback). Tests dispatch the fixture-local clock directly
(`attentionCycle.advance(ms)`), and a generated-wrapper lifecycle test drives
the mocked native timer callbacks with distinct per-callback contexts. All
data, status and preference mutation stays synthetic. `fixture.json` records
the dwell, phase labels, phase sequence length (9000 ms), interruption timer and banner
recipes. The cycle is module state shared by every wrapper copy of one
generated fixture: only the copy that started it closes it, so one generated
module runs one cycle (a fresh generation or a fresh module import resets it),
and closing a primary-layout copy never breaks the cycle. Default fixtures
without the flag are byte-identical to before; only the new opt-in adds the
`cycle: true` layout prop and `fixture.json` metadata.

The generator refuses an existing output path and paths inside this repository
or the default/custom live Herdr app home (`HERDR_APP_HOME`), including existing symlink aliases. A failed write removes only the newly
created output directory.

## Safe manual native use

Inspect `fixture.json` and run `herdr-app check` first. Then, only if the two
destination names are unused:

```sh
test ! -e ~/.config/herdr-app/mods/aquarium-native-fixture
test ! -e ~/.config/herdr-app/layouts/aquarium-native-fixture.json
test ! -e ~/.config/herdr-app/layouts/aquarium-native-fixture-attention.json
cp -R OUT/mods/aquarium-native-fixture ~/.config/herdr-app/mods/
cp OUT/layouts/aquarium-native-fixture*.json ~/.config/herdr-app/layouts/
herdr-app check ~/.config/herdr-app/mods/aquarium-native-fixture
```

Select the fixture layout manually, observe, then restore the previous layout and
remove only the two fixture layouts and the fixture mod. Do not remove or replace
the installed `aquarium` mod or the original layouts.

## Limits

`herdr-app check` proves that the generated description loads and eager elements
materialize. It is not paint, animation, FPS, CPU, GPU, decoded-image residency,
input or lifecycle evidence. A successful check does not establish native
aquarium performance, and it does not prove that the timed attention cycle
interpolates between phases on screen: the phase timers, status flips,
interruption and banner timestamps are fixture source, verified only by the
Node tests' local clock dispatch and mocked-native lifecycle test, never by
native paint. The 200 ms final-phase interruption exercises the production
suspend path in fixture source only, not a real pause triggered by a real
host. The attention child is synthetic
structure, not a real agent failure. The food pellet expires after ten seconds
and only starts if the real host window is active. No fixture result should be
described as telemetry.
