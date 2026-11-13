# Herdr Aquarium

Your coding agents, as a school of fish. Two native [Herdr GUI](https://herdr.dev) layouts: a practical workspace and a quiet, immersive tank. Both preserve the standard left sidebar.

> **Release scope:** includes the waypoint-facing fix, compact native Options, seamless wave tiles, real child-agent discovery/navigation, and brighter native gallery. Motion remains opt-in and off on fresh installs. Moving-click comfort/crowded layouts ([#2](https://github.com/ZaneH/herdr-aquarium-theme/issues/2)) and performance/lifecycle/keyboard follow-ups ([#5](https://github.com/ZaneH/herdr-aquarium-theme/issues/5)) remain open; these are not claims of complete user acceptance.

![Native Herdr aquarium workspace panel](preview.png)

*Fresh native workspace-panel capture with five real fish and Options closed. Agent names and both details-strip lines are privacy-blurred; native colors, fish positions, status text, and controls are retained without grading or reconstruction. The surround and headings are presentation, not app UI. The panel was temporarily 500 px tall for capture, then restored to its normal 320 px. This earlier capture predates label cleanup, the fish picker, attention transitions and the clownfish animation pilot.*

Regenerate from the pinned sanitized input with `uv run --with pillow==11.3.0 python tools/prepare-preview.py` (build-time only). See [gallery direction and provenance](docs/gallery-direction.md).

## Two modes

**Workspace** (`aquarium`): aquarium above your normal terminals. Tabs, splits, pane headers, Files/Changes, status bar, and shortcuts stay intact.

**Immersive** (`aquarium-immersive`): the tank fills the workspace beside the sidebar. Click a mapped agent fish to open its terminal at full workspace size. Raw background children instead open Herdr’s native terminal peek, without replacing the tank. **Back to aquarium** returns to the water without closing the agent. **Workspace / Immersive** buttons switch layouts.

```sh
herdr-app do layout.switch '{"name":"aquarium"}'
herdr-app do layout.switch '{"name":"aquarium-immersive"}'
# Original Herdr layout is untouched:
herdr-app do layout.switch '{"name":"main"}'
```

Hover a fish for status and location. The details strip follows the hovered agent, then the focused agent, then the first agent. Fish expose native Button Tab stops, focus-border styles, accessible labels, and keyboard activation; complete hands-on keyboard acceptance remains tracked in #5. In Free-floating mode each fish's generous click target and label move with it; hovering any family member parks that whole family until the pointer leaves. Other families keep drifting, and leaving does not override Pause or Needs you. Organized mode keeps stationary travel lanes; its baked animation is not hover-paused. Crowded schools wrap and scroll. Names/statuses use dark lettering directly on the bright habitat, without navy pills or hover cards; native focus borders remain. Hover-hold has scheduler/callback regression coverage but still needs a physical native input pass.

**Sub-agents become little fish in their parent's family.** Real `terminals().parent` relationships determine the groups, including nested descendants. Children inherit the main agent's species, with smaller portraits; deeper descendants are smaller again. Free-floating families drift as a group, keeping children alongside their parent. Organized families cluster beneath or alongside the parent depending on space. Each still has its own status, tooltip, Tab stop, and terminal click target. Missing/unmapped parents leave fish independent rather than guessing relationships. Families taller than the tank use separate scroll bands; multiple fitting families that each exceed half the tank in both dimensions also get separate bands so their targets cannot remain permanently overlapped. Narrow panes can scroll horizontally, and ordinary Free-floating routes can still cross.

## Options and motion

All **25 species** from [Polyy.AI's 2D Fish Sprites Pack](https://polyyai.itch.io/2d-fish-sprites-pack) are included. Species are deterministic by full terminal address; species can repeat.

There is no tank heading or toolbar full of settings: the layout switch, stationary **Choose fish**, and **Options ▾**. The native dropdown uses switches and radio buttons, dismisses on outside press/Escape, and keeps settings together.

- **Animate aquarium:** opt-in; off on a fresh installation. Turning it off stops fish, bubbles, surface waves, attention pulsing, and shimmer.
- **Fish arrangement — Free-floating / Organized:** free-floating is the default. Families follow nearby deterministic waypoints with gentle course changes instead of a single left/right ping-pong loop. Organized preserves the original fixed lanes and 12-second routes for a more structured view.
- **Free-floating speed — Slow / Normal:** Slow is the default. Slow travels at up to about 12 px/sec in eight-second legs; Normal uses about 24 px/sec in six-second legs. Bounds can shorten a leg. Course changes are deterministic, without random darting. This setting affects Free-floating, not Organized's baked routes. Click targets move with the fish and stay comfortably larger than the artwork. Paths can cross: choose Organized for dense schools.
- **Turning — Smooth / Instant:** free-floating fish stop before reversing. Smooth briefly fades out, swaps directional sprites while invisible, then fades in before traveling; Instant swaps while stationary. Facing comes from the actual next waypoint, not a separate image clock. Organized retains source-angle turns.
- **Show project names:** on by default. Adds a smaller, subtler single-line project label below each personal fish name, while status stays visible. Shared by both layouts and saved across reloads; hiding it leaves the same target/motion bounds and keeps project details in tooltips, accessible labels and the details strip.
- **Bubbles:** two original aerator streams rise along the sides. Paused mode uses still posters.
- **Surface waves:** a translucent surface ribbon slowly undulates across the top. Seamless fixed-size SVG tiles overscan both ends, so movement never exposes a shrinking image edge. Paused mode leaves it still.
- **Night lighting:** off by default. A static deep-ocean-blue tint dims the habitat behind the fish. Labels, fish focus rings and empty-tank guidance use pale moonlit ink; artwork, status dots, food feedback and native controls keep their day colors. The setting is saved and independent of Animate aquarium.

**Fish names.** Names belong to the terminal's fish, not to an individual agent session: Greg stays Greg when a different agent starts in that same terminal. This terminal-scoped policy was explicitly approved by the user for #17. Native typing/Save/Enter/focus acceptance remains outstanding.

Every fish gets a personal name as its primary label — "Greg" or "Bob" instead of a project directory. The default is deterministic from the fish's identity, so it is stable across renders, reloads and restarts without any write. To rename: hover or focus a family's fish, open **Choose fish**, type in **Fish name** and press Enter or click **Save**; an empty input restores the default, and the row's hint says so. Names persist in Herdr's shared settings under `aquarium.name.v1:[machine, space, terminal address]` — the same stable identity the species choice already persists on — so they survive app/theme reloads and restarts, stay put through species changes, and never leak across machines or spaces. Starting a different agent in the same terminal intentionally keeps its name; a new terminal has its own name. Project labels prefer Herdr's native space name (custom, or Herdr's automatic repo/folder name), then the agent's native space-name snapshot, then the reported terminal folder's final component or native space folder. Remote folder names are handled as reported, without local filesystem reads. A child uses its own metadata first; only an unscoped child in a verified same-machine family may fall back to its leader's project. Unknown projects stay blank, never the agent program's name. The full project and agent identity remain in tooltips, accessible labels and the details strip even when project labels are hidden. Names are trimmed, whitespace-collapsed and capped at 24 characters at the boundary, so long or duplicate names cannot widen labels or collide with click targets; the label still truncates.

At each ordinary Free-floating waypoint decision, a family compares its original
route with four nearby detours, preferring less sampled overlap with neighbors'
reserved paths and an eight-pixel clearance. Reservations include the whole family
and held/blocked/done fish, using one snapshot before any family advances. Clear
routes stay unchanged; feeding goals retain priority. This is soft spacing, not
collision avoidance: queued legs are not replanned mid-flight, and paths can still
cross in crowded scenes or while feeding.

The theme has no JavaScript frame loop: one cancellable view-level timer supplies waypoints and stationary turn phases to native GPUI transitions. This does not make host rendering free of script work; native profiling observes script snapshots alongside layout and paint. See [performance evidence and limits](docs/aquarium-performance.md).
Working and idle agents move when enabled. A blocked member (including a nested child), or a done leader, parks the whole Free-floating family. A blocked fish approaches the glass as a centered 2D enlargement from 108 to 140 px (clamped in narrow lanes), with requested 400 ms native size/position transitions when animation is enabled. Its label and reserved click target stay fixed; it no longer bobs away from the pointer. A pulsing coral halo and **Needs you** text accompany it; other fish artwork recedes slightly to 84% opacity without dimming labels. Resolving attention restores the normal size and eligible family travel. This is a bounded 2D depth illusion with automated geometry/state checks, not yet a native visual/input acceptance claim. Done fish turn gold and show a brief three-second sparkle when first observed entering done with motion enabled; they stay gold until Herdr marks them seen/idle. The sparkle is native opacity animation, with one timer solely to remove it.
Preferences are shared by both modes and saved by Herdr. Motion is opt-in instead of detecting OS reduced-motion settings, which this API does not expose.

Optional command equivalents (when the aquarium is visible):

```sh
herdr-app do aquarium.motion
herdr-app do aquarium.turning
herdr-app do aquarium.bubbles
herdr-app do aquarium.water
herdr-app do aquarium.arrangement
herdr-app do aquarium.options
herdr-app do aquarium.feed
```

**Feed** drops one bounded food pellet at a deterministic spot in the free-floating school: at most three eligible swimming families steer their existing waypoint legs toward it, held/hovered, blocked and done fish keep their interaction and attention priority, and the pellet expires after ten seconds or is cancelled on pause, suspension, window inactivity, organized mode, mode/layout navigation and close. While a pellet is in the water the control reads **Feeding…** and rests until it expires, providing visible confirmation; the pellet also carries a small native feedback ripple — a 32 px coral ring pulsing opacity 0→50% every 1.8 s around it, riding the pellet's own lifetime so pause, suspension, inactivity, organized mode, navigation and close remove it with no added timers. The pellet and ripple paint above the fish, so a fish already at the drop spot cannot hide the first feed. When motion is unavailable the tooltip explains the required Options settings. It is cosmetic only: no physics, hunger, fake agent progress, telemetry or extra timers per family.

Keyboard: there is deliberately no single-letter feed shortcut. Herdr's keymap is application-global and a `key_context` covers its whole subtree, so a plain `f` binding fired while typing in the picker's Fish name field; the binding was removed rather than risk stealing text input. **Tab** to the Feed button, then use **Space** or **Enter**. These paths use documented native APIs; physical key dispatch, hit-testing and appearance remain part of the broader live acceptance checks in #5.

To test by hand: deploy the mod, open the aquarium, turn **Animate aquarium** and **Free-floating** on in Options (otherwise Feed is disabled and its tooltip says so), keep at least one **idle or working** family eligible (held/hovered, blocked and done fish do not feed), move the pointer off the fish, put the keyboard in the tank (click a tank control, e.g. Feed), activate Feed: the label flips to **Feeding…** and a pellet appears mid-tank; at Slow speed wait out the native transition legs while up to three families steer toward it; after ten seconds the pellet expires and the label returns to **Feed**. Feed again only after it expires — one pellet at a time.

The source sheets are **camera rotations, not fin-flapping animation**.
Free-floating now has **24 animated species**: the eleven reviewed tail-loop fish,
**moray eel** (curled body undulating around a fixed head), three flowing-fin
species — **betta, fancy goldfish, freshwater angelfish** — whose fixed torso and
head stay byte-exact while the surrounding fins flow through a bounded 2 px warp,
**manta ray**, whose pectoral wings flex through the same bounded warp while
its long whiptail band stays byte-exact, two caudal-joint sharks —
**great white shark, hammerhead shark** — whose whole caudal silhouette rotates
about the measured peduncle root while the head and trunk stay byte-exact, and two
layered-fin species — **ocean sunfish, inflated pufferfish** — where only the actual
fin layer is warped (the sunfish's dorsal and anal fins; the puffer's caudal fan) and
the protected body, clavus and upper fin are restored byte-exact, so no ghost body
or frozen fin outline can appear, and four more layered loops recovered from
approved offline art — **mandarinfish** (large foreground pectoral fan), **lionfish**
(lower pectoral veil and inseparable anal/pelvic mass), **silver arowana** (caudal fan
only, long dorsal/anal tips still) and **seahorse** (small dorsal fin flutter only,
bony trunk and curled tail still), all through the same moving-layer renderer with
tangential flex rather than exact rigid rotation.
Eel left/right loops and still/gold fallbacks use matched, mirrored side artwork so
it faces its route correctly. The tail-loop species retain their fixed bodies and
bounded caudal motion; the eel deliberately allows body deformation; the fin
species keep body and face frozen and move only the fins; the manta moves only
its wings and keeps the tail fixed; the flounder moves only its 127-pixel
caudal fan out of matched canonical stills (its top-down oval has no
camera-0 pose portrait).

All loops use twelve intended 100 ms slots. The WebP encoder may coalesce identical
frames, but the decoded 1200 ms timeline is tested slot by slot. Enable Animate
aquarium to use supported working/idle loops; hovering holds travel while the
in-place animation can continue. Paused/inactive/blocked/done fish use still/gold
art. **All 25 species are animated**; see
[animation coverage](docs/animation-coverage.md). Organized keeps the original
travelling/turning clips. These are procedural 2D loops, not restored authored
swimming or 3D rotations. Shipped in-place artwork is reviewed offline; native
appearance and shared interaction acceptance remain unverified. Gold is a baked PNG effect,
not a live material shader. No new runtime dependency or frame timer is added.

### Telemetry limitation

Live status-reporting background child agents join their verified parent’s fish family even without a pane; clicking a raw-only child opens its native terminal peek in either layout, without assigning a pane or invented workspace scope. Shell/build subprocesses are not added, and surviving or unknown-parent children remain independent without invented workspace scope. Like Herdr’s native child list, raw child `done` displays as resting (not an unseen completion), and `error` as needing you.

The installed Herdr API does **not** document cache, context, model, or thinking telemetry. Cache and thinking show **not reported**. Nothing is inferred from agent status, fabricated, or scraped from terminal output/private session files. A future agent-side reporting integration can extend `mods/aquarium/model.js`.

## Could this use the 3D models?

The creator also offers a [3D Fish Pack](https://polyyai.itch.io/3d-fish-pack): 25 textured GLB models, plus a separate low-poly download (roughly 2,200–7,700 triangles per fish, versus 51,000–55,000 in the detailed set). The earlier listing described static meshes without rigs/animation; actual current downloads need rechecking before assuming either capability. This exploration is shelved while the 2D version is perfected.

Herdr GUI 0.1.15's installed mod API exposes 2D GPUI elements, paths, images, and native UI animation, but no documented GLB loader, 3D scene, or custom shader entry point. HTML/web views and Node APIs are explicitly unavailable to mods. A real-time 3D version therefore needs additional host support or a separate renderer/integration; dropping Three.js into this mod will not work.

The smallest next experiment is **offline side-view rendering** of a low-poly model with subtle deformation, lighting, and a turn, exported as transparent animation for the existing mod. That could improve depth without adding a running 3D engine. No 3D renderer, model rigging, or performance benchmark has been implemented; low triangle counts alone do not establish the cost of textures, transparency, or compositing.

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
uv run --with pillow==11.3.0 python -m unittest discover -s tests
herdr-app check ~/.config/herdr-app/mods/aquarium
herdr-app status
herdr-app shot /tmp/aquarium.png
```

122 Node tests cover discovery/families, stable species and placement, project labels and their saved toggle, documented native line-height semantics, native-shaped project metadata, heading versus displacement, geometry, navigation dispatch, native control descriptions, and scheduler cleanup. 33 Python checks cover assets, animation coverage, wave tiling and reproducible gallery pixels. These are not human input acceptance. See the [PR #21 native-label regression evidence and remaining acceptance](docs/native-label-regression.md).

A [controlled live pass](docs/native-live-validation.md) displayed three genuine pane-less children and the brighter habitat. Native captures cover a five-fish workspace at Normal/Smooth and two real root species at both speeds/turn modes (136 frames at 1 Hz); no sustained backwards-facing mismatch was found on clear sampled legs. That sampling does not establish fade smoothness, frame pacing, hit comfort, keyboard behavior, every species/status, or complete lifecycle acceptance. Raw child navigation was corrected after `agent.focus` failed live: the native terminal-peek endpoint opened the correct worker, while physical Button activation remains untested.

The [native performance report](docs/aquarium-performance.md) includes a synthetic 250-root stress scene: about 101% of one CPU core enabled versus 1.6% paused in sequential matched-scene runs. This is a significant unresolved cost, not a lightweight-performance acceptance claim. Full-app RSS is measured; GPU and decoded-image residency are not. One real child exit was observed after settling. Real blocked/done transitions, broader spawn/nested/parent-exit workflows, and hands-on click/keyboard acceptance remain open.

The repo's runtime assets total about 15 MB; the original 49 MB pack and build dependencies are not vendored. No runtime subprocesses, network requests, web views, theme-managed per-frame callback loop, or terminal scraping.

Regenerate the assets from the source pack ZIP:

```sh
uv run --with pillow python tools/prepare-fish.py /path/to/pack.zip
# Original bubble artwork needs no source pack:
uv run --with pillow python tools/prepare-bubbles.py
```

Pillow is build-time only. No further artwork is required. Optional next contributions: transparent plants/rocks/wood foreground art, or a reference image for a brighter tropical or more naturalistic treatment.

## License and credits

Code, documentation, and original habitat/atmosphere art (surface, halos, shimmer, bubbles): **MIT**, see [LICENSE](LICENSE).

Fish art: **[Polyy.AI — 2D Fish Sprites Pack](https://polyyai.itch.io/2d-fish-sprites-pack)**, supplied under a **CC0 1.0 public-domain dedication**. Cropped frames, recolored gold variants, and animated routes are derived from that pack. Its supplied terms are preserved verbatim at [mods/aquarium/assets/LICENSE.txt](mods/aquarium/assets/LICENSE.txt); the pack also states not to resell its unmodified files as your own asset pack. The MIT license does not replace those asset terms.

[RECIPE.md](RECIPE.md) describes the layout and behavior for a fresh native build.


### Saved family fish
Hover a fish, then use the single stationary **Choose fish** control beside
Options. Its popover names the captured family and offers 25 named previews plus
**Automatic** reset. Native scrolling of that list inside the popover never established itself,
so the picker pages its rows instead: Prev/Next and a page count keep every species reachable by
click or keyboard, at full readable size, clamped to short or narrow windows. The header, name row,
88 px preview and pager are all accounted for inside the popover's height bound, so the pager never
falls below the fold and pages stay reachable even in a short viewport (a minimal page may hold as
few as one row). Opening lands on the
page holding the saved choice. Children inherit the leader's choice; motion/facing and
status semantics are unchanged. Opening holds that family's drift until closed,
and moving the pointer elsewhere cannot redirect an open picker. Controls wrap
in narrow panes and reserve their measured height above the school. Roots without
a verified native space identity have a disabled picker.

An 88 px preview shows the selected fish; **Automatic** names the species resolved
for that family leader. Supported working/idle leaders show `Swim animation` when
Animate aquarium and Free-floating are enabled and the window is active and
unsuspended. Other states use the appropriate still/gold portrait, labelled
`Still portrait`. Preview playback uses the native WebP clock and does not change
the current page.

Preferences use persisted `shared`/`setShared`, keyed by machine, native space ID
and leader terminal address (not project title or folder). Automatic keeps the
existing address-based assignment; unknown saved species fall back to it.
Choices are retained while projects/remote machines are absent. No reliable
project-close event is used: stale selections remain until Automatic resets them;
cleared keys may remain in the host store. Automatic cleanup is not claimed. Native keyboard,
preview/trigger hit layout, and persistence across a physical app restart remain
unverified; Node descriptor tests and source checking are not those checks.
