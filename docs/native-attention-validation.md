# Bounded native attention-cycle observation — 2026-11-12

This is one synthetic native window observation, not acceptance. The source was
`14b7b9ae50d0b36c77315aa61c15d71aac2cc57c`; the runtime hashes used by the
generated fixture were:

```text
main.js         4e338a47eaa13ba0afc32b86b9452f6b9702b2e76e0d09568ff725bcb9458612
model.js        93a1bde83a67f1ded865e7fb1a24ec40b257c1b4bab37f7821452cf03af88c8c
motion.js       3dbe6bb4e8e848de75dfcd75611d1c39685688be53870d827cd9668777fba519
presentation.js c82ccb5269aee737290c4144ee080c076de5261b92e9d1b5996eb689afa16b60
```

The generated fixture was `--count 2 --attention-cycle`, checked before install,
then installed only into the already-owned `aquarium-native-fixture` mod and two
fixture layouts. Herdr PID 80325 was already frontmost and was not raised. One
switch showed `aquarium-native-fixture-attention` for 11.44 s, then restored
`aquarium-immersive` in `finally`. Restored status/shared/window JSON matched the
originals; `status` reported no errors. The real agent `t2` attention word in
`view.json` changed from `working` to `done` during the window; that independent
live status change was not edited or attributed to the fixture.

## Observed

`herdr-app shot` produced 376 frames at a median 33.86 ms external interval.
`shot` saves the last rendered frame and is not a paint barrier, so the recorded
times are capture times, not presentation timestamps. Fast OCR of the fixture
banner put the phase changes at +0.039, +3.095, +6.103 and +9.100 s relative to
the switch call, and the fixture interruption banner at +9.340 s. The banner
`T+` values are fixture source, not paint times.

The blocked child's saturated art bbox grew from a steady 62×36 logical px
(area 1519) to 78×45 (area 2277) over captured intermediate widths 65, 69, 71,
73, 74, 76, 77, 78; it shrank back through 74, 70, 69, 66, 64, 63, 62. Multiple
intermediate painted sizes were captured, so the size change was not a single
snap at this temporal resolution. This is not a measurement of the production
interpolation curve, exact onset latency or paint/vsync timing, and no source
inspection is offered as interpolation proof.

The child and parent status dots stayed at a constant relative offset across all
336 frames that had all three dots (dx 163.9999–164.1000, dy −28.0 to −27.9)
while the child art bbox changed by 16×9 px. The pair moved with the parent's
native motion, but the child label position did not move with the art-size
change. The hit-target border itself was not directly imaged.

## HUD and limits

`gpui-fps` exported the HUD functions, but the generated wrapper's guarded call
produced no HUD in any live frame. The headless check logged the exact failure:

```text
TypeError: fps_monitor_visible() needs a ShellRoot as the window's first view;
this window was opened with another view
```

The guarded live error was not observable outside the app, so the displayed FPS
metric was not captured. No FPS, CPU, GPU or decoded-image-residency claim is
made. The fixture interruption is production `suspended`/`stopMotion` on a
synthetic child, not a physical pause of a real agent. This observation does not
close real blocked-agent, keyboard, pointer or native performance acceptance.

Raw private captures, transforms and timings are local under
`.git/aquarium-reports/attention-native/2026-11-12T06-45-00Z/`, not committed.
