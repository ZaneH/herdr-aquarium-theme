// Pure waypoint state. Render from/to with native linear left/top transitions;
// only fade-out/fade-in use the root's 200ms native opacity transition.
const clamp = (n, max) => Math.max(0, Math.min(Math.max(0, max), n));

export function positionAt(m, now) {
  const t = m.phase === 'moving' && m.duration > 0
    ? Math.max(0, Math.min(1, (now - m.started) / m.duration)) : 0;
  return { x: m.from.x + (m.to.x - m.from.x) * t,
    y: m.from.y + (m.to.y - m.from.y) * t };
}

export function parkMotion(g, previous, now) {
  const p = previous ? positionAt(previous, now) : g;
  const point = { x: clamp(p.x, g.maxX), y: clamp(p.y, g.maxY) };
  return { phase: 'parked', from: point, to: point, started: now,
    duration: 0, due: Infinity, opacity: 1,
    face: previous?.face ?? (g.seed % 2 ? 'left' : 'right'),
    heading: previous?.heading ?? (g.seed % 2 ? Math.PI : 0),
    step: previous?.step ?? 0 };
}

export function startMotion(g, previous, now) {
  return { ...parkMotion(g, previous, now), phase: 'ready', due: now + 250 };
}

// Soft spacing: a candidate leg sampled at four points, scored as total
// overlap area against neighbors' reserved rectangles inflated by CLEARANCE.
// The shared start point scores equally on every candidate, so a family that
// begins inside a neighbor still picks the leg that best leaves it.
const CLEARANCE = 8;

function spacingScore(from, to, g, obstacles) {
  const top = g.top ?? 0;
  let score = 0;
  for (let i = 0; i <= 3; i++) {
    const t = i / 3;
    const x = from.x + (to.x - from.x) * t;
    const y = top + from.y + (to.y - from.y) * t;
    for (const o of obstacles) {
      const w = Math.min(x + g.width, o.x1 + CLEARANCE) - Math.max(x, o.x0 - CLEARANCE);
      const h = Math.min(y + g.height, o.y1 + CLEARANCE) - Math.max(y, o.y0 - CLEARANCE);
      if (w > 0 && h > 0) score += w * h;
    }
  }
  return score;
}

export function advanceMotion(m, g, now, speed = 'normal', soft = false, goal = null, obstacles = []) {
  if (now < m.due || m.phase === 'parked') return m;
  if (m.phase === 'fade-out') {
    return { ...m, phase: 'fade-in', face: m.pending.face, opacity: 1,
      started: now, due: now + 300 };
  }
  if (m.phase === 'turn' || m.phase === 'fade-in') {
    const { pending, ...state } = m;
    return { ...state, ...pending, phase: 'moving', started: now,
      opacity: 1, due: now + pending.duration + 200 };
  }

  const point = positionAt(m, now);
  const from = { x: clamp(point.x, g.maxX), y: clamp(point.y, g.maxY) };
  const duration = speed === 'slow' ? 8000 : 6000;
  const distance = duration / 1000 * (speed === 'slow' ? 12 : 24);
  const step = m.step + 1;
  let heading, to;
  if (goal) {
    // Food steers the next waypoint leg toward a bounded target; no simulation.
    const gx = clamp(goal.x, g.maxX), gy = clamp(goal.y, g.maxY);
    const d = Math.hypot(gx - from.x, gy - from.y);
    const k = d > distance ? distance / d : 1;
    const dx = (gx - from.x) * k;
    const dy = (gy - from.y) * k;
    heading = dx || dy ? Math.atan2(dy, dx) : m.heading;
    to = { x: clamp(from.x + dx, g.maxX), y: clamp(from.y + dy, g.maxY) };
  } else {
    // A deterministic small angular perturbation, not a clock or random source.
    const hash = (Math.imul((g.seed | 0) ^ step, 1664525) + 1013904223) >>> 0;
    const base = m.heading + ((hash % 1001) / 1000 - 0.5) * 0.6;
    heading = base;
    const leg = h => {
      let dx = Math.cos(h) * distance, dy = Math.sin(h) * distance;
      if (from.x + dx < 0 || from.x + dx > g.maxX) dx = -dx;
      if (from.y + dy < 0 || from.y + dy > g.maxY) dy = -dy;
      return { x: clamp(from.x + dx, g.maxX), y: clamp(from.y + dy, g.maxY) };
    };
    to = leg(base);
    let bestScore = obstacles.length ? spacingScore(from, to, g, obstacles) : 0;
    if (bestScore > 0) {
      // Keep the baseline leg unless a nearby heading reduces overlap;
      // ties within floating-point noise keep the first choice.
      for (const offset of [Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3]) {
        const candidate = leg(base + offset);
        const score = spacingScore(from, candidate, g, obstacles);
        if (score < bestScore - 1e-6) { to = candidate; bestScore = score; }
      }
    }
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx || dy) heading = Math.atan2(dy, dx);
  const face = dx > 0 ? 'right' : dx < 0 ? 'left' : m.face;
  const pending = { to, duration, face, heading, step };
  const stationary = { ...m, from, to: from, duration: 0, started: now,
    pending, opacity: 1 };
  if (face !== m.face) {
    return soft
      ? { ...stationary, phase: 'fade-out', opacity: 0, due: now + 300 }
      : { ...stationary, phase: 'turn', face, due: now + 150 };
  }
  return { phase: 'moving', from, ...pending, started: now,
    opacity: 1, due: now + duration + 200 };
}
