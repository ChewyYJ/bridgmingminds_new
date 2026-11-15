// Parametric garment renderers that follow the rig, so one definition works for
// every pose and both art styles. ctx.body supplies armPath/legPath/armMask for
// the style; P.k scales design units (a 96x144 grid) to the style's pixels.
import { cel, strokeLine, splinePoints, Mask } from "../lib/canvas.mjs";
import { ramp } from "../lib/color.mjs";

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function rampOf(c) {
  return Array.isArray(c) ? c : ramp(c);
}

/** Far-side limbs: shadowed along the back edge with a deep line. */
export function farShade(mask, k = 1, extra = []) {
  return {
    base: 3,
    regions: [
      { mask: mask.minus(mask.shift(-Math.round(3.2 * k), -Math.round(k))), tone: 2 },
      { mask: mask.minus(mask.shift(-Math.max(1, Math.round(0.8 * k)), 0)), tone: 1 },
      ...extra,
    ],
  };
}

export function pointDir(points, t) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const l = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
    segs.push(l);
    total += l;
  }
  let d = total * Math.max(0, Math.min(1, t));
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const a = points[i];
      const b = points[i + 1];
      const u = segs[i] ? Math.min(1, d / segs[i]) : 0;
      const L = segs[i] || 1;
      return { p: lerp(a, b, u), dir: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] };
    }
    d -= segs[i];
  }
  return { p: points[points.length - 1], dir: [0, 1] };
}

export const along = (x, y, pd) => (x + 0.5 - pd.p[0]) * pd.dir[0] + (y + 0.5 - pd.p[1]) * pd.dir[1];

export function cut(mask, pd, keepBefore = true) {
  return mask.filter((x, y) => (keepBefore ? along(x, y, pd) <= 0 : along(x, y, pd) > 0));
}

/** Covering for a limb: same control points as the body limb, grown, cut at t1. */
export function limbCover(S, path, widths, grow, t1 = 1, flare = 0, extend = 0) {
  const pts = path.map((p) => [...p]);
  if (extend) {
    const a = pts[pts.length - 1];
    const b = pts[pts.length - 2];
    const L = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
    pts[pts.length - 1] = [a[0] + ((a[0] - b[0]) / L) * extend, a[1] + ((a[1] - b[1]) / L) * extend];
  }
  const ws = widths.map((w, i) => w + grow + (flare * i) / (widths.length - 1));
  let m = S.limb(pts, ws);
  let end = pointDir(pts, 1);
  if (t1 < 1) {
    end = pointDir(pts, t1);
    m = cut(m, end, true);
  }
  return { mask: m, end, pts, ws };
}

export function endBand(mask, end, h) {
  return mask.filter((x, y) => along(x, y, end) > -h);
}

export function stripesMask(mask, y0, every, height) {
  return mask.filter((x, y) => ((Math.floor(y - y0) % every) + every) % every < height);
}

export function plaidMasks(mask, every, x0, y0, w = 2) {
  const h = mask.filter((x, y) => ((Math.floor(y - y0) % every) + every) % every < w);
  const v = mask.filter((x, y) => ((Math.floor(x - x0) % every) + every) % every < w);
  return { h, v, both: h.and(v) };
}

/** Recolour a region keeping its light/shadow: maps tones of ramp A onto ramp B. */
export function recolor(sp, mask, A, B) {
  mask.forEach((x, y) => {
    const i = A.indexOf(sp.get(x, y));
    if (i >= 0) sp.set(x, y, B[i]);
  });
}

export function isEdge(full, x, y) {
  return !full.has(x + 1, y) || !full.has(x - 1, y) || !full.has(x, y + 1) || !full.has(x, y - 1);
}

/** Fold line: a short curve of shadow tone (optional lit edge), clipped to `clip`. */
export function fold(sp, pts, color, clip, light) {
  const line = splinePoints(pts, 6);
  for (let i = 0; i < line.length - 1; i++) strokeLine(sp, [line[i], line[i + 1]], color, clip);
  if (light)
    for (let i = 0; i < line.length - 1; i++)
      strokeLine(sp, [[line[i][0] - 1, line[i][1]], [line[i + 1][0] - 1, line[i + 1][1]]], light, clip);
}

export function sleeveSlots(a) {
  return a.slots.foreSleeve ? [a.slots.sleeve, a.slots.foreSleeve] : [a.slots.sleeve];
}

/** For raised arms, move pixels past the elbow plane into the forearm slot. */
export function splitRaised(ctx, a, sp, foreSlot) {
  if (!a.raised || !foreSlot) return;
  if (ctx.body.splitFore) {
    ctx.body.splitFore(sp, ctx.L(foreSlot), a);
    return;
  }
  const fore = ctx.L(foreSlot);
  const e = a.elbow;
  const s = a.shoulder;
  const d = Math.hypot(e[0] - s[0], e[1] - s[1]) || 1;
  const pd = { p: e, dir: [(e[0] - s[0]) / d, (e[1] - s[1]) / d] };
  for (let y = 0; y < sp.h; y++)
    for (let x = 0; x < sp.w; x++) {
      const c = sp.get(x, y);
      if (c !== null && along(x, y, pd) > -0.5) {
        fore.set(x, y, c);
        sp.set(x, y, null);
      }
    }
}

// ----------------------------------------------------------------- tops ----
const SLEEVE_LEN = { long: 1, short: 0.3, elbow: 0.55, cap: 0.17, tank: 0 };

/**
 * Units are design px (scaled by P.k).
 * spec: { color, fit, loose, hem, flare, sleeve, sleeveEase, sleeveColor, sleeveTo, neck, rib,
 *         cuff, cuffLen, hemBand, hemBandH, open: { inner, transparent, neck, gap, spread, lapel, hem, details },
 *         stripes, plaid, folds, details(ctx, info) }
 */
export function drawTop(ctx, spec) {
  const { S, L, P } = ctx;
  const k = P.k ?? 1;
  const R0 = rampOf(spec.color);
  const RS = spec.sleeveColor ? rampOf(spec.sleeveColor) : R0;
  const fit = (spec.fit ?? 1) * k;
  const loose = spec.loose ?? 0;
  const b = P.box;
  const hemY = P.hipY + (spec.hem ?? 1.5) * k;
  const flare = (spec.flare ?? 0) * k;

  const garment = (f, hy, lo, fl = flare) => {
    const wR = lerp(b.waistR, [Math.max(b.chestR[0], b.hipR[0]) - 0.6 * k, b.waistR[1]], lo);
    const wL = lerp(b.waistL, [Math.min(b.chestL[0], b.hipL[0]) + 0.6 * k, b.waistL[1]], lo);
    return S.blob([
      [b.neckL[0] - 0.4 * k, b.neckL[1] - 0.6 * k],
      [(b.neckL[0] + b.neckR[0]) / 2, b.neckL[1] - k],
      [b.neckR[0] + 0.4 * k, b.neckR[1] - 0.6 * k],
      [b.shR[0] + f * 0.5, b.shR[1] - 0.6 * k, 1],
      [b.chestR[0] + f, b.chestR[1]],
      [wR[0] + f, wR[1]],
      [b.hipR[0] + f + fl, hy, 1],
      [b.hipL[0] - f - fl, hy, 1],
      [wL[0] - f, wL[1]],
      [b.chestL[0] - f, b.chestL[1]],
      [b.shL[0] - f * 0.5, b.shL[1] - 0.6 * k, 1],
    ]);
  };

  const neckCx = (P.neck.x0 + P.neck.x1) / 2;
  const neckHW = (P.neck.x1 - P.neck.x0) / 2;
  const holeFor = (kind) => {
    if (kind === "v")
      return S.poly([
        [neckCx - neckHW - 1.2 * k, P.neck.base - 4 * k],
        [neckCx + neckHW + 1.2 * k, P.neck.base - 4 * k],
        [P.frontX + 0.5, P.neck.base + (P.view === "front" ? 6 : 7) * k],
      ]);
    if (kind === "none" || kind === "turtle" || kind === "high") return S.empty();
    if (kind === "wide") return S.ellipse(neckCx, P.neck.base - 0.6 * k, neckHW + 4.2 * k, 4 * k);
    return S.ellipse(neckCx, P.neck.base - 0.9 * k, neckHW + 1.2 * k, (P.view === "front" ? 2.6 : 3) * k);
  };

  const sleeve = (a) => {
    const kind = spec.sleeve ?? "long";
    if (kind === "tank") return null;
    const len = SLEEVE_LEN[kind];
    const grow = fit + (spec.sleeveEase ?? 1.4) * k;
    const fl = (kind === "short" ? 2.4 : spec.sleeveFlare ?? 0.6) * k;
    const { mask, end } = limbCover(S, ctx.body.armPath(a), a.widths, grow, len === 1 ? spec.sleeveTo ?? 0.97 : len, fl);
    const capR = a.widths[0] / 2 + grow;
    const full = mask.or(S.ellipse(a.shoulder[0], a.shoulder[1] - 0.2 * k, capR, capR + 0.4 * k));
    const sp = L(a.slots.sleeve);
    const far = a.far;
    cel(sp, full, RS, far ? farShade(full, k) : { shadow: 2.6 * k, rim: k });
    const inner = full.shrink(1);
    if (kind === "long" || spec.cuff) {
      const CR = spec.cuff && spec.cuff !== true ? rampOf(spec.cuff) : RS;
      const h = (spec.cuffLen ?? 3) * k;
      const band = endBand(full, end, h);
      band.forEach((x, y) => sp.set(x, y, CR[isEdge(full, x, y) ? 0 : far ? 1 : 2]));
      band.forEach((x, y) => {
        const v = along(x, y, end);
        if (v <= -h + 1.05 && !isEdge(full, x, y)) sp.set(x, y, CR[far ? 0 : 1]);
        else if (v <= -h + 2.1 && inner.has(x, y) && !far) sp.set(x, y, CR[3]);
      });
    }
    if (!far && spec.folds !== false && !a.raised) {
      const e = a.elbow;
      const s = a.shoulder;
      const w = a.wrist;
      const dir = [(w[0] - e[0]) / 10, (w[1] - e[1]) / 10];
      fold(sp, [[e[0] - 2 * k, e[1] - 1.4 * k], [e[0], e[1] - 0.4 * k], [e[0] + 1.8 * k, e[1] + 0.6 * k]], RS[2], inner);
      fold(sp, [[e[0] - 1.2 * k + dir[0] * 4, e[1] + 1.6 * k + dir[1] * 4], [e[0] + 1.4 * k + dir[0] * 4, e[1] + 2.6 * k + dir[1] * 4]], RS[2], inner);
      if (kind === "long")
        fold(sp, [[s[0] - 1.2 * k + (e[0] - s[0]) * 0.45, s[1] + (e[1] - s[1]) * 0.45], [s[0] + 1.4 * k + (e[0] - s[0]) * 0.62, s[1] + (e[1] - s[1]) * 0.62]], RS[2], inner);
    }
    spec.sleeveDetails?.(ctx, { sp, full, inner, a, end, R: RS, k });
    splitRaised(ctx, a, sp, a.slots.foreSleeve);
    return full;
  };

  // Modular outerwear leaves this opening transparent for a separately equipped
  // top. Historical complete-outfit definitions retain their baked undershirt.
  if (spec.open && !spec.open.transparent) {
    const IR = rampOf(spec.open.inner);
    const hole = holeFor(spec.open.neck ?? "crew");
    const inner = garment(0.4 * k, P.hipY + (spec.open.hem ?? 0.5) * k, 0, 0).minus(hole);
    const top = L("top");
    const res = cel(top, inner, IR, { shadow: 3 * k, rim: k });
    const rib = hole.grow(Math.max(1, Math.round(k))).and(inner).minus(inner.edge());
    top.fill(rib, IR[2]);
    if (spec.open.stripes) recolor(top, stripesMask(res.inner, P.chestY - 5 * k, Math.round(spec.open.stripes.every * k), Math.max(1, Math.round(spec.open.stripes.h * k))), IR, rampOf(spec.open.stripes.color));
    spec.open.details?.(ctx, { sp: top, inner, innerFill: res.inner, R: IR, k });
  }

  const sleeves = Object.fromEntries(Object.entries(P.arms).map(([key, a]) => [key, sleeve(a)]));

  const slot = spec.slot ?? (spec.open ? "outer" : "top");
  const sp = L(slot);
  let body = garment(fit, hemY, loose).minus(holeFor(spec.neck ?? "crew"));
  if (spec.open) {
    const fx = P.frontX;
    const gap = (spec.open.gap ?? 2.4) * k;
    const spread = (spec.open.spread ?? 1.4) * k;
    const side = P.view === "front" ? 1 : 0.7;
    body = body.minus(
      S.poly([
        [fx - gap, P.neck.base - 4 * k],
        [fx + gap * side, P.neck.base - 4 * k],
        [fx + gap * (side + 0.2) + spread, hemY + 2 * k],
        [fx - gap * 1.2 - spread * (P.view === "front" ? 1.2 : 1.8), hemY + 2 * k],
      ]),
    );
  }
  const nearArm = P.arms.near ? ctx.body.armMask(S, P.arms.near, fit + 2 * k) : null;
  const armShadow = nearArm ? nearArm.shift(Math.round(2 * k), Math.round(k)).minus(nearArm).and(body) : S.empty();
  const res = cel(sp, body, R0, { shadow: (spec.shadowK ?? 3.2) * k, rim: 1.2 * k, regions: [{ mask: armShadow, tone: 2 }] });

  if (spec.stripes) {
    const st = spec.stripes;
    const SR = rampOf(st.color);
    const y0 = P.chestY - (st.offset ?? 5) * k;
    const ev = Math.round(st.every * k);
    const hh = Math.max(1, Math.round(st.h * k));
    recolor(sp, stripesMask(res.inner, y0, ev, hh), R0, SR);
    if (st.sleeves !== false)
      for (const [key, s] of Object.entries(sleeves))
        if (s) for (const sl of sleeveSlots(P.arms[key])) recolor(L(sl), stripesMask(s.shrink(1), y0, ev, hh), RS, SR);
  }
  if (spec.plaid) {
    const pr = spec.plaid;
    const PR = rampOf(pr.color);
    const ev = Math.round(pr.every * k);
    const targets = [[sp, res.inner, R0]];
    for (const [key, s] of Object.entries(sleeves)) if (s) for (const sl of sleeveSlots(P.arms[key])) targets.push([L(sl), s.shrink(1), RS]);
    for (const [spr, m, RR] of targets) {
      const { h, v, both } = plaidMasks(m, ev, P.frontX, P.chestY, Math.max(1, Math.round((pr.w ?? 2) * k)));
      recolor(spr, h.or(v), RR, PR);
      both.forEach((x, y) => spr.set(x, y, PR[spr.get(x, y) === PR[2] ? 1 : 2]));
      if (pr.thin) {
        const t = plaidMasks(m, ev, P.frontX + Math.floor(ev / 2), P.chestY + Math.floor(ev / 2), 1);
        const TR = rampOf(pr.thin);
        t.h.or(t.v).forEach((x, y) => {
          if (RR.includes(spr.get(x, y))) spr.set(x, y, TR[3]);
        });
      }
    }
  }
  if (spec.folds !== false) {
    const wy = P.waistY;
    const fx = P.frontX;
    const inner = res.inner;
    fold(sp, [[fx - 12 * k, wy - 2 * k], [fx - 9 * k, wy], [fx - 6 * k, wy + 2 * k]], R0[2], inner);
    fold(sp, [[fx + 2 * k, wy + 1.4 * k], [fx + 4.4 * k, wy], [fx + 7 * k, wy - 1.6 * k]], R0[2], inner);
    fold(sp, [[fx - 8 * k, hemY - 5 * k], [fx - 5 * k, hemY - 3 * k], [fx - 2.4 * k, hemY - 2.4 * k]], R0[2], inner);
  }
  const neckKind = spec.neck ?? "crew";
  if (["crew", "v", "wide"].includes(neckKind)) {
    const rw = Math.max(1, Math.round(1.3 * k));
    const rib = holeFor(neckKind).grow(rw).and(body).minus(body.edge());
    sp.fill(rib, spec.rib ? rampOf(spec.rib)[3] : R0[2]);
    if (k > 1.4) sp.fill(holeFor(neckKind).grow(rw + 1).and(body).minus(rib).minus(body.edge()), R0[spec.rib ? 2 : 1]);
  }
  if (spec.hemBand) {
    const HB = spec.hemBand === true ? R0 : rampOf(spec.hemBand);
    const h = (spec.hemBandH ?? 3) * k;
    const band = body.filter((x, y) => y >= hemY - h);
    band.forEach((x, y) => sp.set(x, y, HB[isEdge(body, x, y) ? 0 : 2]));
    body.filter((x, y) => y >= hemY - h && y < hemY - h + 1).minus(body.edge()).forEach((x, y) => sp.set(x, y, HB[1]));
    if (k > 1.4)
      band.shrink(1).forEach((x, y) => {
        if ((x + Math.round(y / 2)) % 3 === 0) sp.set(x, y, HB[1]);
      });
  }
  if (spec.open?.lapel) {
    const fx = P.frontX;
    const lap = spec.open.lapel * k;
    const nb = P.neck.base;
    const n = P.neck;
    const neckM = S.rect(n.x0 - 0.2 * k, n.top, n.x1 - n.x0 + 0.4 * k, nb - n.top + 3 * k);
    const collar = S.ellipse(neckCx, nb - 0.6 * k, neckHW + 3.4 * k, 3.4 * k).minus(neckM).minus(holeFor("crew"));
    cel(sp, collar, R0, { base: 3, shadow: k, rim: k });
    const front = P.view === "front";
    const left = S.poly([
      [b.neckL[0] + 0.2 * k, nb - 2.4 * k],
      [fx - 2.4 * k, nb - 2.2 * k],
      [fx - 3.2 * k, nb + lap],
      [fx - (front ? 7.4 : 9) * k, nb + lap * 0.42],
      [b.neckL[0] - 1.6 * k, nb + 1.2 * k],
    ]);
    const right = front
      ? S.poly([[b.neckR[0] - 0.2 * k, nb - 2.4 * k], [fx + 2.4 * k, nb - 2.2 * k], [fx + 3.2 * k, nb + lap], [fx + 7.4 * k, nb + lap * 0.42], [b.neckR[0] + 1.6 * k, nb + 1.2 * k]])
      : S.poly([[b.neckR[0] - 0.4 * k, nb - 2.4 * k], [fx + 1.6 * k, nb - 2.2 * k], [fx + 2.6 * k, nb + lap * 0.85], [fx + 6 * k, nb + lap * 0.3]]);
    for (const m of [left, right]) cel(sp, m, spec.open.lapelColor ? rampOf(spec.open.lapelColor) : R0, { base: 4, shadow: 1.2 * k });
  }
  spec.details?.(ctx, { body, inner: res.inner, sleeves, R: R0, RS, slot, sp, hemY, k });
  return { body, sleeves };
}

// -------------------------------------------------------------- bottoms ----
/**
 * spec: { type: 'pants'|'shorts'|'skirt', color, fit, wide, length, extend, cuff: {h, color}, crease,
 *         pleat, belt: {color, buckle, loops}, stripe, rise, skirt: {len, flare, pleats, pleatGap, sway},
 *         plaid: {color, every}, details, legDetails }
 */
export function drawBottom(ctx, spec) {
  const { S, L, P } = ctx;
  const k = P.k ?? 1;
  const R0 = rampOf(spec.color);
  const fit = (spec.fit ?? 1.2) * k;
  const wide = (spec.wide ?? 0) * k;
  const b = P.box;
  const out = {};
  const len = spec.length ?? (spec.type === "shorts" ? 0.38 : 1);
  const legKeys = Object.keys(P.legs);

  if (spec.type !== "skirt") {
    for (const side of legKeys) {
      const l = P.legs[side];
      const far = !!l.far;
      const extend = len >= 1 ? (spec.extend ?? 0) * k : 0;
      const { mask: m, end, pts } = limbCover(S, ctx.body.legPath(l), l.widths, fit, len >= 1 ? 1 : len, wide, extend);
      const sp = L(l.slots.pant);
      cel(sp, m, R0, far ? farShade(m, k) : { shadow: 2.8 * k, rim: 1.3 * k });
      const inner = m.shrink(1);
      const dark = far ? R0[1] : R0[2];
      const lite = far ? null : R0[4];
      if (spec.crease !== false && len > 0.6) {
        const crease = pts.map(([x, y], i) => [x + (1.6 + i * 0.5) * k * (P.view === "front" ? 0 : 1), y]);
        fold(sp, crease.slice(1), dark, inner);
      }
      if (len > 0.6 && spec.folds !== false) {
        const kn = l.knee;
        fold(sp, [[kn[0] - 3.4 * k, kn[1] - 1.4 * k], [kn[0] - 1.4 * k, kn[1]], [kn[0] + 0.6 * k, kn[1] + k]], dark, inner, lite);
        fold(sp, [[kn[0] - 2.6 * k, kn[1] + 3 * k], [kn[0] + k, kn[1] + 4.4 * k]], dark, inner);
        if (wide > 2 * k) {
          const e = end.p;
          fold(sp, [[e[0] - 4 * k, e[1] - 9 * k], [e[0] - k, e[1] - 7 * k], [e[0] + 2 * k, e[1] - 8.4 * k]], dark, inner, lite);
          fold(sp, [[e[0] + 2.4 * k, e[1] - 14 * k], [e[0] + 3.4 * k, e[1] - 10 * k]], dark, inner);
        }
        const h0 = l.hip;
        fold(sp, [[h0[0] - 2 * k, h0[1] + 6 * k], [h0[0] + 1.4 * k, h0[1] + 9 * k]], dark, inner);
      }
      if (spec.stripe) {
        const SR = rampOf(spec.stripe);
        const off = P.view === "front" ? (l.side === "L" ? -1 : 1) * 3 * k : -2.4 * k;
        const line = splinePoints(pts.map(([x, y]) => [x + off, y]), 6);
        for (let w = 0; w < Math.max(1, Math.round(k)); w++)
          for (let i = 0; i < line.length - 1; i++)
            strokeLine(sp, [[line[i][0] + w, line[i][1]], [line[i + 1][0] + w, line[i + 1][1]]], SR[far ? 2 : w ? 4 : 3], inner);
      }
      if (spec.cuff) {
        const h = (spec.cuff.h ?? 3.5) * k;
        const CR = spec.cuff.color ? rampOf(spec.cuff.color) : R0;
        const band = endBand(m, end, h);
        band.forEach((x, y) => sp.set(x, y, CR[isEdge(m, x, y) ? 0 : far ? 2 : 3]));
        band.forEach((x, y) => {
          if (isEdge(m, x, y)) return;
          const v = along(x, y, end);
          if (v <= -h + 1.05) sp.set(x, y, CR[far ? 0 : 1]);
          else if (v <= -h + 2.1 && !far) sp.set(x, y, CR[4]);
          else if (v > -1.6) sp.set(x, y, CR[far ? 1 : 2]);
        });
      }
      if (spec.plaid) {
        const pr = spec.plaid;
        const ev = Math.round(pr.every * k);
        const { h, v, both } = plaidMasks(inner, ev, P.frontX, P.waistY, Math.max(1, Math.round((pr.w ?? 2) * k)));
        const PR = rampOf(pr.color);
        recolor(sp, h.or(v), R0, PR);
        both.forEach((x, y) => sp.set(x, y, PR[1]));
      }
      spec.legDetails?.(ctx, { sp, mask: m, inner, end, pts, far, R: R0, l, k });
      out[side] = m;
    }
  }

  const sp = L("bottom");
  const top = P.waistY - (spec.rise ?? 0) * k;
  if (spec.type === "skirt") {
    const sk = spec.skirt ?? {};
    const hemY = P.crotchY + (sk.len ?? 10) * k;
    const fl = (sk.flare ?? 5) * k;
    const sway = (P.anim === "walk" ? [1, 0, -1, 0, 1, 0, -1, 0][P.f] : 0) * (sk.sway ?? 1) * k;
    const m = S.blob([
      [b.waistL[0] - 0.6 * k, top, 1],
      [b.waistR[0] + 0.6 * k, top, 1],
      [b.hipR[0] + 1.6 * k, P.hipY - k],
      [b.hipR[0] + fl + sway, hemY, 1],
      [P.frontX + sway * 0.5, hemY + 1.2 * k],
      [b.hipL[0] - fl + sway, hemY, 1],
      [b.hipL[0] - 1.6 * k, P.hipY - k],
    ]);
    const res = cel(sp, m, R0, { shadow: 3 * k, rim: 1.2 * k });
    if (sk.pleats) {
      const n = sk.pleats;
      for (let i = -n; i <= n; i++) {
        const x0 = P.frontX + i * (sk.pleatGap ?? 3.6) * k;
        const x1 = x0 + i * 1.3 * k + sway * 0.6;
        fold(sp, [[x0, P.hipY - 2 * k], [(x0 + x1) / 2, (P.hipY + hemY) / 2], [x1, hemY]], R0[2], res.inner, k > 1.4 ? R0[4] : null);
      }
    }
    if (spec.plaid) {
      const pr = spec.plaid;
      const PR = rampOf(pr.color);
      const { h, v, both } = plaidMasks(res.inner, Math.round(pr.every * k), P.frontX, top, Math.max(1, Math.round((pr.w ?? 2) * k)));
      recolor(sp, h.or(v), R0, PR);
      both.forEach((x, y) => sp.set(x, y, PR[1]));
    }
    out.hips = m;
  } else {
    const hipXs = Object.values(P.hips).map((h) => h[0]);
    const m = S.blob([
      [b.waistL[0] - fit + 0.4 * k, top, 1],
      [b.waistR[0] + fit - 0.4 * k, top, 1],
      [b.hipR[0] + fit, P.hipY],
      [Math.max(...hipXs) + 5 * k, P.crotchY + k],
      [Math.min(...hipXs) - 5 * k, P.crotchY + k],
      [b.hipL[0] - fit, P.hipY],
    ]);
    let join = new Mask(m.w, m.h);
    for (const key of legKeys) if (out[key]) join = join.or(out[key]);
    const res = cel(sp, m, R0, { shadow: 1.8 * k, rim: k, join });
    if (spec.pleat !== false && k > 1.4) fold(sp, [[P.frontX - k, top + 3 * k], [P.frontX - 0.6 * k, P.crotchY - 2 * k]], R0[2], res.inner);
    out.hips = m;
  }
  const bandH = (spec.bandH ?? 3) * k;
  const band = out.hips.filter((x, y) => y >= top && y < top + bandH);
  if (spec.belt) {
    const BR = rampOf(spec.belt.color);
    band.forEach((x, y) => sp.set(x, y, BR[isEdge(out.hips, x, y) || y < top + 1 || y >= top + bandH - 1 ? 0 : 3]));
    band.shrink(1).filter((x, y) => y === Math.floor(top + 1)).forEach((x, y) => sp.set(x, y, BR[4]));
    if (spec.belt.buckle) {
      const bx = P.frontX - 2.6 * k;
      const bm = S.rect(bx, top - 0.5 * k, 5 * k, bandH + k);
      const BB = rampOf(spec.belt.buckle);
      sp.fill(bm, BB[3]).fill(bm.edge(), BB[0]);
      sp.fill(S.rect(bx + 1.2 * k, top + 0.8 * k, 2.4 * k, bandH - 1.4 * k), BB[1]);
    }
    if (spec.belt.loops !== false && k > 1.4)
      for (const lx of [b.waistL[0] + 3 * k, P.frontX + 7 * k]) sp.fill(S.rect(lx, top - 0.6 * k, 1.4 * k, bandH + 1.6 * k), R0[2]);
  } else {
    sp.fill(out.hips.filter((x, y) => y >= top + bandH - 1 && y < top + bandH).minus(out.hips.edge()), R0[1]);
  }
  spec.details?.(ctx, { sp, hips: out.hips, legs: out, R: R0, top, k });
  return out;
}

// ---------------------------------------------------------------- shoes ----
/**
 * spec: { upper, sole, chunky, high, low, toeCap, lace, accent, strap, socks, sockH, checker,
 *         sandal, gloss, details, frontDetails }  (design units, scaled by P.k)
 */
export function drawShoes(ctx, spec) {
  const { S, L, P } = ctx;
  const U = rampOf(spec.upper);
  const SO = rampOf(spec.sole ?? "#f2efe8");
  const k = (P.k ?? 1) * (P.footScale ?? 1);
  for (const side of Object.keys(P.legs)) {
    const l = P.legs[side];
    const far = !!l.far;
    const sp = L(l.slots.shoe);
    if (spec.socks) drawSock(ctx, spec, l, sp);
    if (l.foot.front) {
      drawFrontShoe(ctx, spec, l, sp, U, SO);
      continue;
    }
    const { ankle, angle } = l.foot;
    const r = (u, v, c) => {
      const a = (angle * Math.PI) / 180;
      u *= k;
      v *= k;
      const p = [ankle[0] + u * Math.cos(a) - v * Math.sin(a), ankle[1] + u * Math.sin(a) + v * Math.cos(a)];
      return c ? [...p, c] : p;
    };
    const pt = (a, bb) => [a, bb].map(([x, y]) => [Math.floor(x), Math.floor(y)]);
    const chunk = spec.chunky ?? 1;
    const high = spec.high ?? 0;
    const low = spec.low ? 3.4 : 0;
    const sole = S.blob([r(-6.2, 3.4), r(5, 3.6), r(14.8, 3.6), r(15.8, 5.2), r(14.8, 6.8 + chunk), r(-5.4, 6.8 + chunk), r(-6.8, 5)]);
    if (spec.sandal) {
      cel(sp, sole, SO, far ? farShade(sole, k) : { shadow: k });
      for (const [a, bb, w] of [[r(8.6, 1), r(10, 4.2), 2.2], [r(2, -1), r(6.4, 3.4), 2.2], [r(-4.6, -2.2), r(2.6, -3.4), 2]]) {
        const m = S.limb([a, bb], [w * k, w * k]);
        cel(sp, m, U, far ? farShade(m, k) : { shadow: 0.8 * k });
      }
      spec.details?.(ctx, { sp, sole, r, far, U, SO, k });
      continue;
    }
    const upper = S.blob([
      r(-5.4, 4.6), r(-6.2, 0.2 + low * 0.6), r(-5.2, -3.4 - high + low), r(-2.2, -5.4 - high + low, 1), r(2.2, -5.2 - high + low),
      r(4.6, -3 + low * 0.7), r(7.4, -0.8 + low * 0.4), r(10.8, 0.8 + low * 0.2), r(13.6, 2.6), r(14.6, 4.8),
    ]);
    cel(sp, upper, U, far ? farShade(upper, k) : { shadow: 2.2 * k, rim: 1.2 * k });
    const inner = upper.shrink(1);
    if (spec.checker) {
      const CR = rampOf(spec.checker);
      const c = Math.max(2, Math.round(1.6 * k));
      inner.forEach((x, y) => {
        if ((Math.floor(x / c) + Math.floor(y / c)) % 2 === 0) sp.set(x, y, CR[far ? 2 : 3]);
      });
    }
    if (spec.gloss && !far) strokeLine(sp, pt(r(-3.2, -2 - high), r(-3.6, 2.4)), U[5], inner);
    const soleOnly = sole.minus(upper.shrink(1));
    if (spec.sole !== null) {
      cel(sp, soleOnly, SO, far ? farShade(soleOnly, k) : { shadow: k });
      strokeLine(sp, pt(r(-5.6, 4.4), r(14.2, 4.4)), SO[far ? 1 : 2], sole.shrink(1));
      if (k > 1.4) strokeLine(sp, pt(r(-4.6, 6.2 + chunk), r(13.8, 6.2 + chunk)), SO[far ? 1 : 2], sole.shrink(1));
    }
    if (spec.toeCap) {
      const cap = S.blob([r(9, 0.8), r(13.4, 2.6), r(14, 4.6), r(8.6, 4.4)]).and(inner);
      sp.fill(cap, rampOf(spec.toeCap)[far ? 2 : 3]);
      strokeLine(sp, pt(r(9, 0.8), r(8.6, 4.4)), U[far ? 1 : 2], inner);
    }
    if (spec.lace) {
      const LR = rampOf(spec.lace);
      for (const [u, v] of [[2.6, -3.2 + low], [4.2, -2 + low * 0.8], [5.8, -0.9 + low * 0.5], [7.4, low * 0.3]]) {
        const [x, y] = r(u, v);
        sp.fill(S.ellipse(x, y, 0.9 * k, 0.6 * k).and(upper), LR[3]);
        sp.set(Math.floor(x + 0.6 * k), Math.floor(y + 0.4 * k), LR[1]);
      }
    }
    if (spec.strap) {
      const SR = rampOf(spec.strap);
      const m = S.limb([r(1.6, -2.2 + low * 0.5), r(5.6, 2)], [1.8 * k, 1.8 * k]);
      cel(sp, m, SR, { shadow: 0.6 * k });
      const [bx, by] = r(5.2, 1.4);
      sp.fill(S.ellipse(bx, by, 0.8 * k, 0.8 * k), "#d8c9a0");
    }
    if (spec.accent) {
      const AR = rampOf(spec.accent);
      const line = [r(-3.4, 2.6), r(1.6, 1.4), r(7.2, 2.8)].map(([x, y]) => [Math.floor(x), Math.floor(y)]);
      for (let w = 0; w < Math.max(1, Math.round(k)); w++) strokeLine(sp, line.map(([x, y]) => [x, y + w]), AR[far ? 2 : w ? 2 : 3], inner);
    }
    spec.details?.(ctx, { sp, upper, sole, r, far, U, SO, k });
  }
}

/** Ankle sock: a short tube above the shoe (visible with skirts and shorts). */
function drawSock(ctx, spec, l, sp) {
  const { S, P } = ctx;
  const k = (P.k ?? 1) * (P.footScale ?? 1);
  const SR = rampOf(spec.socks);
  const a = l.ankle;
  const kd = [l.knee[0] - a[0], l.knee[1] - a[1]];
  const n = Math.hypot(kd[0], kd[1]) || 1;
  const h = (spec.sockH ?? 6) * k;
  const top = [a[0] + (kd[0] / n) * h, a[1] + (kd[1] / n) * h];
  const w = l.widths[3] + 1.4 * k;
  const m = S.limb([a, top], [w, w + 0.6 * k]);
  cel(sp, m, SR, l.far ? farShade(m, k) : { shadow: 1.4 * k, rim: 0.8 * k });
  const band = m.filter((x, y) => (x + 0.5 - top[0]) * (kd[0] / n) + (y + 0.5 - top[1]) * (kd[1] / n) > -1.6 * k);
  band.minus(m.edge()).forEach((x, y) => sp.set(x, y, SR[2]));
}

/** Front-view shoe (chibi): rounded toe box seen from the front. */
function drawFrontShoe(ctx, spec, l, sp, U, SO) {
  const { S, P } = ctx;
  const k = P.k ?? 1;
  const { ankle, out = 0 } = l.foot;
  const x = ankle[0] + out * 0.6;
  const y = ankle[1];
  const chunk = (spec.chunky ?? 1) * 0.8 * k;
  const high = (spec.high ?? 0) * 0.8 * k;
  const low = spec.low ? 2.4 * k : 0;
  const sole = S.blob([[x - 6.8 * k, y + 3.6 * k, 1], [x + 6.8 * k, y + 3.6 * k, 1], [x + 6.6 * k, y + 6.6 * k + chunk, 1], [x - 6.6 * k, y + 6.6 * k + chunk, 1]]);
  if (spec.sandal) {
    cel(sp, sole, SO, { shadow: k });
    for (const yy of [1.4, 3.6]) cel(sp, S.rect(x - 5.6 * k, y + yy * k, 11.2 * k, 1.6 * k), U, { shadow: 0.4 * k });
    spec.frontDetails?.(ctx, { sp, sole, x, y, k, U, SO, out });
    return;
  }
  const upper = S.blob([
    [x - 4.6 * k, y - 2.6 * k - high + low], [x + 4.6 * k, y - 2.6 * k - high + low], [x + 6.2 * k, y + 2.2 * k],
    [x + 6 * k, y + 5 * k], [x - 6 * k, y + 5 * k], [x - 6.2 * k, y + 2.2 * k],
  ]);
  cel(sp, upper, U, { shadow: 1.8 * k, rim: 1.2 * k });
  const inner = upper.shrink(1);
  if (spec.checker) {
    const CR = rampOf(spec.checker);
    const c = Math.max(2, Math.round(1.6 * k));
    inner.forEach((xx, yy) => {
      if ((Math.floor(xx / c) + Math.floor(yy / c)) % 2 === 0) sp.set(xx, yy, CR[3]);
    });
  }
  if (spec.gloss) sp.fill(S.rect(x - 3.6 * k, y - 1.4 * k - high, k, 4 * k).and(inner), U[5]);
  if (spec.sole !== null) cel(sp, sole.minus(upper.shrink(1)), SO, { shadow: k });
  if (spec.toeCap) sp.fill(S.ellipse(x, y + 3.2 * k, 3.6 * k, 1.6 * k).and(inner), rampOf(spec.toeCap)[3]);
  if (spec.lace) {
    const LR = rampOf(spec.lace);
    for (const yy of [-1, 1]) for (const xx of [-1.5, 1.5]) sp.set(Math.floor(x + xx * k), Math.floor(y + yy * k + low), LR[3]);
  }
  if (spec.strap) cel(sp, S.rect(x - 5 * k, y - 0.4 * k + low * 0.5, 10 * k, 1.6 * k).and(upper.grow(1)), rampOf(spec.strap), { shadow: 0.4 * k });
  if (spec.accent) {
    const AR = rampOf(spec.accent);
    const side = out >= 0 ? 1 : -1;
    strokeLine(sp, [[x + side * 2.5 * k, y + k], [x + side * 5 * k, y + 3 * k]], AR[3], inner);
  }
  spec.frontDetails?.(ctx, { sp, upper, sole, x, y, k, U, SO, out });
}
