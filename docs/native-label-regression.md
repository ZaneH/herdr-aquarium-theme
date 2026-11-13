# Native label regression after PR #21

## Evidence (2026-11-13)

Baseline: clean `main` / `origin/main` at `464461b`, verified again after fetching.
Fix branch: `fix/native-fish-label-layout`. No installation or live settings changes.

The supplied screenshot was opened directly. It shows personal names near their
fish, no visible project row, and Resting about 200 physical pixels below a name.

Installed native authority (gpui-shell **0.7.1**, generated declarations):

- `~/.config/herdr-app/gpui-kit.d.ts:31–42`: ordinary length arguments use pixels
  for bare numbers. **The more specific line-height contract is different.**
- `gpui-kit.d.ts:1362–1363`: “A bare number is a multiplier (`1.45`), not pixels;
  a string is a length.” Thus `.line_height(16)` on the name row requests a
  **192px** line at its 12px text size. `.line_height(14)` on the 11px project
  and status requests **154px** lines. The declared row heights remain only
  16/14/14px. Checking just those heights missed the overflowing line boxes.
  These are logical-pixel calculations, not measurements of screenshot scale.
- `gpui-kit.d.ts:20693–20694`: Button has no built-in styling. Only the personal
  name explicitly gets semibold; the project remains regular 11px text.

## Project identity investigation

Read-only `herdr-app ls` supplied actual space IDs, names, machine prefixes and
terminal membership. `hc ls --json` supplied terminal addresses, parent links and
working folders; `hc schema` supplied the Terminal/labels contract. No terminal
screens, history, prompts or credentials were read.

The installed `~/.config/herdr-app/herdr.d.ts` defines:

- `SpaceInfo.id/name/folder/machine`: lines 113–138. `name` is Herdr's native name
  (explicitly named, otherwise repo/folder). `folder` is where new terminals
  start, not necessarily the current project.
- `AgentInfo.address/space/space_name`: lines 159–183.
- `terminals()` and machine-qualified parent addresses: lines 216–221.
- Installed `~/.config/herdr-app/AGENTS.md:139–145` documents `herdr.space`
  labels as machine-local IDs; the app prefixes remote IDs with `machine/`.

Observed examples: `t2` belongs to the space named `herdr-aquarium-theme` even
though that space's startup folder is `/Users/me/repos/nix-config`; `t4j` belongs
to `piano-trainer-next` despite `/Users/me` as startup folder. `nixos/t2` belongs
to `nixos/sp26b4f1b606801c5d9d472a4005f16432`, named `proxmox-image`, not the
unrelated local `t2` project. The existing resolver already matches these native
contracts, so it was retained rather than adding guessed fields or changing
identity/persistence keys. The new fixture records those relationships projected
onto the documented API shapes, **not** a captured live `agents()` dump.

Only the `aquarium.projects` preference was inspected: the key was absent in
`shared.json`, hence default-on. Explicit saved `false` is still honored, without
writes or reset-on-render behavior.

## Fix and verification

Remove all three erroneous per-row line-height overrides. Set one inherited
**unit multiplier** `.line_height(1)` on the shared fish button: the 12px name
line fits its 16px row and each 11px secondary line fits its 14px row. This avoids
relying on an unknown inherited host line height without adding three absolute
pixel overrides. Existing row reservations, padding, target sizes, family
spacing, motion, project truncation and day/night inks are unchanged.

The same `drawFish` path serves single fish, children and nested children in both
Free-floating and Organized arrangements and both layout variants. Existing
geometry reserves 44px of rows, 9px bottom padding, 2px border and 1px clearance.
The arithmetic regression now checks the **effective line boxes**, not just the
row heights, against those reservations.

Checks:

- Before the fix, the focused regression run failed with
  `12px × 16 = 192px must fit 16px row`; the new native-metadata resolver test
  already passed, isolating this regression to layout styles.
- `node --test tests/*.test.mjs`: **122 passed, 0 failed**. Includes single/family
  metadata cases, local/remote ID isolation, renames, absent scope, children,
  narrow targets, nested/blocked children, both arrangements, both layout
  variants, both lighting modes, persistence and unchanged motion bounds.
- `herdr-app check /Users/me/repos/herdr-aquarium-theme/mods/aquarium`:
  **check passed** (source/eager-description check only).
- `git diff --check`: passed.
- Python/art generation checks deliberately not rerun: no artwork changed.

## Native acceptance remaining

No corrected build was installed, no app restarted, no agents created, and no
live preferences/UI changed. The Node contract arithmetic and native source
check **do not prove GPUI layout, glyph painting, truncation, hit-testing or
absence of painted overlaps/clipping**. After integration, a human native pass
must inspect a single fish and a family (including nested children), Free-floating
and Organized, day/night, narrow/normal sizes, and confirm the three compact rows
remain inside their buttons with real project names. Also verify saved-off stays
off across reloads and manually enabling it reveals the project row.
