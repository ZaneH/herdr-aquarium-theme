const SPECIES = ["clownfish", "blue_tang", "betta", "koi", "fancy_goldfish", "mandarinfish", "freshwater_angelfish", "manta_ray",
  "lionfish", "anglerfish", "pufferfish_inflated", "largemouth_bass", "bluefin_tuna", "rainbow_trout", "sockeye_salmon",
  "swordfish", "hammerhead_shark", "great_white_shark", "channel_catfish", "piranha", "moray_eel", "seahorse",
  "ocean_sunfish", "flounder", "silver_arowana"];

export function speciesFor(address) {
  let hash = 0;
  for (const char of address) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SPECIES[hash % SPECIES.length];
}

export function schoolGeometry(width, height, count, immersive) {
  const columns = immersive ? Math.min(Math.max(1, count), width >= 720 ? 2 : 1) : Math.max(1, Math.floor(width / 420));
  const rows = Math.max(1, Math.ceil(count / columns));
  return { lane: Math.max(120, Math.min(640, width / columns - 12)),
    height: immersive ? Math.max(170, height / rows) : 155 };
}

export function fishAsset(agent, paused, turning) {
  const species = speciesFor(agent.address);
  if (agent.status === "done") return `${species}-gold.png`;
  if (paused || agent.status === "blocked") return `${species}.png`;
  return `${species}-${turning ? "swim" : "glide"}.webp`;
}

export function detailsFor(agent, terminal) {
  // shortcut: this Herdr build does not document telemetry fields; add them when its API does.
  return [agent.address, `Status: ${agent.status}`, "Cache: not reported", "Thinking: not reported",
    ...(terminal?.cwd ? [`Folder: ${terminal.cwd}`] : [])];
}
