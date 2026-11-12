// Reserve the attention size even at rest so status changes never move the label or hit target.
export function fishPresentation(width, scale, needsYou, free) {
  const resting = Math.max(0, Math.min(width - 8, 108 * scale));
  const front = Math.max(0, Math.min(width - 8, 140 * scale));
  const size = needsYou ? front : resting;
  const travelWidth = width * Math.min(1, scale / 0.6);
  return { size, travelWidth, targetHeight: (free ? front : Math.max(front, travelWidth / 4)) + 38,
    top: free ? (front - size) / 2 : 0 };
}

export function familyNeedsAttention({ leader, children = [] }) {
  return leader.status === 'blocked' || children.some(({ agent }) => agent.status === 'blocked');
}
