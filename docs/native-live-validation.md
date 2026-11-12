# Controlled native validation — 2026-11-11

This is bounded native evidence, not blanket acceptance. PR #8 remains draft.
The live runtime source was `5a3cf635808f0e6c0cee56d64ee34c58a6276fe7`;
the gallery and reporting commits do not change those runtime files.

## Bugs found and fixed in the live pass

- **Stale habitat:** installing brighter SVG bytes at the existing image paths
  left the old background visible. New versioned habitat image/preview paths
  displayed the bright art without a restart at that point. Cache internals are
  not established by that observation.
- **Raw child navigation:** `agent.focus` on a genuine pane-less child left the
  parent selected. Herdr's native child-list workflow uses `terminal.peek`, which
  opened the correct worker. Raw fish now dispatch that endpoint and return
  before suspension/layout navigation. Mapped agents retain their existing
  focus/terminal path. Regression dispatch is tested; pointer activation is not.
- **Initial pile-up:** actual short core IDs `t1`–`t9` all produced initial
  `(0,0)` positions. Placement-only 32-bit mixing now spreads both coordinates
  deterministically. Species hashing and motion/heading seeds are unchanged;
  repeatability, original species/seeds and bounds have regression coverage.

## Actual movement and children

- The real workspace displayed two roots and three genuine pane-less worker
  children, with inherited species, smaller sizing and separate targets.
- 36 timestamped tank frames over 35.09 seconds cover the five-fish workspace
  at the saved Normal/Smooth settings. Clear legs and reversals in both root
  species had no sustained backwards-facing mismatch; the three children
  followed their parent's displacement and reversal.
- A read-only native fixture then filtered the same two real roots into two
  360-pixel-wide panels. Four combinations of Slow/Normal and Smooth/Instant
  yielded 34 frames each at 1 Hz, approximately 33.2 seconds per case.
  Independent image review found no sustained facing/displacement mismatch on
  clear sampled legs in either species. Short bounds and near-vertical paths
  make horizontal displacement different from nominal scalar speed.
- A real worker was subsequently terminated through the core API. After the
  view settled, the actual workspace showed the remaining two children rather
  than the earlier three. This is one exit observation, not complete spawn,
  nested-family, orphan, parent-exit or status-transition acceptance.

The fixture copied model/motion byte-for-byte and changed the main module only
by redirecting its Herdr import to a read-only shim. No saved preferences or
app commands could escape it. These are actual native paint observations with
controlled data/accessors, not merely CLI materialization.

**Limits:** 1 Hz does not establish subsecond stationary-turn timing, smooth
fades, frame pacing, comfortable pointer activation, keyboard behavior, all 25
species in motion, or every live status transition. Those acceptance items stay
open.

## Waves, resize and pause

- Native effect fixtures sampled 420, 900 and 1400-pixel tank viewports: 13
  frames over 12 seconds each, longer than the 9-second wave period. Viewports
  were resized through the layout API while animation was enabled, not by OS
  window/pointer automation. Settled frames covered both ends without obvious
  compression, gaps or hard tile joins.
- **Resize exception retained:** the first requested-900 frame still showed
  the old approximately 420-pixel view: wave, controls, clipped hint, wrapped
  banner and footer all retained the old bounds. The next sampled frame showed
  the wider view. This supports whole-view/clip or last-frame settling rather
  than an isolated wave-width failure, but does not establish host cause or
  duration. It is not an uninterrupted-resize pass; issue #3 remains open.
- Both actual shipped layout trees were separately observed for 13 frames over
  approximately 12.18 seconds each. Their 1172-pixel-wide tanks showed full-width
  coverage with no obvious gaps, compression or hard joins in sampled frames.
- A settled paused effect fixture produced two pixel-identical whole-window
  native frames two seconds apart. An earlier pair crossed reload/layout
  settling and differed; that pair is not counted as pause evidence. Saved
  user preferences were never toggled for this fixture.

`herdr-app shot` saves the last rendered frame. A successful command/status
response is **not a paint barrier**; immediate post-command screenshots can
still represent the preceding view. Continuous resize and human visual
acceptance remain outstanding.

## Performance, presentation and restoration

[Actual process measurements](aquarium-performance.md) record the full-app
250-synthetic-root stress scene: approximately 101.4% of one CPU enabled versus
1.6% paused in sequential matched-scene runs. This is significant unresolved
cost, not performance acceptance. GPU/decoded-image residency and FPS are not
measured. Profiling contains both script snapshot and native layout/paint work;
absence of a theme-managed JavaScript frame loop does not eliminate host script
execution.

The [fresh gallery](gallery-direction.md) uses a separately sanitized actual
five-fish workspace capture. Only private text was blurred; the framing pipeline
preserves every sanitized source RGB pixel. Raw captures/traces are not published.

No restart command, pointer automation or keyboard automation was issued. The
GUI process nevertheless changed from PID 945 to PID 54019 at 18:49:34 local;
the cause is unconfirmed. Movement, wave-cycle captures and official performance
measurements predate that change. Later exit/pause/restoration checks ran on the
replacement host and must not be conflated with the earlier measurements.

The original workspace/layout, parent agent, space/tab/pane, 320-pixel aquarium
height, font/zoom and saved aquarium preferences were restored and checked.
Only reviewed owned runtime files and habitat image references remain updated;
layout geometry/user fields were verified against backups. The 22 temporary QA
files and owned worker/check terminals were removed. App-owned layout-state
files were not edited. The restoration snapshot reported no errors. A later
read-only status showed a different remote selection; its origin is unknown.
That newer selection was left alone rather than repeatedly forcing the original
focus. No further live UI changes were made.

Final automated checks: **52 Node tests, 8 Python tests**, source/installed native
checks, benchmark self-check and diff checks. None closes the outstanding human
input or resource-acceptance requirements. Private evidence is retained locally
under `.git/aquarium-reports/live-nativeqa/`; it is deliberately not published.
