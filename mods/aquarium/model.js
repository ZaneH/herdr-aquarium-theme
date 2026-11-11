const SPECIES = ["clownfish", "blue_tang", "betta", "koi", "fancy_goldfish", "mandarinfish", "freshwater_angelfish", "manta_ray",
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

export function floatPeriod(species, speed = "normal") {
  return (40 + [...species].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 26) * 800 * (speed === "slow" ? 2 : 1);
}

export function surfaceGeometry(width) {
  return { tileWidth: 400, height: 48, count: Math.ceil(width / 400) + 1, travel: 40 };
}

export function floatingGeometry(width, height, address, children, speed = "normal") {
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
  const left = dx * (seed % 13) / 60;
  const right = dx * (0.8 + ((seed >>> 4) % 13) / 60);
  const top = dy * ((seed >>> 8) % 16) / 60;
  const bottom = dy * (0.75 + ((seed >>> 12) % 16) / 60);
  return { width: w, height: h, leaderWidth, broodWidth, stacked, left, right,
    top: seed % 2 ? bottom : top, bottom: seed % 2 ? top : bottom,
    x: dx * ((seed >>> 16) % 101) / 100, y: dy * ((seed >>> 20) % 101) / 100,
    period: floatPeriod(speciesFor(address), speed) };
}

export function schoolGeometry(width, height, count, immersive) {
  const columns = immersive ? Math.min(Math.max(1, count), width >= 720 ? 2 : 1) : Math.max(1, Math.floor(width / 420));
  const rows = Math.max(1, Math.ceil(count / columns));
  return { lane: Math.max(120, Math.min(640, width / columns - 12)),
    height: immersive ? Math.max(170, height / rows) : 155 };
}

export function schoolFamilies(school, terminals) {
  const byAddress = new Map(school.map(agent => [agent.address, agent]));
  const parents = new Map(terminals.map(terminal => [terminal.address, terminal.parent]));
  const families = new Map();
  for (const agent of school) {
    let leader = agent;
    let depth = 0;
    let address = agent.address;
    const seen = new Set([address]);
    while (parents.get(address)) {
      address = parents.get(address);
      if (seen.has(address)) { leader = agent; depth = 0; break; }
      seen.add(address);
      if (byAddress.has(address)) { leader = byAddress.get(address); depth++; }
    }
    if (!families.has(leader.address)) families.set(leader.address, { leader, children: [] });
    if (leader !== agent) families.get(leader.address).children.push({ agent, depth });
  }
  return school.filter(agent => families.has(agent.address)).map(agent => families.get(agent.address));
}

export function fishAsset(agent, paused, turning, speciesAddress = agent.address, floating = false, speed = "normal") {
  const species = speciesFor(speciesAddress);
  if (agent.status === "done") return `${species}-gold.png`;
  if (paused || agent.status === "blocked") return `${species}.png`;
  return `${species}-${floating ? "float-" : ""}${turning ? "swim" : "glide"}${floating && speed === "slow" ? "-slow" : ""}.webp`;
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
