# Aquarium

Two calm native Herdr layouts: a working terminal workspace beneath an aquarium, and an immersive tank that fills the workspace. Live agents become fish; the standard left sidebar remains intact.

![Native aquarium workspace panel](preview.png)

This fresh native workspace-panel preview shows five real fish with Options closed and the brighter runtime palette. Agent names and both footer lines are privacy-blurred. Native colors and fish/UI positions are preserved without grading or reconstruction; the frame is presentation only. The workspace panel was temporarily 500 px tall for capture and restored to its normal 320 px afterward. See [gallery provenance](docs/gallery-direction.md); this is not an immersive-mode capture or proof of live behavior. It predates the subsequent removal of the navy label pills/hover rectangles.

## What you see

Both layouts retain the shipped 268 px sidebar: spaces, agents, settings footer. Colors: deep water `#0a202b`, chrome `#102c38`, sea-glass `#9de0cf`, coral `#f2a394`, gold `#edd293`. UI and terminal fonts inherit personal settings.

Workspace: standard 42 px tabs; a 320 px aquarium block with a 58 px details strip; normal terminal pane cards and optional Files/Changes stack; 28 px status bar. Immersive: aquarium fills the area beside the sidebar, above the status bar. Opening a mapped agent fish replaces that tank with a 42 px return/navigation bar and one full-size live agent terminal. Raw-only background children open Herdr's native terminal peek instead, leaving the tank selected.

No heading/count at the top left. Keep just the layout switch and Options ▾ at the top right. Options is a native controlled Popover, with switches for Animate aquarium, Bubbles, Surface waves, and radio groups for Fish arrangement (Free-floating/Organized), Free-floating speed (Slow/Normal), and Turning (Smooth/Instant). Use actual Switch, Radio, RadioGroup controls, not button rows masquerading as inputs. Style their tracks/dots, focus borders, and labels in the existing palette; native Popover owns anchoring, outside dismissal, Escape, and focus return.

Real terminals().parent chains group agents into families. Leaders keep their species; descendants inherit it. Children use 60% portraits, deeper descendants 48%. Each is independently clickable/tabbable with its own status. Show ↳ on child labels, the family in tooltips, and the real parent address in details. Missing/unmapped parents stay independent; guard traversal against cycles. Free-floating families move together, with children beside the leader (stacked in narrow tanks). Their click targets and labels move with the fish. Organized families use the original wrapping travel lanes, parent above/beside the brood, at most two immersive columns. Count families, not all agents, for lane geometry. Tall broods/crowded schools scroll. Water uses a wide habitat SVG for workspace and a tall SVG for immersive, with light shafts, plants, aerator streams, and sand.

## How it behaves

Working and idle fish travel when motion is enabled. A blocked member parks its whole Free-floating family, including when it is a nested child. Its artwork grows from 108 px to 140 px (scaled/clamped in narrow lanes) around a fixed center, requesting 400 ms native width/height/left/top transitions when animated. Reserve the front size in the Button so the label/hit target does not shift. A pulsing coral halo remains, but the blocked fish itself no longer bobs. Other fish artwork recedes to 84% opacity while any fish needs attention, with labels kept fully readable. Resolving attention restores size and eligible travel. This is a 2D depth illusion, not a 3D camera/shader; native visual acceptance remains open. They say Needs you with a coral status dot. Names and status words are dark ink directly on the habitat, without rounded navy backing. Done fish stop, turn gold, and say Finished. A newly observed completion gets three seconds of gold sparkles when motion is enabled; ordinary redraws do not replay it. Herdr changes done to idle when seen. Status text accompanies color.

Motion starts disabled; Free-floating and Slow are defaults. Preferences persist across both layouts. Favor slow, predictable, clickable drift, not rapid random wandering. Free-floating follows bounded, deterministic nearby waypoints with gentle course changes. Slow uses eight-second legs at up to about 12 px/sec; Normal uses six-second legs at up to about 24 px/sec. Native linear left/top transitions move the entire clickable family. Static directional 96 × 96 PNGs face according to actual horizontal displacement, never an independent image clock. Before reversing, hold position: Smooth fades out, swaps facing invisibly, then fades in; Instant swaps while stationary. Begin travel only after the turn. Keep a 200 ms endpoint margin before choosing another leg. Any blocked family member or a done leader stops family drift; child status labels stay individual. Organized preserves the original 12-second baked routes, smooth/instant turns and species phase offsets; the Free-floating speed option explicitly does not alter those routes.

Bubbles and Surface waves independently show/hide their effects, both on by default. Streams rise along the sides and fade at the surface. Pausing the master control stops all fish, bubbles, surface movement, attention pulsing, and sparkles, leaving still art/status colors. Paused Organized fish and bubble streams use PNG posters; Free-floating fish use directional PNGs in both states. The theme does not run a JavaScript frame loop, but native host rendering can still execute script snapshots. One cancellable view-level deadline timer advances waypoint/turn decisions; native transitions draw every intervening frame. Late callbacks advance one phase only, without catch-up bursts. Pause/resize/speed/turn/status changes park and re-prime affected families, departure removes their state, and close cancels the scheduler. Completion expiry uses a separate one-shot timer.

Hover shows details and updates the strip. In Free-floating, hovering a parent or child parks that family's drift at its interpolated position; leaving re-primes travel from there unless paused, inactive or blocked/done. Other families continue moving. Organized baked routes are not hover-paused. Hover holding has scheduler/callback regressions, not physical native input acceptance yet. Otherwise the strip follows the focused agent or first agent. Cache/thinking say not reported because the documented interface does not expose them. Clicking a host-mapped agent focuses its real address; in immersive it also selects the terminal stack child. Clicking a raw-only background child calls terminal.peek and returns before suspension or layout selection, following Herdr's native child-list workflow without inventing pane/workspace scope. Back to aquarium selects the tank child without killing or parking the agent. Mode switches between aquarium and aquarium-immersive. Fish and controls are Tab stops with labels, activation, and visible focus borders. Empty schools direct users to Workspace's + menu.

## Built from

`layouts/aquarium.json` copies the shipped main tree and inserts aquarium after tabs. All stock mod references and IDs remain. `layouts/aquarium-immersive.json` keeps the sidebar and status, replacing work with stack aquarium-view: tank-view (aquarium mod, props immersive=true), terminal-view (aquarium navigation mod, props terminal=true; agent-focused terminal block).

One custom mod, aquarium. It reads agents, terminals, theme, shared, props, focused; writes shared keys aquarium.paused, aquarium.turning, aquarium.bubbles, aquarium.water, aquarium.free, aquarium.speed; runs agent.focus, terminal.peek, layout.select, layout.switch. A nextCommand listener supports aquarium.motion, aquarium.turning, aquarium.bubbles, aquarium.water, aquarium.arrangement, aquarium.options, aquarium.resume. Back to aquarium sends resume after selecting the tank; custom programmatic return paths should do the same. Speed is chosen in the dropdown. on_size_change measures the school only when geometry changes. Other agent-order behavior remains with Herdr's unchanged agents sidebar. No exec, fetch, arbitrary file reads, new shortcuts, or additional running processes.

Native surface animation loops a fixed-width tiled strip from -40 to 0 over 9 seconds. surface.svg is a seamless 400 × 48 tile, rendered at exactly that aspect ratio with flex_none; use ceil(tankWidth/400)+1 copies. This overscans both edges throughout the movement and prevents image-contain letterboxing/shrinking from exposing tile ends. Blocked fish loop top 0–6 and halo opacity 0.5–1 over 3.2 seconds. Shimmer opacity loops 0.15–0.9 over 1.2 seconds; an address/status transition map starts it only on entering done, and a token-guarded cx.timer.after removes it after 3 seconds. A newer completion cannot be cleared by an older expiry callback. No timer draws animation frames. All these effects honor the master pause.

Original bubble art is generated by tools/prepare-bubbles.py: two transparent 64 × 384 WebPs, eight bubbles per stream, 180 frames at 50 ms (9-second loops), with slightly different phases, plus PNG posters for pause. These original assets and the surface/coral/gold SVG effects are MIT, not derived from the fish pack.

`model.js` implements species hashing, organized/floating family geometry, surface overscan, asset selection, completion-entry detection, parent-chain family grouping, and honest details. `motion.js` implements pure waypoint/turn state and interpolation; the view owns the single deadline scheduler. `tools/prepare-fish.py` uses Pillow only at build time. All 25 Polyy.AI CC0 species get right/left still PNGs, matching gold PNGs, a 30-angle swim WebP, and a two-view glide WebP. Organized animations are 512 × 128, 240 frames at 50 ms, with 384 px travel before UI scaling. Free-floating uses static source views separated by 15 of the 30 rotation frames, with no animated facing clips. Manta ray, bass, and angelfish use explicit broadside orientation offsets. Eight-bit source silhouettes and alpha are retained through WebP encoding; rendered colors are lightly compressed. Original habitat SVGs are MIT, separate from the pack's preserved license.

## Watch out

- Native GPUI only, not HTML/CSS/Canvas. Installed AGENTS.md/type files are authoritative.
- Source frames are camera rotations, not swimming/fin poses. Species have different starting orientations; manta ray, bass, and angelfish need explicit broadside offsets.
- The waypoint replacement fixes the previous independent position/facing clocks; automated reversal checks and bounded native playback support that fix. Moving-click comfort and crowded-layout interaction remain in #2; broader keyboard, lifecycle and resource acceptance remain in #5. These follow-ups do not hold the delivered facing, wave, controls and gallery fixes off main. Track remaining work in #7.
- Organized uses stationary travel-lane click targets. Free-floating uses moving, comfortably oversized fish buttons. Native transitions update drawing and hit geometry together; never paint moving fish over unrelated stationary click boxes. Paths may cross; Organized is preferable for dense schools. Pause positioning estimates native interpolation from the leg start time; delayed first drawing or clock changes may cause a small jump. Hidden-view/alternate navigation paths need acceptance testing.
- Images load asynchronously; first-frame screenshots may lack art.
- Full workspace terminals use agent-focused composition blocks, not pane.zoom or destructive pane/layout restructuring. Implicit split/close commands do not work there; return to Workspace for pane manipulation.
- Missing telemetry must not be fabricated or obtained by scraping private agent files.
- Gold is baked, and glows/sparkles are SVGs with native opacity effects, not live shaders. Swimming has no speed slider, random wandering, collisions, or skeletal deformation.
- The separate 3D pack (https://polyyai.itch.io/3d-fish-pack) provides static, unrigged GLB meshes, including low-poly alternatives. This Herdr API has no documented 3D scene/model/shader hook and no web views. Do not assume it can host Three.js. Offline side-view renders are a possible future experiment, not part of this build.
- Species may repeat. Expanding the species table changes the hash mapping from earlier builds. Large schools wrap/scroll but are not virtualized; native animation's decoded memory cost exceeds file size. Motion is opt-in; benchmark real large-school demand before adding more complexity.
- Only two top-right controls remain; settings live in the dropdown. Very narrow windows may still be cramped. Both layouts are primarily desktop views.
- Personal theme picks can override layout colors. Do not overwrite an existing destination on installation or edit shipped files.

## Done when

- Node helper tests and Python route/asset tests pass.
- Native mod check passes and app status has no errors in both layouts and immersive terminal view.
- Sidebar, tabs, split workspace, Files/Changes, and return to main remain available.
- Each real agent has a labeled fish; hover matches it, clicking opens the correct local/remote mapped agent, Back returns to tank; raw-only children open their own native terminal peek without selecting the immersive terminal view.
- Free-floating uses gentle waypoint courses, moving click targets, and selectable Slow/Normal speeds; parents keep their brood nearby. Organized retains its original lanes. Both pause/resume and honor smooth/instant turning.
- No decorative heading. Settings are in one native dropdown with correctly announced switches/radios, outside/Escape dismissal, and focus return.
- Sub-agents inherit their leader's species at smaller sizes, cluster together, and each opens its own terminal. Nested, orphan, and cyclic parent data never loses fish or hangs the view.
- Bubbles rise and fade; Surface waves moves a full-width, overscanned tile strip with no exposed ends. Each can be hidden independently. Master pause stops all moving art.
- Blocked fish park their family, approach the glass within fixed hit/label geometry and appear larger with a pulsing coral halo; resolving attention restores eligible travel. Done fish are gold, sparkle briefly without replaying on a redraw, then remain gold. Paused mode keeps status cues without motion; empty/crowded layouts remain usable.
- Keyboard navigation/activation and visible focus work throughout.

Automated helper/asset checks, isolated native fixtures for all four statuses and nested families, and real two-agent native screenshots/playback have been verified. The immersive terminal and return views render. Full keyboard, empty/crowded UI, all status transitions, and a large-school performance benchmark remain hands-on acceptance work.


### Saved family fish
Hover a fish, then use the single stationary **Choose fish** control beside
Options. Its popover names the captured family and offers 25 named previews plus
**Automatic** reset. Children inherit the leader's choice; motion/facing and
status semantics are unchanged. Opening holds that family's drift until closed,
and moving the pointer elsewhere cannot redirect an open picker. Controls wrap
in narrow panes and reserve their measured height above the school. Roots without
a verified native space identity have a disabled picker.
Preferences use persisted `shared`/`setShared`, keyed by machine, native space ID
and leader terminal address (not project title or folder). Automatic keeps the
existing address-based assignment; unknown saved species fall back to it.
Choices are retained while projects/remote machines are absent. No reliable
project-close event is used: stale selections remain until Automatic resets them;
cleared keys may remain in the host store. Automatic cleanup is not claimed. Native keyboard,
preview/trigger hit layout, and persistence across a physical app restart remain
unverified; Node descriptor tests and source checking are not those checks.
