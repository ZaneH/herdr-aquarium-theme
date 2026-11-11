# Herdr Aquarium

Your coding agents, as a school of fish. Two native [Herdr GUI](https://herdr.dev) layouts: a practical workspace and a quiet, immersive tank. Both preserve the standard left sidebar.

![Immersive aquarium in Herdr](preview.png)

*Cropped in-app screenshot; agent labels blurred for privacy.*

## Two modes

**Workspace** (`aquarium`): aquarium above your normal terminals. Tabs, splits, pane headers, Files/Changes, status bar, and shortcuts stay intact.

**Immersive** (`aquarium-immersive`): the tank fills the workspace beside the sidebar. Click a fish to open its terminal at full workspace size. **Back to aquarium** returns to the water without closing the agent. **Workspace / Immersive** buttons switch layouts.

```sh
herdr-app do layout.switch '{"name":"aquarium"}'
herdr-app do layout.switch '{"name":"aquarium-immersive"}'
# Original Herdr layout is untouched:
herdr-app do layout.switch '{"name":"main"}'
```

Hover a fish for status and location. The details strip follows the hovered agent, then the focused agent, then the first agent. Fish are also Tab stops with visible focus borders, accessible labels, and keyboard activation. Each fish has a generous clickable travel lane so it is easy to catch. Schools wrap and scroll when crowded.

## Swimming

All **25 species** from [Polyy.AI's 2D Fish Sprites Pack](https://polyyai.itch.io/2d-fish-sprites-pack) are included. Species are deterministic by full terminal address; species can repeat.

- **Enable / Pause swimming:** opt-in; off on a fresh installation.
- **Turning: smooth / instant:** smooth turns use all 30 source rotation angles across a round trip. Instant turns use two opposite views.
- Fish travel back and forth on a 12-second route, with slight vertical movement and species-offset phases. Native animated WebP playback—not per-frame JavaScript, timers, or repeated UI reconstruction—drives the motion.
- Working and idle agents swim when enabled. Blocked fish stop and say **Needs you** in coral. Done fish stop, turn gold, and say **Finished**, until Herdr marks them seen/idle.
- Preferences are shared by both modes and saved by Herdr. Motion is opt-in instead of detecting OS reduced-motion settings, which this API does not expose.

Optional command equivalents (when the aquarium is visible):

```sh
herdr-app do aquarium.motion
herdr-app do aquarium.turning
```

The source sheets are **camera rotations, not fin-flapping animation**. The result is traveling and turning fish, not simulated skeletal swimming. Gold is a lightweight baked PNG effect, not a live material shader. No speed slider, collision physics, or new dependencies in the running app.

### Telemetry limitation

The installed Herdr API does **not** document cache, context, model, or thinking telemetry. Cache and thinking show **not reported**. Nothing is inferred from agent status, fabricated, or scraped from terminal output/private session files. A future agent-side reporting integration can extend `mods/aquarium/model.js`.

## Install

Requires the **native Herdr GUI** with the layout/mod API described in its generated `~/.config/herdr-app/AGENTS.md`, not the older terminal Herdr plugins API.

Copy these paths into your Herdr app home (normally `~/.config/herdr-app`), **only if their destination names are unused**:

```text
layouts/aquarium.json
layouts/aquarium-immersive.json
themes/aquarium.json
mods/aquarium/
```

Then check the mod and select a layout. To update your own installation, copy the changed files after reviewing your local edits. Do not overwrite someone else's aquarium layout/mod. The theme picker can override the palette. Personal keys and settings are not changed. Shipped mods are referenced, never edited or vendored.

## Development and checks

```sh
node --test tests/*.test.mjs
uv run --with pillow python -m unittest discover -s tests
herdr-app check ~/.config/herdr-app/mods/aquarium
herdr-app status
herdr-app shot /tmp/aquarium.png
```

Node tests cover species/assets, missing telemetry, state-dependent motion, and empty/narrow/crowded geometry. Python checks verify the complete round-trip route, all 30 angles, and valid moving WebP clips for all 25 species. Native rendering and real two-agent playback have been checked in the app; the immersive terminal and return views render without app errors. Full keyboard, empty/crowded UI, and every live status transition still need hands-on acceptance testing. No large-school CPU/GPU/memory benchmark yet; animated images use more decoded memory than their compressed file size. Pause swimming for the lightest mode.

The repo's runtime assets total about 14 MB; the original 49 MB pack and build dependencies are not vendored. No runtime subprocesses, network requests, web views, polling, or terminal scraping.

Regenerate the assets from the source pack ZIP:

```sh
uv run --with pillow python tools/prepare-fish.py /path/to/pack.zip
```

Pillow is build-time only. No further artwork is required. Optional next contributions: transparent plants/rocks/wood foreground art, or a reference image for a brighter tropical or more naturalistic treatment.

## License and credits

Code, documentation, and original habitat SVGs: **MIT**, see [LICENSE](LICENSE).

Fish art: **[Polyy.AI — 2D Fish Sprites Pack](https://polyyai.itch.io/2d-fish-sprites-pack)**, supplied under a **CC0 1.0 public-domain dedication**. Cropped frames, recolored gold variants, and animated routes are derived from that pack. Its supplied terms are preserved verbatim at [mods/aquarium/assets/LICENSE.txt](mods/aquarium/assets/LICENSE.txt); the pack also states not to resell its unmodified files as your own asset pack. The MIT license does not replace those asset terms.

[RECIPE.md](RECIPE.md) describes the layout and behavior for a fresh native build.
