// Clump-based anime hair: soft interior outlines, a broken highlight band
// ("angel ring"), strand lines and translucent fringe shadows on the face.
import { cel, softenInterior, strokeLine, splinePoints } from "./canvas.mjs";
import { R } from "./palettes.mjs";

export const HAIR_SHADOW = "#5a2a2040";

/**
 * parts: [{ mask, shadow, rim, base, regions, spine, spines, spineTone }] painted in order.
 * opts.shine: { c:[x,y], r:[rx,ry], t, a:[deg0,deg1] } (absolute)
 * opts.back: true for hair behind the body (one tone darker)
 */
export function drawHairParts(sprite, parts, opts = {}) {
  const ramp = R.hair;
  const shift = opts.back ? -1 : 0;
  const tone = (t) => Math.max(1, t + shift);
  let union = null;
  for (const part of parts) {
    if (!part.mask || part.mask.empty()) continue;
    cel(sprite, part.mask, ramp, {
      shadow: part.shadow ?? 2.2,
      rim: opts.back ? 0 : part.rim ?? 0,
      base: tone(part.base ?? 3),
      regions: (part.regions ?? []).map((r) => ({ mask: r.mask, tone: tone(r.tone) })),
    });
    if (opts.back)
      part.mask.forEach((x, y) => {
        if (sprite.get(x, y) === ramp[2]) sprite.set(x, y, ramp[1]);
      });
    union = union ? union.or(part.mask) : part.mask;
  }
  if (!union) return null;
  softenInterior(sprite, ramp, 0, 1);

  for (const part of parts) {
    const spines = [...(part.spine ? [part.spine] : []), ...(part.spines ?? [])];
    if (!spines.length || !part.mask) continue;
    const inner = part.mask.shrink(1);
    for (const spine of spines) {
      const pts = splinePoints(spine, 6);
      for (let i = 0; i < pts.length - 1; i++) strokeLine(sprite, [pts[i], pts[i + 1]], ramp[tone(part.spineTone ?? 2)], inner);
    }
  }

  if (opts.shine && !opts.back) {
    const { c, r, t = 2.8, a = [200, 340] } = opts.shine;
    union.forEach((x, y) => {
      const cur = sprite.get(x, y);
      if (cur !== ramp[3] && cur !== ramp[2] && cur !== ramp[4]) return;
      const dx = (x + 0.5 - c[0]) / r[0];
      const dy = (y + 0.5 - c[1]) / r[1];
      const d = Math.hypot(dx, dy);
      let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (ang < 0) ang += 360;
      if (ang < a[0] || ang > a[1]) return;
      const band = t / Math.max(r[0], r[1]);
      if (Math.abs(d - 1) <= band / 2) {
        const mid = (a[0] + a[1]) / 2 - (a[1] - a[0]) * 0.12;
        const core = Math.abs(ang - mid) < (a[1] - a[0]) * 0.18 && Math.abs(d - 1) <= band / 4 + 0.02;
        sprite.set(x, y, ramp[core ? 5 : 4]);
      }
    });
  }
  return union;
}

/** Translucent shadow the fringe casts onto the face (a few px below the hair edge). */
export function fringeShadow(sprite, hairMask, faceMask, limitY, depth = 2) {
  let below = hairMask.shift(0, 1);
  for (let i = 2; i <= depth; i++) below = below.or(hairMask.shift(0, i));
  const inner = faceMask.shrink(1);
  below.forEach((x, y) => {
    if (y <= limitY && inner.has(x, y) && !hairMask.has(x, y)) sprite.set(x, y, HAIR_SHADOW);
  });
}
