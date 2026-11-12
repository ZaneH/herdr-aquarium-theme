#!/usr/bin/env node
// Prepare an isolated synthetic native Herdr fixture. Never installs or launches it.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MOD_NAME = "aquarium-native-fixture";
export const COUNTS = [2, 5, 10];
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPECIES_MIX = ["clownfish", "blue_tang", "koi", "betta", "fancy_goldfish"];
const SPACE = { id: "SYNTHETIC-fixture-space", machine: null };
const SOURCES = ["main.js", "model.js", "motion.js", "presentation.js"];

function inside(child, parent) {
  const rel = relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertSafeOutput(output) {
  if (typeof output !== "string" || !output) throw new Error("--out is required");
  const asked = resolve(output);
  const parent = dirname(asked);
  if (!existsSync(parent) || !statSync(parent).isDirectory()) throw new Error(`output parent must already exist: ${parent}`);
  const out = join(realpathSync(parent), parse(asked).base);
  if (out === parse(out).root || out === homedir()) throw new Error(`refusing unsafe output path: ${out}`);
  if (inside(out, REPO_ROOT)) throw new Error(`refusing output inside the repository: ${out}`);
  const homes = [join(homedir(), ".config", "herdr-app"), process.env.HERDR_APP_HOME].filter(Boolean);
  for (const home of homes) {
    const live = existsSync(home) ? realpathSync(home) : resolve(home);
    if (inside(out, live)) throw new Error(`refusing output inside the live Herdr app home: ${out}`);
  }
  if (existsSync(out) || lstatSync(out, { throwIfNoEntry: false })) throw new Error(`output already exists: ${out}`);
  return out;
}

function syntheticScene(count) {
  const roots = Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return {
      address: `SYNTHETIC/root-${n}`,
      title: `SYNTHETIC root ${n} — NOT TELEMETRY`,
      status: "working",
      program: { name: "SYNTHETIC fixture", agent: true, shell: false },
      app: null,
      pane: `SYNTHETIC-pane-${n}`,
      space: SPACE.id,
      space_name: "SYNTHETIC",
      tab: `SYNTHETIC-tab-${n}`,
      tab_index: i,
      tab_name: "SYNTHETIC",
      seq: i,
      pinned: false,
      focused: false,
    };
  });
  const child = {
    address: "SYNTHETIC/root-01-child",
    parent: roots[0].address,
    state: "live",
    status: "blocked",
    program: { name: "SYNTHETIC fixture", agent: true, shell: false },
    name: "SYNTHETIC blocked child — NOT TELEMETRY",
    title: "SYNTHETIC blocked child — NOT TELEMETRY",
    cwd: "/SYNTHETIC/not-telemetry",
  };
  return { roots, child };
}

const CYCLE_DWELL_MS = 3000;
const CYCLE_PHASE_LABELS = ["WORKING", "BLOCKED", "WORKING-2", "BLOCKED-2"];

const CYCLE_SHIM = `export function terminals() {
  // The optional attention layout exposes one raw child whose status follows the cycle.
  return props()?.attention
    ? [...ROOTS.map(root => ({ ...root, state: "live", parent: null })), { ...CHILD, status: CYCLE_PHASES[cycleIndex].childStatus }]
    : ROOTS;
}
// Opt-in deterministic attention cycle: WORKING -> BLOCKED -> WORKING -> BLOCKED.
// No native timer runs inside the shim: the wrapper advances this fixture-local
// clock with bounded one-shot cx.timer.after callbacks, tests call advance()
// directly, and close() cancels every pending phase callback.
const CYCLE_PHASES = [
  { label: "WORKING", childStatus: "working" },
  { label: "BLOCKED", childStatus: "blocked" },
  { label: "WORKING-2", childStatus: "working" },
  { label: "BLOCKED-2", childStatus: "blocked" },
];
const CYCLE_DWELL = ${CYCLE_DWELL_MS};
let cycleClock = 0;
let cycleIndex = 0;
let cycleSuspended = false;
let cycleClosed = false;
const cyclePending = [];
function cycleScheduleNext() {
  if (cycleIndex + 1 >= CYCLE_PHASES.length) return; // bounded: stops after the last phase
  cyclePending.push({ at: cycleClock + CYCLE_DWELL, fire() { cycleIndex += 1; cycleScheduleNext(); } });
}
cycleScheduleNext();
export const attentionCycle = {
  dwellMs: CYCLE_DWELL,
  phases: CYCLE_PHASES.map(phase => phase.label),
  info() { return { phase: cycleIndex, label: CYCLE_PHASES[cycleIndex].label, tMs: cycleClock, suspended: cycleSuspended, closed: cycleClosed }; },
  advance(ms) {
    const fired = [];
    if (cycleClosed || cycleSuspended) return fired; // pause/suspension holds pending callbacks
    cycleClock += ms;
    for (let guard = 0; guard <= CYCLE_PHASES.length; guard++) {
      let due = -1;
      for (let i = 0; i < cyclePending.length; i++) if (due < 0 || cyclePending[i].at < cyclePending[due].at) due = i;
      if (due < 0 || cyclePending[due].at > cycleClock) break;
      const timer = cyclePending.splice(due, 1)[0];
      fired.push(timer.at);
      timer.fire();
    }
    return fired;
  },
  suspend() { cycleSuspended = true; },
  resume() { cycleSuspended = false; },
  close() { cycleClosed = true; cyclePending.length = 0; },
};
`;

const STATIC_TERMINALS = `export function terminals() {
  // The optional attention layout exposes one raw blocked child; the primary scene is roots only.
  return props()?.attention ? [...ROOTS.map(root => ({ ...root, state: "live", parent: null })), CHILD] : ROOTS;
}
`;

function shimSource({ count, paused, attentionCycle: cycle }) {
  const { roots, child } = syntheticScene(count);
  const choices = Object.fromEntries(roots.map((root, i) => [root.address, SPECIES_MIX[i % SPECIES_MIX.length]]));
  const settings = {
    "aquarium.paused": paused,
    "aquarium.free": true,
    "aquarium.speed": "normal",
    "aquarium.turning": true,
    "aquarium.bubbles": true,
    "aquarium.water": true,
  };
  return `// SYNTHETIC native fixture shim. No real terminal, status, layout or preference mutation.
import { theme, props as realProps, window as realWindow } from "herdr";
export { theme };

const ROOTS = ${JSON.stringify(roots, null, 2)};
const CHILD = ${JSON.stringify(child, null, 2)};
const SPACE = ${JSON.stringify(SPACE)};
const CHOICES = ${JSON.stringify(choices, null, 2)};
const SETTINGS = ${JSON.stringify(settings, null, 2)};
const CHOICE_PREFIX = "aquarium.fish.v1:";

// Fixture-only preferences. Unknown keys stay undefined, as in the real host.
export const props = () => ({ ...(realProps?.() || {}), terminal: false });
export function shared(key) {
  if (typeof key !== "string") return undefined;
  if (!key.startsWith(CHOICE_PREFIX)) return SETTINGS[key];
  try {
    const [machine, space, address] = JSON.parse(key.slice(CHOICE_PREFIX.length));
    return machine === null && space === SPACE.id ? CHOICES[address] : undefined;
  } catch { return undefined; }
}
export function setShared() {}
export function run() {}
export function nextCommand() { return new Promise(() => {}); }
export function focused() { return null; }
export function spaces() { return [SPACE]; }
export function agents() { return ROOTS; }
${cycle ? CYCLE_SHIM : STATIC_TERMINALS}// Real host window state only: no active:true fallback, so headless checks cannot fake activity.
export function window() { return typeof realWindow === "function" ? realWindow() : undefined; }
`;
}

function wrapperSource({ count, paused, food, attentionCycle: cycle }) {
  const state = paused ? "PAUSED" : "ENABLED";
  const foodLabel = food ? "FOOD AUTOPLAY ON" : "FOOD OFF";
  const banner = `SYNTHETIC NATIVE FIXTURE — ${count} ROOTS — ${state} — ${foodLabel} — NOT TELEMETRY`;
  const cycleMembers = `
    // Opt-in timed attention cycle: bounded one-shot phase timers, never a frame loop.
    this.cycleTimers = [];
    this.interruptedAtMs = null;
    this.cycleStarted = Boolean(props()?.attention && props()?.cycle); // only the cycle layout runs it
    const scheduleCycle = cx => {
      if (this.closed || !this.cycleStarted) return;
      if (attentionCycle.info().phase >= attentionCycle.phases.length - 1) return; // bounded: no timer past the final phase
      this.cycleTimers.push(cx.timer.after(attentionCycle.dwellMs, cx => {
        if (this.closed) return; // stale callback guard: close() cancelled this handle
        attentionCycle.advance(attentionCycle.dwellMs);
        if (attentionCycle.info().phase === attentionCycle.phases.length - 1) {
          // Fixture-only bounded interruption 200 ms into the final blocked phase.
          this.cycleTimers.push(cx.timer.after(200, cx => {
            if (this.closed || this.interruptedAtMs != null) return;
            this.interruptedAtMs = attentionCycle.info().tMs + 200;
            this.suspended = true;
            this.stopMotion();
            attentionCycle.suspend();
            cx.notify();
          }));
        }
        scheduleCycle(cx);
        cx.notify();
      }));
    };
    scheduleCycle(cx);
`;
  const cycleClose = `
  async close() {
    for (const task of this.cycleTimers) task.cancel(); // cancel every native handle
    this.cycleTimers.length = 0;
    // The fixture cycle is module state: only the copy that started it may close it.
    if (this.cycleStarted) attentionCycle.close();
    await super.close();
  }
`;
  const cycleBanner = `
    const cycleText = props()?.attention && attentionCycle
      ? \` — ATTENTION CYCLE: \${attentionCycle.info().label} PHASE \${attentionCycle.info().phase + 1}/\${attentionCycle.phases.length} T+\${attentionCycle.info().tMs}MS\` : "";
    const interruptedText = this.interruptedAtMs != null && this.suspended
      ? \` — INTERRUPTED (SUSPENDED) AT T+\${this.interruptedAtMs}MS\` : "";
`;
  return `// Synthetic wrapper: adds the provenance banner and optional startup pellet.
import { div } from "gpui-kit";
import Aquarium from "./aquarium.js";
import { props${cycle ? ", attentionCycle" : ""} } from "./fixture-herdr.js";

const BANNER = ${JSON.stringify(banner)};
const FOOD_AUTOPLAY = ${food ? "true" : "false"};

export default class NativeFixture extends Aquarium {
  init(p, cx) {
    super.init(p, cx);${cycle ? cycleMembers : ""}
    // The production dropFood gate still requires an active window, enabled motion and free arrangement.
    if (FOOD_AUTOPLAY) cx.timer.after(250, cx => this.dropFood(cx));
  }${cycle ? cycleClose : ""}
  render(cx) {
    const attention = props()?.attention ? " — ATTENTION: ONE BLOCKED NESTED CHILD" : "";${cycle ? cycleBanner : ""}
    return div().size_full().flex().flex_col()
      .child(div().flex_none().px(8).py(4).text_size(12).child(BANNER + attention${cycle ? " + cycleText + interruptedText" : ""}))
      .child(div().flex_1().min_h(0).child(super.render(cx)));
  }
}
`;
}

function layout(attention, cycle) {
  return {
    type: "row",
    titlebar: "none",
    children: [{ type: "block", content: { mod: MOD_NAME, props: attention ? { attention: true, ...(cycle ? { cycle: true } : {}) } : {} } }],
  };
}

export function prepareNativeFixture({ out, count = 5, paused = false, food = false, attentionCycle: cycle = false } = {}) {
  if (!COUNTS.includes(count)) throw new Error(`count must be one of ${COUNTS.join(", ")}`);
  if (typeof paused !== "boolean" || typeof food !== "boolean" || typeof cycle !== "boolean") throw new Error("paused, food and attentionCycle must be booleans");
  const output = assertSafeOutput(out);
  const sourceRoot = REPO_ROOT;
  for (const name of SOURCES) {
    if (!existsSync(join(sourceRoot, "mods", "aquarium", name))) throw new Error(`missing source file: ${name}`);
  }
  const assets = join(sourceRoot, "mods", "aquarium", "assets");
  if (!existsSync(assets) || !statSync(assets).isDirectory()) throw new Error(`missing source assets: ${assets}`);

  const sourceHashes = {};
  for (const name of SOURCES) sourceHashes[name] = sha256(readFileSync(join(sourceRoot, "mods", "aquarium", name)));
  const main = readFileSync(join(sourceRoot, "mods", "aquarium", "main.js"), "utf8");
  const importToken = 'from "herdr";';
  const artToken = 'const ART = "mods/aquarium/assets";';
  if (main.split(importToken).length !== 2) throw new Error("unexpected herdr import count in main.js");
  if (main.split(artToken).length !== 2) throw new Error("unexpected ART declaration count in main.js");
  const transformed = main.replace(importToken, 'from "./fixture-herdr.js";')
    .replace(artToken, `const ART = "mods/${MOD_NAME}/assets";`);

  mkdirSync(output);
  try {
    const mod = join(output, "mods", MOD_NAME);
    mkdirSync(join(output, "mods"));
    mkdirSync(mod);
    writeFileSync(join(mod, "mod.json"), '{"place":"none"}\n', { flag: "wx" });
    writeFileSync(join(mod, "aquarium.js"), transformed, { flag: "wx" });
    writeFileSync(join(mod, "fixture-herdr.js"), shimSource({ count, paused, food, attentionCycle: cycle }), { flag: "wx" });
    writeFileSync(join(mod, "main.js"), wrapperSource({ count, paused, food, attentionCycle: cycle }), { flag: "wx" });
    for (const name of ["model.js", "motion.js", "presentation.js"]) {
      cpSync(join(sourceRoot, "mods", "aquarium", name), join(mod, name), { force: false, errorOnExist: true });
    }
    cpSync(assets, join(mod, "assets"), { recursive: true, force: false, errorOnExist: true });

    mkdirSync(join(output, "layouts"));
    const layouts = [`${MOD_NAME}.json`, `${MOD_NAME}-attention.json`];
    writeFileSync(join(output, "layouts", layouts[0]), JSON.stringify(layout(false, false), null, 2) + "\n", { flag: "wx" });
    writeFileSync(join(output, "layouts", layouts[1]), JSON.stringify(layout(true, cycle), null, 2) + "\n", { flag: "wx" });

    const fixture = {
      kind: "synthetic-native-fixture",
      warning: "SYNTHETIC / NOT TELEMETRY. herdr-app check is a source/description check, not native paint or performance evidence.",
      source: sourceRoot,
      sourceHashes,
      fixtureHashes: {
        "aquarium.js": sha256(readFileSync(join(mod, "aquarium.js"))),
        "fixture-herdr.js": sha256(readFileSync(join(mod, "fixture-herdr.js"))),
        "main.js": sha256(readFileSync(join(mod, "main.js"))),
      },
      count,
      paused,
      food,
      ...(cycle ? {
        attentionCycle: {
          dwellMs: CYCLE_DWELL_MS,
          phases: CYCLE_PHASE_LABELS,
          transitions: CYCLE_PHASE_LABELS.length - 1,
          totalMs: CYCLE_DWELL_MS * (CYCLE_PHASE_LABELS.length - 1),
          banner: "ATTENTION CYCLE: <LABEL> PHASE <N>/4 T+<MS>MS",
          interruption: { afterFinalPhaseMs: 200, state: "suspended, motion parked, cycle clock frozen", banner: "INTERRUPTED (SUSPENDED) AT T+<MS>MS" },
          note: "opt-in; the wrapper advances a fixture-local clock with bounded one-shot timers (three phase timers plus one interruption timer); close() cancels every native handle; the cycle is module state, so one generated module runs one cycle",
        },
      } : {}),
      mod: MOD_NAME,
      modDirectory: `mods/${MOD_NAME}`,
      layouts,
      synthetic: {
        roots: count,
        rootStatus: "working",
        nestedChild: "one blocked raw child, only in the attention layout",
        speciesMix: SPECIES_MIX,
        windowActivity: "real host window only; no active:true fallback",
        commands: "run/setShared are no-ops and nextCommand never resolves",
      },
    };
    writeFileSync(join(output, "fixture.json"), JSON.stringify(fixture, null, 2) + "\n", { flag: "wx" });
    return { output, mod, layouts: layouts.map(name => join(output, "layouts", name)), fixture };
  } catch (error) {
    rmSync(output, { recursive: true, force: true });
    throw error;
  }
}

function parseCli(argv) {
  const args = { count: 5, paused: false, food: false, attentionCycle: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") args.out = argv[++i];
    else if (arg === "--count") args.count = Number(argv[++i]);
    else if (arg === "--paused") args.paused = true;
    else if (arg === "--food") args.food = true;
    else if (arg === "--attention-cycle") args.attentionCycle = true;
    else if (arg === "--help" || arg === "-h") { console.log("Usage: node tools/prepare-native-fixture.mjs --out NEW_DIR [--count 2|5|10] [--paused] [--food] [--attention-cycle]"); process.exit(0); }
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = prepareNativeFixture(parseCli(process.argv.slice(2)));
    console.log(`prepared ${result.output}`);
    console.log(`mod: ${result.mod}`);
    console.log(`check: herdr-app check ${result.mod}`);
    console.log(`layouts: ${result.layouts.join(", ")}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
