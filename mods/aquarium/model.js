export const SPECIES = ["clownfish", "blue_tang", "betta", "koi", "fancy_goldfish", "mandarinfish", "freshwater_angelfish", "manta_ray",
  "lionfish", "anglerfish", "pufferfish_inflated", "largemouth_bass", "bluefin_tuna", "rainbow_trout", "sockeye_salmon",
  "swordfish", "hammerhead_shark", "great_white_shark", "channel_catfish", "piranha", "moray_eel", "seahorse",
  "ocean_sunfish", "flounder", "silver_arowana"];

function hashFor(address) {
  let hash = 0;
  for (const char of address) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

export function speciesFor(address) {
  return SPECIES[hashFor(address) % SPECIES.length];
}

export function surfaceGeometry(width) {
  return { tileWidth: 400, height: 48, count: Math.ceil(width / 400) + 1, travel: 40 };
}

// Mix only placement coordinates; retain the original species/motion seed.
function placementFraction(seed, salt) {
  let mixed = Math.imul(seed ^ salt, 1664525) + 1013904223;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 2246822507);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 3266489909);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
}

export function floatingGeometry(width, height, address, children) {
  const seed = hashFor(address);
  const leaderWidth = Math.min(156, width);
  const stacked = width < 260;
  const columns = Math.max(1, Math.min(3, Math.floor((stacked ? width : width - leaderWidth - 8) / 100)));
  const broodWidth = Math.max(0, Math.min(children, columns) * 100 - 4);
  const broodHeight = Math.ceil(children / columns) * 126;
  const w = children ? (stacked ? Math.max(leaderWidth, broodWidth) : leaderWidth + 8 + broodWidth) : leaderWidth;
  const h = children ? (stacked ? 186 + broodHeight : Math.max(178, broodHeight)) : 178;
  const dx = Math.max(0, width - w);
  const dy = Math.max(0, height - h);
  return { width: w, height: h, leaderWidth, broodWidth, stacked, seed, maxX: dx, maxY: dy,
    x: dx * placementFraction(seed, 0x9e3779b9), y: dy * placementFraction(seed, 0x85ebca6b) };
}

// Keep ordinary whole-tank paths. Separate tall broods and fitting groups
// whose rectangles must always overlap (both dimensions exceed half the tank).
export function floatingSchoolGeometry(width, height, families) {
  const layouts = families.map(({ leader, children }) =>
    floatingGeometry(width, height, leader.address, children.length));
  const crowded = layout => layout.height <= height && layout.width > width / 2 && layout.height > height / 2;
  const separateCrowded = layouts.filter(crowded).length > 1;
  const banded = layout => layout.height > height || (separateCrowded && crowded(layout));
  let bottom = layouts.some(layout => !banded(layout)) ? height + 8 : 0;
  const placed = layouts.map(layout => {
    if (!banded(layout)) return { ...layout, top: 0 };
    const top = bottom;
    bottom += layout.height + 8;
    return { ...layout, top, maxY: 0, y: 0 };
  });
  return { layouts: placed, height: Math.max(height, bottom ? bottom - 8 : 0) };
}

export function schoolGeometry(width, height, count, immersive) {
  const columns = immersive ? Math.min(Math.max(1, count), width >= 720 ? 2 : 1) : Math.max(1, Math.floor(width / 420));
  const rows = Math.max(1, Math.ceil(count / columns));
  return { lane: Math.max(120, Math.min(640, width / columns - 12)),
    height: immersive ? Math.max(170, height / rows) : 155 };
}

// Listed agents retain host-owned done/seen state and location. Background
// children use the native sidebar convention: raw done is idle, error blocked.
export function schoolAgents(listed, allTerminals) {
  const school = new Map(listed.map(agent => [agent.address, agent]));
  const raw = new Map(allTerminals.map(terminal => [terminal.address, terminal]));
  const statuses = { working: "working", blocked: "blocked", idle: "idle", done: "idle", error: "blocked" };
  for (const terminal of raw.values()) {
    if (school.has(terminal.address) || !terminal.parent || terminal.state !== "live" ||
        !terminal.program?.agent || terminal.program.shell || !Object.hasOwn(statuses, terminal.status)) continue;
    school.set(terminal.address, {
      address: terminal.address, status: statuses[terminal.status], program: terminal.program,
      title: terminal.name || terminal.template || terminal.title || terminal.program.name || terminal.address,
      // No pane, space or tab is invented for a background terminal.
    });
  }
  return [...school.values()];
}

export function schoolFamilies(school, terminals) {
  const byAddress = new Map(school.map(agent => [agent.address, agent]));
  const parents = new Map(terminals.map(terminal => [terminal.address,
    // Only traverse verified agent nodes; never bridge a dead/build process.
    terminal.state === "finished" || terminal.program?.shell || terminal.program?.agent === false
      ? null : terminal.parent]));
  const families = new Map();
  for (const agent of school) {
    let leader = agent;
    let depth = 0;
    let hops = 0;
    let address = agent.address;
    const seen = new Set([address]);
    while (parents.get(address)) {
      address = parents.get(address);
      if (seen.has(address)) { leader = agent; depth = 0; break; }
      seen.add(address);
      hops++;
      // Count real edges to the displayed leader, including non-reporting agents.
      if (byAddress.has(address)) { leader = byAddress.get(address); depth = hops; }
    }
    if (!families.has(leader.address)) families.set(leader.address, { leader, children: [] });
    if (leader !== agent) families.get(leader.address).children.push({ agent, depth });
  }
  return school.filter(agent => families.has(agent.address)).map(agent => families.get(agent.address));
}

// shortcut: no reliable project-close event; retain choices until reset rather than prune disconnected projects.
export function familyChoiceKey(leader, nativeSpaces) {
  const space = nativeSpaces.find(space => space.id === leader?.space);
  if (!space || !space.id || !leader?.address ||
      !(space.machine === null || (typeof space.machine === "string" && space.machine))) return null;
  return `aquarium.fish.v1:${JSON.stringify([space.machine, space.id, leader.address])}`;
}

export function savedSpecies(value) {
  return typeof value === "string" && SPECIES.includes(value) ? value : null;
}

export function speciesName(species) {
  return species.split("_").map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
}

// Reviewed in-place tail loops: conventional side views whose caudal fin is
// separate from the body. Expand only after per-species anatomy/facing review.
const IN_PLACE_TAIL = new Set(["clownfish", "blue_tang", "koi", "largemouth_bass", "rainbow_trout", "sockeye_salmon", "piranha", "swordfish", "bluefin_tuna", "channel_catfish"]);

export function fishAsset(agent, paused, turning, speciesAddress = agent.address, floating = false, facing = "right", choice = null) {
  const species = savedSpecies(choice) || speciesFor(speciesAddress);
  if (floating) {
    // Fixed-facing frames can loop at any phase without competing with waypoint direction.
    if (IN_PLACE_TAIL.has(species) && !paused && (agent.status === "working" || agent.status === "idle")) {
      return `${species}-tail-${facing === "left" ? "left" : "right"}.webp`;
    }
    return `${species}${facing === "left" ? "-left" : ""}${agent.status === "done" ? "-gold" : ""}.png`;
  }
  if (agent.status === "done") return `${species}-gold.png`;
  if (paused || agent.status === "blocked") return `${species}.png`;
  return `${species}-${turning ? "swim" : "glide"}.webp`;
}

export function newCompletions(previous, school) {
  return school.filter(agent => agent.status === "done" && previous.get(agent.address) !== "done");
}

export function detailsFor(agent, terminal) {
  // shortcut: this Herdr build does not document telemetry fields; add them when its API does.
  return [agent.address, `Status: ${agent.status}`, "Cache: not reported", "Thinking: not reported",
    ...(terminal?.parent ? [`Parent: ${terminal.parent}`] : []),
    ...(terminal?.cwd ? [`Folder: ${terminal.cwd}`] : [])];
}
