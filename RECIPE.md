# Aquarium

Two calm native Herdr layouts: a working terminal workspace beneath an aquarium, and an immersive tank that fills the workspace. Live agents become fish; the standard left sidebar remains intact.

![Immersive aquarium](preview.png)

The screenshot is cropped to the tank, with agent labels blurred for privacy.

## What you see

Both layouts retain the shipped 268 px sidebar: spaces, agents, settings footer. Colors: deep water `#0a202b`, chrome `#102c38`, sea-glass `#9de0cf`, coral `#f2a394`, gold `#edd293`. UI and terminal fonts inherit personal settings.

Workspace: standard 42 px tabs; a 320 px aquarium block with a 58 px details strip; normal terminal pane cards and optional Files/Changes stack; 28 px status bar. Immersive: aquarium fills the area beside the sidebar, above the status bar. Opening a fish replaces that tank with a 42 px return/navigation bar and one full-size live agent terminal.

Aquariums show a heading/count and three controls: mode, swimming, turning. Fish travel in transparent, generously clickable lanes, distributed in a wrapping school. Immersive mode uses up to two columns and spreads rows vertically. Crowded schools scroll. Water has quiet light shafts, plants, bubbles, and sand, using a wide habitat SVG for workspace and a tall SVG for immersive.

## How it behaves

Working and idle fish travel when swimming is enabled. Blocked fish stop and say Needs you in coral. Done fish stop, turn gold, and say Finished; Herdr changes them to idle when seen. Status text accompanies color.

Swimming starts disabled; preferences persist across both modes. Enabling it uses a native animated WebP: 12-second round trip, subtle vertical movement, a half-turn at either end. Smooth turning uses all 30 source angles; instant turning uses opposite broadside views. Species have phase offsets so the school does not turn together. Pause switches back to a still PNG. No per-frame JavaScript, polling, or notify timers.

Hover shows details and updates the strip. Otherwise it follows the focused agent or first agent. Cache/thinking say not reported because the documented interface does not expose them. Click focuses the real agent address; in immersive it also selects the terminal stack child. Back to aquarium selects the tank child without killing or parking the agent. Mode switches between aquarium and aquarium-immersive. Fish and controls are Tab stops with labels, activation, and visible focus borders. Empty schools direct users to Workspace's + menu.

## Built from

`layouts/aquarium.json` copies the shipped main tree and inserts aquarium after tabs. All stock mod references and IDs remain. `layouts/aquarium-immersive.json` keeps the sidebar and status, replacing work with stack aquarium-view: tank-view (aquarium mod, props immersive=true), terminal-view (aquarium navigation mod, props terminal=true; agent-focused terminal block).

One custom mod, aquarium. It reads agents, terminals, theme, shared, props, focused; writes shared keys aquarium.paused and aquarium.turning; runs agent.focus, layout.select, layout.switch. A nextCommand listener supports aquarium.motion and aquarium.turning. on_size_change measures the school only when geometry changes. Other agent-order behavior remains with Herdr's unchanged agents sidebar. No exec, fetch, arbitrary file reads, new shortcuts, or additional running processes.

`model.js` implements species hashing, route geometry, asset selection, and honest details. `tools/prepare-fish.py` uses Pillow only at build time. All 25 Polyy.AI CC0 species get a still PNG, gold PNG, 30-angle swim WebP, and two-view glide WebP. Each animation is 512 × 128, 240 frames at 50 ms, with a 384 px travel distance before UI scaling. Eight-bit source silhouettes and alpha are retained through WebP encoding; rendered colors are lightly compressed. Original habitat SVGs are MIT, separate from the pack's preserved license.

## Watch out

- Native GPUI only, not HTML/CSS/Canvas. Installed AGENTS.md/type files are authoritative.
- Source frames are camera rotations, not swimming/fin poses. Species have different starting orientations; bass and angelfish need explicit broadside offsets.
- Animated WebP owns the whole travel lane. Its click target/label is stationary; it is not a moving fish-shaped hitbox. This intentionally makes agents easier to catch.
- Images load asynchronously; first-frame screenshots may lack art.
- Full workspace terminals use agent-focused composition blocks, not pane.zoom or destructive pane/layout restructuring. Implicit split/close commands do not work there; return to Workspace for pane manipulation.
- Missing telemetry must not be fabricated or obtained by scraping private agent files.
- Gold is baked, not a live shader. Swimming has no speed slider, random wandering, collisions, or skeletal deformation.
- Species may repeat. Expanding the species table changes the hash mapping from earlier builds. Large schools wrap/scroll but are not virtualized; native animation's decoded memory cost exceeds file size. Motion is opt-in; benchmark real large-school demand before adding more complexity.
- Header controls wrap at narrow widths; very narrow windows may be cramped. Both layouts are primarily desktop views.
- Personal theme picks can override layout colors. Do not overwrite an existing destination on installation or edit shipped files.

## Done when

- Node helper tests and Python route/asset tests pass.
- Native mod check passes and app status has no errors in both layouts and immersive terminal view.
- Sidebar, tabs, split workspace, Files/Changes, and return to main remain available.
- Each real agent has a labeled fish; hover matches it, clicking opens the correct local/remote agent, Back returns to tank.
- Swimming plays natively, reverses direction, uses turn frames, pauses, and resumes; instant turns choose the two-view animation.
- Blocked/done stop; done is gold; empty/crowded layouts remain usable.
- Keyboard navigation/activation and visible focus work throughout.

Automated helper/asset checks and real two-agent native screenshots/playback have been verified. The immersive terminal and return views render. Full keyboard, empty/crowded UI, all status transitions, and a large-school performance benchmark remain hands-on acceptance work.
