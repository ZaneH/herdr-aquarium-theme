# Synthetic native fixture

`tools/prepare-native-fixture.mjs` prepares an isolated, read-only Herdr mod tree
for bounded native checks of the aquarium. It only writes a new output directory.
It does not install, launch, switch layouts, read terminal content or change saved
settings.

```sh
node tools/prepare-native-fixture.mjs --out /tmp/aquarium-native-5
node tools/prepare-native-fixture.mjs --out /tmp/aquarium-native-5-paused --count 5 --paused
node tools/prepare-native-fixture.mjs --out /tmp/aquarium-native-10-food --count 10 --food
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

The shim:

- returns synthetic agents, terminals and one synthetic space;
- uses a deterministic conventional species mix, including the reviewed
  animated `clownfish`, `blue_tang` and `koi` species;
- keeps `aquarium.paused`, arrangement, speed, turning, bubbles and water
  fixture-local;
- makes `run`/`setShared` no-ops and `nextCommand` never resolve;
- returns the real Herdr window snapshot only. There is no `active: true`
  fallback that could make a headless check look like live animation.

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
aquarium performance. The attention child is synthetic structure, not a real
agent failure. The food pellet expires after ten seconds and only starts if the
real host window is active. No fixture result should be described as telemetry.
