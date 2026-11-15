// Small rig helpers shared by both art styles.

/** Two-bone IK. pick(a, b) chooses which of the two joint solutions to keep. */
export function ik(root, target, l1, l2, pick) {
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const d = Math.max(0.01, Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01));
  const base = Math.atan2(dy, dx);
  const c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const off = Math.acos(Math.max(-1, Math.min(1, c)));
  const a = [root[0] + l1 * Math.cos(base + off), root[1] + l1 * Math.sin(base + off)];
  const b = [root[0] + l1 * Math.cos(base - off), root[1] + l1 * Math.sin(base - off)];
  const joint = pick(a, b);
  const a2 = Math.atan2(target[1] - joint[1], target[0] - joint[0]);
  return { joint, end: [joint[0] + l2 * Math.cos(a2), joint[1] + l2 * Math.sin(a2)] };
}

export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export const rot = (p, origin, deg) => {
  const r = (deg * Math.PI) / 180;
  const x = p[0] - origin[0];
  const y = p[1] - origin[1];
  return [origin[0] + x * Math.cos(r) - y * Math.sin(r), origin[1] + x * Math.sin(r) + y * Math.cos(r)];
};
