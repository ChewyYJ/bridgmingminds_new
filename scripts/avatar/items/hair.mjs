// Parametric anime hair for both views. A style is a small description
// (volume, bangs, locks, length, waves, extras) that is turned into clumps for
// the 3/4 "side" head (big style) and the front-facing chibi head.
import { drawHairParts, fringeShadow } from "../lib/hairkit.mjs";
import { rng } from "../lib/canvas.mjs";

const lerp = (a, b, t) => a + (b - a) * t;

/** Head-space helpers for one view. */
function geo(H) {
  const side = H.view === "side";
  return {
    side,
    // forehead u (-1 back/left .. 1 right) -> x
    ux: (u) => (side ? H.faceX + u * (u < 0 ? 14.5 : 13) : u * 36.5),
    hairline: side ? -9.4 : -17.6,
    brow: side ? -6.5 : -4.6,
    eyeTop: side ? -1.5 : 3,
    rootY: side ? -21.5 : -33,
    s: side ? 1 : 1.9, // length scale for widths
  };
}

function capPoints(H, st) {
  const v = (st.vol ?? 1) * H.vol;
  const sides = st.sides ?? "covered";
  if (H.view === "side") {
    const top = [
      [17.6 + v * 0.45, 1.6], [19.2 + v * 0.6, -6.2], [18 + v * 0.6, -14.2 - v * 0.3], [13 + v * 0.45, -20 - v * 0.55],
      [5.6, -23.6 - v * 0.8], [-3, -24.2 - v * 0.9], [-12, -21.8 - v * 0.7], [-18.4 - v * 0.45, -16.2 - v * 0.35],
      [-21.2 - v * 0.6, -8],
    ];
    if (sides === "tucked")
      return [...top, [-20.6 - v * 0.5, 1], [-18.8, 8.6], [-17.6, 4], [-16, -1.6], [-11.4, -2.4], [-10.4, 5], [-8.6, 4.8], [-8.6, -4], [-3.5, -7.4], [4.6, -8], [12.5, -6.4], [16.3, -2.2]];
    return [...top, [-21.6 - v * 0.6, 0], [-20.6 - v * 0.5, 9], [-17.4, 15.6], [-12.8, 16.2], [-11.6, 8], [-11.2, -1], [-5, -8.6], [4, -10], [12, -7.6], [16.8, -2]];
  }
  const t = [
    [39 + v * 0.45, 6], [40.6 + v * 0.6, -9], [34 + v * 0.6, -25 - v * 0.45], [19 + v * 0.35, -35.6 - v * 0.8], [0, -38.6 - v],
    [-19 - v * 0.35, -35.6 - v * 0.8], [-34 - v * 0.6, -25 - v * 0.45], [-40.6 - v * 0.6, -9], [-39 - v * 0.45, 6],
  ];
  if (sides === "tucked") return [...t, [-35.6, 4], [-31.6, -4], [-21, -14.6], [0, -17.6], [21, -14.6], [31.6, -4], [35.6, 4]];
  return [...t, [-40 - v * 0.4, 18], [-35, 26], [-31, 14], [-31.6, -4], [-21, -14.6], [0, -17.6], [21, -14.6], [31.6, -4], [31, 14], [35, 26], [40 + v * 0.4, 18]];
}

/** Bang clumps across the forehead. */
function bangClumps(H, st) {
  const g = geo(H);
  const b = st.bangs ?? { type: "swept" };
  if (b.type === "none") return [];
  const n = Math.round((b.count ?? (g.side ? 5 : 7)) * (b.type === "wispy" ? 1.3 : 1));
  const [u0, u1] = b.span ?? (g.side ? [-0.95, 1] : [-0.92, 0.92]);
  const depth = b.depth ?? 0.9;
  const tipY = (d) => g.hairline + (g.eyeTop - g.hairline) * d;
  const R = rng(st.seed ?? 7);
  const width = ((u1 - u0) / n) * (g.side ? 13.6 : 36.5) * (b.type === "wispy" ? 1.15 : 1.75);
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const u = lerp(u0, u1, f);
    let tu = u;
    let ru = u * 0.8;
    let d = depth;
    let curve = 0;
    switch (b.type) {
      case "swept": {
        const dir = b.dir ?? 1;
        ru = lerp(b.part ?? -0.5, u, 0.45);
        tu = u + dir * 0.12;
        d = depth * (dir > 0 ? lerp(0.82, 1.08, f) : lerp(1.08, 0.82, f));
        curve = dir * 1.6;
        break;
      }
      case "curtain": {
        const o = Math.sign(u) || 1;
        ru = u * 0.25;
        tu = u + o * 0.14;
        d = depth * lerp(0.45, 1.1, Math.min(1, Math.abs(u) / Math.max(Math.abs(u0), Math.abs(u1))));
        curve = o * 2;
        break;
      }
      case "spiky":
        ru = u * 0.7;
        tu = u + 0.08;
        d = depth * (i % 2 ? 0.7 : 1);
        curve = 1;
        break;
      case "messy":
        ru = u * 0.75 + (R() - 0.5) * 0.2;
        tu = u + (R() - 0.5) * 0.18;
        d = depth * (0.75 + R() * 0.35);
        curve = (R() - 0.5) * 3;
        break;
      case "straight":
      default:
        ru = u * 0.88;
        tu = u;
        d = depth * (1 + (i % 2 ? -0.05 : 0.04));
    }
    const rx = g.ux(ru);
    const tx = g.ux(tu);
    const ry = g.rootY + (g.side ? 2 : 4) * Math.abs(ru);
    const ty = tipY(d);
    const mx = lerp(rx, tx, 0.55) + curve * g.s;
    const my = lerp(ry, ty, 0.55);
    const w = width * (b.type === "spiky" ? 0.9 : 1);
    out.push({
      p: [[rx, ry], [mx, my], [lerp(mx, tx, 0.6), lerp(my, ty, 0.7)], [tx, ty]],
      w: [w, w * 0.92, w * 0.5, 0],
      spine: [[lerp(rx, mx, 0.4) + 0.6 * g.s, lerp(ry, my, 0.4)], [lerp(mx, tx, 0.5) + 0.6 * g.s, lerp(my, ty, 0.5)]],
    });
  }
  return out;
}

/** Face-framing locks hanging by the cheeks. */
function lockClumps(H, st) {
  const g = geo(H);
  const lv = st.locks;
  if (!lv) return [];
  const y1 = H.levels[lv] ?? lv;
  const out = [];
  const curl = st.wave ? 1 : 0;
  if (g.side) {
    out.push({ p: [[-12.2, -12], [-14.8, -2], [-15.8, 8], [-14.8, lerp(8, y1, 0.55)], [-12, y1 - 3], [-9.6 + curl * 2, y1 + 1]], w: [11.6, 11.6, 10.4, 8.4, 5.2, 0] });
    out.push({ p: [[15.6, -12], [18.8, -3], [19.6, 7], [18.4, lerp(7, y1, 0.6)], [16 + curl * 2, y1]], w: [7.4, 8, 7.4, 4.8, 0] });
  } else {
    for (const o of [-1, 1])
      out.push({
        p: [[o * 30, -16], [o * 35.6, -2], [o * 37, 12], [o * 35.6, lerp(12, y1, 0.6)], [o * (31 - curl * 3), y1]],
        w: [15, 16, 14, 9, 0],
      });
  }
  return out;
}

/** Hair mass behind the head/body down to `length`. */
function backPoints(H, st) {
  const L = H.levels[st.length];
  if (L === undefined || ["buzz", "short", "ear"].includes(st.length)) return null;
  const v = (st.vol ?? 1) * H.vol;
  if (H.view === "side") {
    return [
      [-15, -18], [-21.6 - v * 0.6, -10], [-24.6 - v * 0.6, 0], [-25.6 - v * 0.6, Math.min(12, L * 0.4)],
      [-26.4 - v * 0.6, L * 0.55], [-26.8 - v * 0.5, L * 0.78], [-24.6 - v * 0.3, L - 4], [-19.6, L + 0.6],
      [-13.4, L - 2], [-8.2, L + 2], [-2, L - 1], [4, L], [10.8, L - 5], [15.8, L * 0.74], [19, L * 0.52],
      [20.6, Math.min(14, L * 0.45)], [20.4, 0], [16.6, -14], [6, -22.8], [-5, -24],
    ];
  }
  const wv = 39 + v * 0.7;
  const right = [[24, -36 - v * 0.8], [wv - 2, -24], [wv + 3, -6], [wv + 4, 12], [wv + 4.6, lerp(12, L, 0.55)], [wv + 3, L - 8], [wv - 2, L], [wv - 12, L - 3], [16, L - 8]];
  return [[0, -38 - v], ...right, ...right.slice().reverse().map(([x, y]) => [-x, y])];
}

function waveOutline(points, amp, period, side) {
  return points.map(([x, y]) => {
    const outer = side ? x < -14 : Math.abs(x) > 34;
    const d = outer && y > 0 ? amp * Math.sin((y / period) * Math.PI * 2) : 0;
    return [x + (side ? d : Math.sign(x) * d), y];
  });
}

/** Curl clumps along the bottom of long wavy hair. */
function curlClumps(H, st) {
  const L = H.levels[st.length];
  if (!st.wave || L === undefined || L < 30) return [];
  if (H.view === "side")
    return [
      { p: [[-26, L * 0.25], [-31.6, L * 0.47], [-28.6, L * 0.66], [-33, L * 0.85], [-29, L], [-24.6, L + 2]], w: [10, 11, 10, 9, 6, 0] },
      { p: [[-18, L * 0.42], [-22, L * 0.66], [-18.6, L * 0.8], [-22, L * 0.95], [-18, L + 4]], w: [9, 9.6, 8.6, 6, 0] },
      { p: [[16, L * 0.5], [20.6, L * 0.68], [17.6, L * 0.86], [20, L + 1]], w: [8, 8.6, 6.4, 0] },
    ];
  const out = [];
  for (const o of [-1, 1])
    out.push(
      { p: [[o * 40, 10], [o * 47, L * 0.45], [o * 43, L * 0.68], [o * 48, L * 0.86], [o * 43, L + 3]], w: [14, 15, 13, 10, 0] },
      { p: [[o * 30, 24], [o * 35, L * 0.6], [o * 31, L * 0.8], [o * 35, L + 5]], w: [12, 12, 10, 0] },
    );
  return out;
}

/** Extra pieces: ponytails, buns, braids, quiffs, spikes... (returns {front:[], back:[]}). */
function extras(H, st) {
  const side = H.view === "side";
  const v = (st.vol ?? 1) * H.vol;
  const front = [];
  const back = [];
  const ties = [];
  const tie = st.tie ?? "#c8504a";
  for (const ex of st.extras ?? []) {
    switch (ex) {
      case "ponytail": {
        const L = H.levels[st.tailLength ?? "chest"];
        if (side) {
          back.push({ p: [[-14, -19], [-24, -15], [-29, -2], [-28, L * 0.5], [-24, L * 0.85], [-19, L]], w: [12, 13, 12, 10, 6, 0], swing: 1.6 });
          ties.push({ c: [-15.6, -19.6], r: [3.2, 4.2], deg: -20, color: tie });
        } else {
          back.push({ p: [[24, -30], [44, -20], [50, 0], [47, L * 0.5], [42, L * 0.85]], w: [16, 18, 16, 11, 0] });
          ties.push({ c: [27, -30], r: [5.4, 4.2], deg: 30, color: tie, slot: "hairBack" });
        }
        break;
      }
      case "twintails": {
        const L = H.levels[st.tailLength ?? "chest"];
        if (side) {
          back.push({ p: [[-17, -2], [-24, 6], [-26, L * 0.55], [-23, L * 0.85], [-18, L]], w: [11, 12, 11, 7, 0], swing: 1.4 });
          back.push({ p: [[16, -4], [22, 4], [23.6, L * 0.5], [21, L * 0.85]], w: [9, 10, 8, 0], swing: 1.2 });
          ties.push({ c: [-17.4, -2.4], r: [3.2, 3.6], color: tie });
        } else {
          for (const o of [-1, 1]) {
            back.push({ p: [[o * 37, -8], [o * 48, 2], [o * 52, L * 0.45], [o * 49, L * 0.8], [o * 43, L]], w: [16, 18, 16, 11, 0] });
            ties.push({ c: [o * 37, -8], r: [4.6, 5.4], color: tie });
          }
        }
        break;
      }
      case "buns":
        if (side) {
          front.push({ blob: [[-12, -32], [-4, -30.4], [-3, -23], [-10, -20], [-15.6, -25]] });
          front.push({ blob: [[6, -33], [14, -31], [15, -24], [8, -21.6], [3, -26]] });
        } else
          for (const o of [-1, 1])
            front.push({ blob: [[o * 14, -48 - v * 0.5], [o * 28, -50 - v * 0.5], [o * 36, -40], [o * 30, -30], [o * 16, -31]] });
        break;
      case "topknot":
        if (side) {
          front.push({ blob: [[-12, -30], [-4, -32], [0, -26], [-4, -21], [-11, -22]] });
          ties.push({ c: [-6.8, -21.6], r: [3.8, 1.8], deg: -15, color: tie });
        } else {
          front.push({ blob: [[-10, -50 - v], [0, -55 - v], [10, -50 - v], [9, -40 - v], [-9, -40 - v]] });
          ties.push({ c: [0, -39.4 - v], r: [8, 2.6], color: tie });
        }
        break;
      case "halfup":
        if (side) {
          back.push({ blob: [[-16, -24], [-9, -27], [-6, -21], [-11, -16], [-17, -18]] });
          ties.push({ c: [-12, -17.6], r: [3, 2.4], deg: -30, color: tie, slot: "hairBack" });
        } else {
          back.push({ blob: [[-10, -52 - v * 0.3], [10, -52 - v * 0.3], [12, -40], [-12, -40]] });
          ties.push({ c: [0, -44], r: [7, 2.4], color: tie, slot: "hairBack" });
        }
        break;
      case "braid": {
        const L = H.levels[st.tailLength ?? "chest"];
        const pts = side
          ? [[14, 2], [17, 12], [18.6, 22], [19, 32], [18, L * 0.95]]
          : [[30, 6], [36, 18], [39, 30], [40, 42], [38, L + 6]];
        for (let i = 0; i < pts.length; i++) {
          const [x, y] = pts[i];
          const r = (side ? 4.6 : 7.6) * (1 - i * 0.06);
          front.push({ blob: [[x - r, y], [x - r * 0.3, y - r * 0.9], [x + r, y - r * 0.2], [x + r * 0.4, y + r * 0.9]], braid: true });
        }
        const last = pts[pts.length - 1];
        ties.push({ c: [last[0], last[1] + (side ? 4 : 7)], r: side ? [3, 2] : [5, 3], color: tie });
        front.push({ p: [[last[0], last[1] + (side ? 5 : 8)], [last[0] + 1, last[1] + (side ? 11 : 18)]], w: side ? [6, 0] : [10, 0] });
        break;
      }
      case "quiff":
        if (side) front.push({ p: [[8, -10], [10, -22], [2, -30.6], [-8, -29], [-13, -24]], w: [11, 13, 11, 7, 0] });
        else {
          front.push({ blob: [[-24, -30], [-16, -46 - v], [2, -53 - v], [20, -48 - v], [27, -34], [8, -36], [-8, -34]] });
          front.push({ p: [[-4, -36], [6, -48 - v], [18, -46 - v]], w: [7, 6, 0] });
        }
        break;
      case "layers": {
        const pts = side
          ? [[[-19, -2], [-23, 8], [-21, 16]], [[-14, 6], [-17, 15], [-15, 22]], [[14, 4], [17.6, 13], [15.6, 20]]]
          : [[[-38, 0], [-45, 14], [-41, 27]], [[-31, 10], [-36, 24], [-32, 33]], [[38, 0], [45, 14], [41, 27]], [[31, 10], [36, 24], [32, 33]]];
        for (const p of pts) front.push({ p, w: side ? [8, 6, 0] : [14, 11, 0] });
        break;
      }
      case "spikes": {
        const R = rng(st.seed ?? 3);
        const n = side ? 7 : 9;
        for (let i = 0; i < n; i++) {
          const a = ((205 + (i * 130) / (n - 1)) * Math.PI) / 180;
          const r0 = side ? 16 : 30;
          const r1 = (side ? 24 + v : 46 + v) + R() * (side ? 4 : 7);
          const cx0 = side ? -1 : 0;
          const cy0 = side ? -4 : -6;
          const bend = side ? -2 : 0;
          front.push({
            p: [[cx0 + Math.cos(a) * r0, cy0 + Math.sin(a) * r0], [cx0 + Math.cos(a) * (r0 + r1) * 0.5 + bend, cy0 + Math.sin(a) * (r0 + r1) * 0.5], [cx0 + Math.cos(a + 0.12) * r1 + bend, cy0 + Math.sin(a + 0.12) * r1]],
            w: side ? [9, 7, 0] : [16, 12, 0],
          });
        }
        break;
      }
      case "fluffy": {
        // short tufts flicking outward around the crown
        const R = rng(st.seed ?? 9);
        const n = side ? 9 : 12;
        for (let i = 0; i < n; i++) {
          const a = ((195 + (i * 150) / (n - 1)) * Math.PI) / 180;
          const r0 = side ? 17 : 31;
          const r1 = (side ? 22.5 + v * 0.7 : 41 + v) + R() * (side ? 2 : 3.5);
          const cx0 = side ? -1.6 : 0;
          const cy0 = side ? -3 : -2;
          const a2 = a + (R() - 0.3) * 0.25;
          front.push({
            p: [[cx0 + Math.cos(a) * r0, cy0 + Math.sin(a) * r0], [cx0 + Math.cos(a2) * r1, cy0 + Math.sin(a2) * r1]],
            w: side ? [8, 0] : [14, 0],
          });
        }
        break;
      }
      case "curly": {
        const R = rng(st.seed ?? 11);
        const pts = capPoints(H, st);
        const dense = [];
        for (let i = 0; i < pts.length; i++) {
          const p0 = pts[i];
          const p1 = pts[(i + 1) % pts.length];
          dense.push(p0, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]);
        }
        for (const [x, y] of dense) {
          if (H.view === "side" ? y > 8 : y > 16) continue;
          const rr = (side ? 4 : 7) * (0.8 + R() * 0.45);
          const jx = (R() - 0.5) * (side ? 1.5 : 3);
          front.push({ blob: [[x + jx - rr, y], [x + jx, y - rr], [x + jx + rr, y], [x + jx, y + rr]], curl: true });
        }
        break;
      }
      default:
        break;
    }
  }
  return { front, back, ties };
}

/**
 * Draw a hairstyle. opts.hatted removes hair above the hat line so a hat can sit on it.
 */
export function drawHair(ctx, st, opts = {}) {
  const { S, L, P, HEAD: H } = ctx;
  const { cx, cy } = P.head;
  const side = H.view === "side";
  const sway = P.sway ?? 0;
  const swayX = (y, k = 1) => (side ? sway * Math.max(0, Math.min(1.3, (y - 10) / 40)) * k : 0);
  const A = (pts, k = 1) => pts.map(([x, y, c]) => (c ? [cx + x + swayX(y, k), cy + y, c] : [cx + x + swayX(y, k), cy + y]));
  const g = geo(H);
  const ex = extras(H, st);

  // ---- back mass (behind the body)
  const backParts = [];
  let bp = backPoints(H, st);
  if (bp) {
    if (st.wave) bp = waveOutline(bp, side ? 1.6 * st.wave : 2.8 * st.wave, side ? 14 : 20, side);
    const spines = side
      ? [[[-20, -4], [-23, 10], [-22, 24], [-24.6, 38]], [[-14, 2], [-17, 18], [-15, 32]], [[-6, 10], [-9, 26], [-6, 40]]]
      : [[[-40, 0], [-44, 20], [-42, 40]], [[40, 0], [44, 20], [42, 40]], [[-30, -20], [-38, 0]], [[30, -20], [38, 0]]];
    backParts.push({ mask: S.blob(A(bp)), shadow: side ? 4.2 : 6, spines: spines.map((s) => A(s, 1.2)) });
  }
  for (const c of [...curlClumps(H, st), ...ex.back]) {
    const m = c.blob ? S.blob(A(c.blob, c.swing ?? 1.2)) : S.taper(A(c.p, c.swing ?? 1.2), c.w);
    backParts.push({ mask: m, shadow: side ? 3 : 5 });
  }
  if (backParts.length) drawHairParts(L("hairBack"), backParts, { back: true });

  // ---- hair over the head
  const parts = [];
  const curly = (st.extras ?? []).includes("curly");
  const capMask = S.blob(A(capPoints(H, st), 0));
  parts.push({
    mask: capMask,
    shadow: side ? 3.6 : 6,
    rim: side ? 1.6 : 2.6,
    spines: (side
      ? [[[-8, -20], [-14, -14], [-18, -4]], [[-2, -22], [-8, -16], [-13, -8]], [[10, -20], [15, -14]]]
      : [[[-10, -34], [-24, -24], [-32, -10]], [[10, -34], [24, -24], [32, -10]], [[0, -36], [-4, -26]]]
    ).map((s) => A(s, 0)),
  });
  for (const c of ex.front.filter((c) => c.curl)) parts.push({ mask: S.blob(A(c.blob, 0)), shadow: side ? 2.4 : 4, rim: side ? 1 : 1.6 });
  for (const c of lockClumps(H, st)) parts.push({ mask: S.taper(A(c.p, 0.6), c.w), shadow: side ? 3 : 5 });
  for (const c of bangClumps(H, st)) parts.push({ mask: S.taper(A(c.p, 0.3), c.w), shadow: side ? 3 : 5, spine: A(c.spine, 0.3) });
  for (const c of ex.front.filter((c) => !c.curl)) {
    const m = c.blob ? S.blob(A(c.blob, 0)) : S.taper(A(c.p, 0.4), c.w);
    parts.push({ mask: m, shadow: side ? 2.6 : 4.4, rim: side ? 1 : 1.6 });
  }
  const bb = capMask.bbox();
  const shine = bb && !(st.extras ?? []).includes("buzz-texture")
    ? {
        c: [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2 + (bb.y1 - bb.y0) * 0.12],
        r: [((bb.x1 - bb.x0) / 2) * 0.74, ((bb.y1 - bb.y0) / 2) * 0.78],
        t: side ? 3.2 : 5,
        a: [208, 332],
      }
    : null;
  const front = L("hairFront");
  const union = drawHairParts(front, parts, { shine: st.length === "buzz" ? null : shine });
  if (st.length === "buzz" && union) {
    // stubble texture
    const R = rng(5);
    union.shrink(1).forEach((x, y) => {
      if (R() < 0.18) front.set(x, y, "hair.2");
    });
  }
  if (curly && union) {
    const R = rng(13);
    union.shrink(2).forEach((x, y) => {
      if (R() < 0.05) {
        front.set(x, y, "hair.2");
        front.set(x + 1, y - 1, "hair.2");
        front.set(x + 2, y - 1, "hair.4");
      }
    });
  }
  for (const t of ex.ties) {
    const m = S.oval(cx + t.c[0], cy + t.c[1], t.r[0], t.r[1], t.deg ?? 0);
    const sp = L(t.slot ?? "hairFront");
    sp.fill(m, t.color).fill(m.edge(), "#3a2420");
    sp.fill(S.oval(cx + t.c[0] - t.r[0] * 0.3, cy + t.c[1] - t.r[1] * 0.3, t.r[0] * 0.35, t.r[1] * 0.3, t.deg ?? 0), "#ffffff60");
  }

  // ---- brows (under the fringe) + fringe shadow on the face
  const shade = L("hairShade");
  if (side) {
    for (const [x, y] of [[-8, -6], [-7, -7], [-6, -7], [-5, -7], [-4, -7], [-3, -6], [6, -7], [7, -7], [8, -7], [9, -6]])
      shade.set(cx + x, cy + y, "hair.1");
  } else {
    for (const o of [-1, 1])
      shade.fill(S.taper([[-5, 1.2], [0, -0.6], [5, 0.6]].map(([x, y]) => [cx + o * 16.6 + x * o, cy - 6 + y]), [1.6, 2, 1.4]), "hair.1");
  }
  if (union) fringeShadow(shade, union, ctx.body.headMask(S, P), cy + (side ? 10 : 16), side ? 3 : 4);

  if (opts.hatted) {
    const y0 = cy + H.hatLine;
    for (const slot of ["hairFront", "hairBack", "hairShade"]) {
      const sp = ctx.layers[slot];
      if (!sp) continue;
      for (let y = 0; y < Math.min(sp.h, y0); y++) for (let x = 0; x < sp.w; x++) sp.set(x, y, null);
    }
  }
  void g;
}

// ------------------------------------------------------------- catalogue ----
export const HAIR_STYLES = {
  girl: [
    { id: "waves", name: "Soft Waves", color: "espresso", vol: 1.2, sides: "covered", length: "chest", wave: 1, locks: "chest", bangs: { type: "swept", depth: 1.05, part: -0.5 } },
    { id: "straight", name: "Long & Straight", color: "black", vol: 0.8, sides: "covered", length: "waist", locks: "chin", bangs: { type: "straight", depth: 1 } },
    { id: "ponytail", name: "High Ponytail", color: "chestnut", vol: 0.7, sides: "tucked", length: "ear", extras: ["ponytail"], tie: "#e0a0a8", bangs: { type: "swept", depth: 0.95, part: -0.6 } },
    { id: "buns", name: "Space Buns", color: "espresso", vol: 0.7, sides: "tucked", length: "ear", extras: ["buns"], bangs: { type: "straight", depth: 0.85, count: 6 } },
    { id: "bob", name: "Classic Bob", color: "black", vol: 1.1, sides: "covered", length: "chin", locks: "chin", bangs: { type: "straight", depth: 1.05 } },
    { id: "braid", name: "Side Braid", color: "honey", vol: 0.8, sides: "covered", length: "shoulder", extras: ["braid"], tie: "#7a9a6a", bangs: { type: "swept", depth: 0.9, part: -0.6 } },
    { id: "pixie", name: "Pixie Cut", color: "chestnut", vol: 0.6, sides: "tucked", length: "ear", bangs: { type: "swept", depth: 0.8, part: -0.7, count: 5 } },
    { id: "curls", name: "Cloud Curls", color: "cocoa", vol: 1.8, sides: "covered", length: "shoulder", extras: ["curly"], locks: "chin", bangs: { type: "messy", depth: 0.75 } },
    { id: "twintails", name: "Twin Tails", color: "espresso", vol: 0.8, sides: "tucked", length: "ear", extras: ["twintails"], tie: "#d9534f", bangs: { type: "straight", depth: 0.95 } },
    { id: "halfup", name: "Half-Up Bun", color: "ginger", vol: 1, sides: "covered", length: "chest", wave: 0.6, extras: ["halfup"], locks: "shoulder", bangs: { type: "curtain", depth: 1 } },
  ],
  boy: [
    { id: "sweep", name: "Side Sweep", color: "espresso", vol: 0.8, sides: "tucked", length: "ear", bangs: { type: "swept", depth: 0.85, part: -0.6, count: 4 } },
    { id: "spiky", name: "Spiky", color: "black", vol: 0.9, sides: "tucked", length: "ear", extras: ["spikes"], bangs: { type: "spiky", depth: 0.75 } },
    { id: "mop", name: "Fluffy Mop", color: "chestnut", vol: 1.3, sides: "covered", length: "ear", extras: ["fluffy"], bangs: { type: "messy", depth: 1.05, count: 6 } },
    { id: "buzz", name: "Buzz Cut", color: "black", vol: 0.15, sides: "tucked", length: "buzz", bangs: { type: "none" } },
    { id: "curtains", name: "Curtain Bangs", color: "espresso", vol: 0.9, sides: "covered", length: "ear", bangs: { type: "curtain", depth: 1, count: 6 } },
    { id: "curls", name: "Short Curls", color: "cocoa", vol: 1.2, sides: "tucked", length: "ear", extras: ["curly"], bangs: { type: "messy", depth: 0.55 } },
    { id: "quiff", name: "Quiff", color: "chestnut", vol: 0.6, sides: "tucked", length: "ear", extras: ["quiff"], bangs: { type: "none" } },
    { id: "wolf", name: "Wolf Cut", color: "ash", vol: 1, sides: "covered", length: "ear", extras: ["layers", "fluffy"], bangs: { type: "messy", depth: 1, count: 6 } },
    { id: "topknot", name: "Top Knot", color: "black", vol: 0.5, sides: "tucked", length: "ear", extras: ["topknot"], tie: "#3a2a24", bangs: { type: "swept", depth: 0.55, part: -0.3, count: 4 } },
    { id: "waves", name: "Surfer Waves", color: "honey", vol: 1.1, sides: "covered", length: "chin", wave: 0.7, locks: "chin", bangs: { type: "curtain", depth: 0.95, count: 6 } },
  ],
};
