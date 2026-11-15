// Reusable garment details. Each painter works in both views: positions are
// offsets from the front-centre line (P.frontX), foreshortened on the far side
// in the 3/4 view. Units are design px scaled by P.k.
import { cel, strokeLine, splinePoints } from "../lib/canvas.mjs";
import { rampOf, fold } from "./garments.mjs";

/** x for an offset d (design px) from the front line; far side is narrower in 3/4. */
export function fx(P, d) {
  const k = P.k;
  if (P.view === "front") return P.frontX + d * k;
  return P.frontX + (d > 0 ? d * 0.55 : d) * k;
}

function line(sp, pts, color, clip) {
  const l = splinePoints(pts, 6);
  for (let i = 0; i < l.length - 1; i++) strokeLine(sp, [l[i], l[i + 1]], color, clip);
}

export function kangarooPocket(ctx, { sp, inner, R, hemY }) {
  const { S, P } = ctx;
  const k = P.k;
  const y0 = hemY - 12 * k;
  const y1 = hemY - 3.6 * k;
  const m = S.blob([[fx(P, -9), y0, 1], [fx(P, 9), y0, 1], [fx(P, 11.5), y1, 1], [fx(P, -11.5), y1, 1]]);
  cel(sp, m.and(inner.grow(1)), R, { shadow: 1.6 * k, outlineTone: 1 });
  fold(sp, [[fx(P, -9), y0 + k], [fx(P, -11), y1 - k]], R[1], inner);
  fold(sp, [[fx(P, 9), y0 + k], [fx(P, 11), y1 - k]], R[1], inner);
}

export function hood(ctx, { sp, R }) {
  const { S, P } = ctx;
  const k = P.k;
  const n = P.neck;
  const cxn = (n.x0 + n.x1) / 2;
  const neckM = S.rect(n.x0, n.top, n.x1 - n.x0, n.base - n.top);
  let m;
  if (P.view === "front") {
    m = S.blob([[cxn - 15 * k, n.base + 2 * k], [cxn - 13 * k, n.base - 5 * k], [cxn, n.base - 7 * k], [cxn + 13 * k, n.base - 5 * k], [cxn + 15 * k, n.base + 2 * k], [cxn, n.base + 5 * k]]);
  } else {
    m = S.blob([[n.x0 - 7 * k, n.base - 3 * k], [n.x0 - 3 * k, n.base - 8.6 * k], [n.x1 + 0.6 * k, n.base - 6.4 * k], [n.x1 + 3 * k, n.base - 1.6 * k], [n.x1 - 2 * k, n.base + 2.6 * k], [n.x0 - 2 * k, n.base + 3.2 * k], [n.x0 - 8.6 * k, n.base + 1.4 * k]]);
  }
  const hole = S.ellipse(cxn + (P.view === "front" ? 0 : 0.6 * k), n.base - 1.6 * k, (n.x1 - n.x0) / 2 + 0.8 * k, 3.4 * k);
  cel(sp, m.minus(hole).minus(neckM), R, { shadow: 2 * k, rim: k, regions: [{ mask: hole.grow(Math.round(k)).and(m).minus(hole), tone: 4 }] });
}

export function drawstrings(ctx, { sp }, color = "#efe9df") {
  const { S, P } = ctx;
  const k = P.k;
  const top = P.neck.base + k;
  for (const d of [-2, 2.2]) {
    const x = fx(P, d);
    sp.fill(S.taper([[x, top], [x + 0.4 * k, top + 8 * k]], [0.9 * k, 0.9 * k]), color);
    sp.fill(S.ellipse(x + 0.4 * k, top + 9 * k, 0.9 * k, 1.1 * k), "#c9c1b4");
  }
}

export function shirtCollar(ctx, { sp }, color = "#fbfaf6") {
  const { S, P } = ctx;
  const k = P.k;
  const nb = P.neck.base;
  const n = P.neck;
  const R = rampOf(color);
  const front = P.view === "front";
  const left = S.poly([[n.x0 - 1.4 * k, nb - 3.4 * k], [fx(P, -0.6), nb + 0.6 * k], [fx(P, -4.6), nb + 4.6 * k], [n.x0 - 3.4 * k, nb + 1.4 * k]]);
  const right = front
    ? S.poly([[n.x1 + 1.4 * k, nb - 3.4 * k], [fx(P, 0.6), nb + 0.6 * k], [fx(P, 4.6), nb + 4.6 * k], [n.x1 + 3.4 * k, nb + 1.4 * k]])
    : S.poly([[n.x1 + 0.6 * k, nb - 3 * k], [fx(P, 0.6), nb + 0.6 * k], [fx(P, 3.4), nb + 3.6 * k], [n.x1 + 1.8 * k, nb + 1.2 * k]]);
  for (const m of [left, right]) cel(sp, m, R, { shadow: 0.8 * k, rim: 0.6 * k });
}

export function necktie(ctx, { sp, hemY }, color = "#a83a3a", stripe) {
  const { S, P } = ctx;
  const k = P.k;
  const nb = P.neck.base;
  const R = rampOf(color);
  const x = fx(P, 0);
  const knot = S.blob([[x - 1.6 * k, nb], [x + 1.6 * k, nb], [x + 1.2 * k, nb + 2.6 * k], [x - 1.2 * k, nb + 2.6 * k]]);
  const blade = S.blob([[x - 1.2 * k, nb + 2.4 * k], [x + 1.2 * k, nb + 2.4 * k], [x + 2.4 * k, Math.min(hemY - 6 * k, P.waistY + 2 * k), 1], [x, Math.min(hemY - 4 * k, P.waistY + 4.6 * k), 1], [x - 2.4 * k, Math.min(hemY - 6 * k, P.waistY + 2 * k), 1]]);
  cel(sp, blade, R, { shadow: 0.8 * k, rim: 0.6 * k });
  cel(sp, knot, R, { base: 2, shadow: 0.6 * k });
  if (stripe) {
    const SR = rampOf(stripe);
    blade.shrink(1).forEach((px, py) => {
      if ((px + py) % Math.round(3 * k) === 0) sp.set(px, py, SR[3]);
    });
  }
}

export function ribbonBow(ctx, { sp }, color = "#c8383d") {
  const { S, P } = ctx;
  const k = P.k;
  const y = P.neck.base + 2 * k;
  const x = fx(P, 0);
  const R = rampOf(color);
  const loopL = S.blob([[x, y], [x - 4.6 * k, y - 2.4 * k], [x - 5.4 * k, y + 1.2 * k], [x - 2.4 * k, y + 2 * k]]);
  const loopR = S.blob([[x, y], [x + 4.6 * k, y - 2.4 * k], [x + 5.4 * k, y + 1.2 * k], [x + 2.4 * k, y + 2 * k]]);
  const tails = S.taper([[x - 0.6 * k, y + k], [x - 2.4 * k, y + 6 * k]], [2 * k, 1.4 * k]).or(S.taper([[x + 0.6 * k, y + k], [x + 2.4 * k, y + 6 * k]], [2 * k, 1.4 * k]));
  cel(sp, tails, R, { base: 2, shadow: 0.6 * k });
  for (const m of [loopL, loopR]) cel(sp, m, R, { shadow: 0.8 * k, rim: 0.6 * k });
  cel(sp, S.ellipse(x, y + 0.4 * k, 1.3 * k, 1.3 * k), R, { base: 2 });
}

export function sailorCollar(ctx, { sp }, color = "#2f4468", trim = "#f3efe6", scarf = "#c8383d") {
  const { S, P } = ctx;
  const k = P.k;
  const b = P.box;
  const nb = P.neck.base;
  const R = rampOf(color);
  const front = P.view === "front";
  const pts = front
    ? [[b.shL[0] + 2 * k, b.shL[1] - k], [b.shR[0] - 2 * k, b.shR[1] - k], [b.shR[0] + 0.4 * k, P.chestY - k], [fx(P, 0), P.chestY + 6 * k], [b.shL[0] - 0.4 * k, P.chestY - k]]
    : [[b.shL[0] + 1 * k, b.shL[1] - k], [b.shR[0] - 4 * k, b.shR[1] - k], [b.shR[0] - 2 * k, P.chestY - 3 * k], [fx(P, 0), P.chestY + 6 * k], [b.shL[0] - 0.4 * k, P.chestY]];
  const collar = S.poly(pts).minus(S.ellipse((P.neck.x0 + P.neck.x1) / 2, nb - 0.6 * k, (P.neck.x1 - P.neck.x0) / 2 + 1.6 * k, 3.6 * k));
  const vcut = S.poly([[fx(P, -4), nb - k], [fx(P, 4), nb - k], [fx(P, 0), P.chestY + 4 * k]]);
  const m = collar.minus(vcut);
  cel(sp, m, R, { shadow: 1.2 * k, rim: 0.8 * k });
  const trimLine = m.shrink(Math.max(1, Math.round(1.4 * k))).edge();
  sp.fill(trimLine.and(m.shrink(1)), rampOf(trim)[3]);
  ribbonBow(ctx, { sp }, scarf);
}

export function buttons(ctx, { sp, inner }, opts = {}) {
  const { S, P } = ctx;
  const k = P.k;
  const x = fx(P, opts.d ?? 0);
  const y0 = opts.y0 ?? P.neck.base + 5 * k;
  const y1 = opts.y1 ?? P.waistY + 6 * k;
  const n = opts.n ?? 4;
  const BR = rampOf(opts.color ?? "#e8e2d4");
  if (opts.placket) line(sp, [[x + 1.6 * k, y0 - 2 * k], [x + 1.6 * k, y1 + 2 * k]], opts.placket, inner);
  for (let i = 0; i < n; i++) {
    const y = y0 + ((y1 - y0) * i) / Math.max(1, n - 1);
    const m = S.ellipse(x, y, 0.95 * k, 0.95 * k);
    sp.fill(m.and(inner), BR[3]).fill(m.edge().and(inner), BR[1]);
  }
}

export function zipper(ctx, { sp, inner, hemY }, color = "#d9d4c8") {
  const { S, P } = ctx;
  const k = P.k;
  const x = fx(P, 0);
  line(sp, [[x, P.neck.base], [x, hemY]], rampOf(color)[2], inner);
  sp.fill(S.rect(x - 0.6 * k, P.neck.base + 2 * k, 1.6 * k, 2.6 * k).and(inner), rampOf(color)[4]);
}

/** Tiny chest motif: star, heart, daisy, smile or a letter-shaped patch. */
export function chestPrint(ctx, { sp, inner }, kind = "star", color = "#e0a63a", d = -7) {
  const { S, P } = ctx;
  const k = P.k;
  const x = fx(P, d);
  const y = P.chestY + 1 * k;
  const R = rampOf(color);
  let m;
  if (kind === "heart") m = S.ellipse(x - 1.1 * k, y - 0.6 * k, 1.3 * k, 1.2 * k).or(S.ellipse(x + 1.1 * k, y - 0.6 * k, 1.3 * k, 1.2 * k)).or(S.poly([[x - 2.4 * k, y - 0.2 * k], [x + 2.4 * k, y - 0.2 * k], [x, y + 2.6 * k]]));
  else if (kind === "daisy") {
    m = S.empty();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      m = m.or(S.ellipse(x + Math.cos(a) * 1.6 * k, y + Math.sin(a) * 1.6 * k, 1 * k, 1 * k));
    }
    cel(sp, m.and(inner), rampOf("#fbf8ef"), { shadow: 0.4 * k });
    sp.fill(S.ellipse(x, y, 0.9 * k, 0.9 * k).and(inner), "#e8b33c");
    return;
  } else if (kind === "smile") {
    m = S.ellipse(x, y, 2.6 * k, 2.6 * k);
    cel(sp, m.and(inner), R, { shadow: 0.6 * k });
    sp.set(Math.round(x - 0.9 * k), Math.round(y - 0.6 * k), R[0]);
    sp.set(Math.round(x + 0.9 * k), Math.round(y - 0.6 * k), R[0]);
    line(sp, [[x - 1.2 * k, y + 0.8 * k], [x, y + 1.4 * k], [x + 1.2 * k, y + 0.8 * k]], R[0], inner);
    return;
  } else {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = (i % 2 ? 1.1 : 2.6) * k;
      pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    m = S.poly(pts);
  }
  cel(sp, m.and(inner), R, { shadow: 0.5 * k });
}

/** Varsity chenille letter: a 5x5 pixel glyph scaled up, with a contrasting border. */
const GLYPHS = {
  B: ["1111.", "1...1", "1111.", "1...1", "1111."],
  M: ["1...1", "11.11", "1.1.1", "1...1", "1...1"],
};
export function letterPatch(ctx, { sp, inner }, letter = "B", color = "#f3e9d2", edge = "#b8333a", d = -7) {
  const { S, P } = ctx;
  const k = P.k;
  const g = GLYPHS[letter] ?? GLYPHS.B;
  const cell = Math.max(1, Math.round(0.95 * k));
  const x0 = Math.round(fx(P, d) - 2.5 * cell);
  const y0 = Math.round(P.chestY - 1.5 * k);
  let m = S.empty();
  g.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === "1") m = m.or(S.rect(x0 + x * cell, y0 + y * cell, cell, cell));
  }));
  sp.fill(m.grow(1).and(inner), rampOf(edge)[3]);
  sp.fill(m.and(inner), rampOf(color)[3]);
}

export function chestPockets(ctx, { sp, inner, R }, opts = {}) {
  const { S, P } = ctx;
  const k = P.k;
  const y = P.chestY - 2 * k;
  for (const d of opts.sides ?? [-7, 6]) {
    const w = (P.view === "side" && d > 0 ? 3.4 : 5.4) * k;
    const x = fx(P, d) - w / 2;
    const pocket = S.rect(x, y, w, 5 * k);
    cel(sp, pocket.and(inner), R, { shadow: 0.8 * k, outlineTone: 1 });
    const flap = S.rect(x - 0.4 * k, y - 0.6 * k, w + 0.8 * k, 2.2 * k);
    cel(sp, flap.and(inner), R, { base: 2, outlineTone: 1 });
    if (opts.button) sp.set(Math.round(x + w / 2), Math.round(y + 1.2 * k), rampOf(opts.button)[3]);
  }
}

export function stitching(ctx, { sp, inner, hemY }, color = "#d9a35a") {
  const { P } = ctx;
  const k = P.k;
  const SR = rampOf(color)[3];
  for (const d of [-2.8, 2.8]) {
    const x = Math.round(fx(P, d));
    for (let y = Math.round(P.neck.base + 2 * k); y < hemY - k; y++) if (y % 3 === 0 && inner.has(x, y)) sp.set(x, y, SR);
  }
  const y = Math.round(hemY - 4 * k);
  for (let x = 0; x < sp.w; x++) if (x % 3 === 0 && inner.has(x, y)) sp.set(x, y, SR);
}

export function knitRibs(ctx, { sp, inner, R }) {
  const { P } = ctx;
  const k = P.k;
  const step = Math.max(3, Math.round(3.2 * k));
  inner.forEach((x, y) => {
    const v = (x + Math.round(Math.sin(y / (2.4 * k)) * 1.2)) % step;
    if (v === 0 && sp.get(x, y) === R[3]) sp.set(x, y, R[2]);
  });
}

export function argyle(ctx, { sp, inner, R }, color = "#7a5a3a", line = "#f2e6c8") {
  const { P } = ctx;
  const k = P.k;
  const s = Math.round(6 * k);
  const AR = rampOf(color);
  const LR = rampOf(line);
  inner.forEach((x, y) => {
    const u = x - P.frontX;
    const v = y - P.chestY;
    const a = ((u + v) % (2 * s) + 2 * s) % (2 * s);
    const b = ((u - v) % (2 * s) + 2 * s) % (2 * s);
    const ia = Math.floor(((u + v) / (2 * s)));
    const ib = Math.floor(((u - v) / (2 * s)));
    if ((ia + ib) % 2 === 0) {
      const i = R.indexOf(sp.get(x, y));
      if (i >= 0) sp.set(x, y, AR[i]);
    }
    if (a === 0 || b === 0) sp.set(x, y, LR[3]);
  });
}

export function necklace(ctx, { sp }, color = "#c8b07a") {
  const { S, P } = ctx;
  const k = P.k;
  const n = P.neck;
  const cxn = (n.x0 + n.x1) / 2 + (P.view === "front" ? 0 : k);
  const pts = splinePoints([[n.x0 - 0.6 * k, n.base - 0.6 * k], [cxn, n.base + 3.4 * k], [n.x1 + 0.8 * k, n.base - 0.8 * k]], 8);
  for (let i = 0; i < pts.length - 1; i++) strokeLine(sp, [pts[i], pts[i + 1]], rampOf(color)[2], null);
  const pend = S.ellipse(cxn, n.base + 4.2 * k, 0.9 * k, 1.1 * k);
  sp.fill(pend, rampOf(color)[4]).fill(pend.edge(), rampOf(color)[0]);
}

export function poloPlacket(ctx, info, color) {
  const { P } = ctx;
  const k = P.k;
  shirtCollar(ctx, info, color);
  buttons(ctx, info, { n: 2, y0: P.neck.base + 2.4 * k, y1: P.neck.base + 6 * k, color: "#f4f1ea", placket: info.R[2] });
}

export function sleeveStripes(colors, at = 0.75) {
  // returns a sleeveDetails(ctx, info) function adding two stripes near the cuff
  return (ctx, { sp, full, a, k }) => {
    const e = a.elbow;
    const w = a.wrist;
    for (const [i, c] of colors.entries()) {
      const t = at + i * 0.08;
      const p = [e[0] + (w[0] - e[0]) * t, e[1] + (w[1] - e[1]) * t];
      const d = Math.hypot(w[0] - e[0], w[1] - e[1]) || 1;
      const ux = (w[0] - e[0]) / d;
      const uy = (w[1] - e[1]) / d;
      full.shrink(1).forEach((x, y) => {
        const v = (x + 0.5 - p[0]) * ux + (y + 0.5 - p[1]) * uy;
        if (v >= 0 && v < Math.max(1, 0.9 * k)) sp.set(x, y, rampOf(c)[3]);
      });
    }
  };
}
