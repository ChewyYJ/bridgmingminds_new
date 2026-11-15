// Pixel canvas primitives: masks (shapes), sprites (colour keys), splines,
// cel shading and selective outlines. Pixel (x, y) has its centre at
// (x + 0.5, y + 0.5) when testing geometric shapes.

export class Mask {
  constructor(w, h, a) {
    this.w = w;
    this.h = h;
    this.a = a ?? new Uint8Array(w * h);
  }
  has(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.a[y * this.w + x] === 1;
  }
  add(x, y) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.a[y * this.w + x] = 1;
    return this;
  }
  del(x, y) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.a[y * this.w + x] = 0;
    return this;
  }
  clone() {
    return new Mask(this.w, this.h, this.a.slice());
  }
  or(...others) {
    const m = this.clone();
    for (const o of others) if (o) for (let i = 0; i < m.a.length; i++) m.a[i] |= o.a[i];
    return m;
  }
  and(o) {
    const m = this.clone();
    for (let i = 0; i < m.a.length; i++) m.a[i] &= o.a[i];
    return m;
  }
  minus(...others) {
    const m = this.clone();
    for (const o of others) if (o) for (let i = 0; i < m.a.length; i++) if (o.a[i]) m.a[i] = 0;
    return m;
  }
  shift(dx, dy) {
    dx = Math.round(dx);
    dy = Math.round(dy);
    const m = new Mask(this.w, this.h);
    this.forEach((x, y) => m.add(x + dx, y + dy));
    return m;
  }
  flipX(axis) {
    const m = new Mask(this.w, this.h);
    this.forEach((x, y) => m.add(Math.round(2 * axis - x - 1), y));
    return m;
  }
  filter(fn) {
    const m = new Mask(this.w, this.h);
    this.forEach((x, y) => {
      if (fn(x, y)) m.add(x, y);
    });
    return m;
  }
  forEach(fn) {
    const { w, h, a } = this;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a[y * w + x]) fn(x, y);
  }
  count() {
    let n = 0;
    for (const v of this.a) n += v;
    return n;
  }
  empty() {
    for (const v of this.a) if (v) return false;
    return true;
  }
  bbox() {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    this.forEach((x, y) => {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    });
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }
  rowSpan(y) {
    let a = -1;
    let b = -1;
    for (let x = 0; x < this.w; x++)
      if (this.a[y * this.w + x]) {
        if (a < 0) a = x;
        b = x;
      }
    return a < 0 ? null : [a, b];
  }
  colSpan(x) {
    let a = -1;
    let b = -1;
    for (let y = 0; y < this.h; y++)
      if (this.a[y * this.w + x]) {
        if (a < 0) a = y;
        b = y;
      }
    return a < 0 ? null : [a, b];
  }
  /** 4-neighbour dilation. */
  grow(n = 1) {
    let m = this.clone();
    for (let i = 0; i < n; i++) {
      const next = m.clone();
      m.forEach((x, y) => {
        next.add(x + 1, y).add(x - 1, y).add(x, y + 1).add(x, y - 1);
      });
      m = next;
    }
    return m;
  }
  shrink(n = 1) {
    let m = this.clone();
    for (let i = 0; i < n; i++) {
      const p = m;
      m = p.filter((x, y) => p.has(x + 1, y) && p.has(x - 1, y) && p.has(x, y + 1) && p.has(x, y - 1));
    }
    return m;
  }
  /** Inner boundary pixels; neighbours inside `join` do not count as outside. */
  edge(join, eight = false) {
    const out = (x, y) => !this.has(x, y) && !(join && join.has(x, y));
    return this.filter(
      (x, y) =>
        out(x + 1, y) ||
        out(x - 1, y) ||
        out(x, y + 1) ||
        out(x, y - 1) ||
        (eight && (out(x + 1, y + 1) || out(x - 1, y - 1) || out(x + 1, y - 1) || out(x - 1, y + 1))),
    );
  }
  above(y0) {
    return this.filter((x, y) => y < y0);
  }
  below(y0) {
    return this.filter((x, y) => y >= y0);
  }
}

export class Shapes {
  constructor(w, h) {
    this.w = w;
    this.h = h;
  }
  empty() {
    return new Mask(this.w, this.h);
  }
  /** fn(px, py, x, y) per pixel centre; bb limits the scan for speed. */
  test(fn, bb) {
    const m = this.empty();
    const x0 = bb ? Math.max(0, Math.floor(bb[0]) - 1) : 0;
    const y0 = bb ? Math.max(0, Math.floor(bb[1]) - 1) : 0;
    const x1 = bb ? Math.min(this.w - 1, Math.ceil(bb[2]) + 1) : this.w - 1;
    const y1 = bb ? Math.min(this.h - 1, Math.ceil(bb[3]) + 1) : this.h - 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (fn(x + 0.5, y + 0.5, x, y)) m.add(x, y);
    return m;
  }
  rect(x, y, w, h) {
    const m = this.empty();
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++)
      for (let xx = Math.round(x); xx < Math.round(x + w); xx++) m.add(xx, yy);
    return m;
  }
  ellipse(cx, cy, rx, ry = rx) {
    return this.test((px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1, [cx - rx, cy - ry, cx + rx, cy + ry]);
  }
  /** Rotated ellipse (deg). */
  oval(cx, cy, rx, ry, deg = 0) {
    const r = (deg * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const m = Math.max(rx, ry);
    return this.test(
      (px, py) => {
        const dx = px - cx;
        const dy = py - cy;
        const u = dx * c + dy * s;
        const v = -dx * s + dy * c;
        return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
      },
      [cx - m, cy - m, cx + m, cy + m],
    );
  }
  /** Non-zero winding polygon fill. points: [[x, y], ...] */
  poly(points) {
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    for (const [x, y] of points) {
      if (x < bx0) bx0 = x;
      if (y < by0) by0 = y;
      if (x > bx1) bx1 = x;
      if (y > by1) by1 = y;
    }
    const n = points.length;
    return this.test(
      (px, py) => {
        let wn = 0;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const xj = points[j][0];
          const yj = points[j][1];
          const xi = points[i][0];
          const yi = points[i][1];
          if (yj <= py) {
            if (yi > py && (xi - xj) * (py - yj) - (px - xj) * (yi - yj) > 0) wn++;
          } else if (yi <= py && (xi - xj) * (py - yj) - (px - xj) * (yi - yj) < 0) wn--;
        }
        return wn !== 0;
      },
      [bx0, by0, bx1, by1],
    );
  }
  /** Smooth closed shape through control points ([x, y, 1] marks a corner). */
  blob(points, samples = 8) {
    return this.poly(spline(points, true, samples));
  }
  /** Smooth open stroke with per-point widths (0 = pointed tip). */
  taper(points, widths, samples = 8) {
    return this.poly(taperPoly(points, widths, samples));
  }
  /** Limb: tapered stroke with rounded ends. */
  limb(points, widths, samples = 8) {
    const a = points[0];
    const b = points[points.length - 1];
    const wa = widths[0] / 2;
    const wb = widths[widths.length - 1] / 2;
    return this.taper(points, widths, samples).or(this.ellipse(a[0], a[1], wa, wa)).or(this.ellipse(b[0], b[1], wb, wb));
  }
  capsule(ax, ay, bx, by, ra, rb = ra) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-6;
    const r = Math.max(ra, rb);
    return this.test(
      (px, py) => {
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const rr = ra + (rb - ra) * t;
        return (px - (ax + dx * t)) ** 2 + (py - (ay + dy * t)) ** 2 <= rr * rr;
      },
      [Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r],
    );
  }
  line(x0, y0, x1, y1) {
    const m = this.empty();
    for (const [x, y] of bresenham(x0, y0, x1, y1)) m.add(x, y);
    return m;
  }
  /** 1px curve through control points. */
  curve(points, samples = 10) {
    const m = this.empty();
    const pts = splinePoints(points, samples);
    for (let i = 0; i < pts.length - 1; i++)
      for (const [x, y] of bresenham(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])) m.add(x, y);
    return m;
  }
}

export function bresenham(x0, y0, x1, y1) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const pts = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return pts;
}

/** A sprite stores colour keys ("#rrggbb", "#rrggbbaa" or palette refs like "skin.3"). */
export class Sprite {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.p = new Array(w * h).fill(null);
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.p[y * this.w + x] : null;
  }
  set(x, y, c) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = c;
  }
  fill(mask, color) {
    mask.forEach((x, y) => this.set(x, y, color));
    return this;
  }
  draw(other, dx = 0, dy = 0) {
    for (let y = 0; y < other.h; y++)
      for (let x = 0; x < other.w; x++) {
        const c = other.p[y * other.w + x];
        if (c !== null) this.set(x + dx, y + dy, c);
      }
    return this;
  }
  erase(mask) {
    mask.forEach((x, y) => this.set(x, y, null));
    return this;
  }
  mask() {
    const m = new Mask(this.w, this.h);
    for (let i = 0; i < this.p.length; i++) if (this.p[i] !== null) m.a[i] = 1;
    return m;
  }
  clone() {
    const s = new Sprite(this.w, this.h);
    s.p = this.p.slice();
    return s;
  }
  empty() {
    return this.p.every((c) => c === null);
  }
  /** Stamp ASCII art; legend maps chars to colours. */
  stamp(x0, y0, lines, legend, flip = false) {
    lines.forEach((line, y) =>
      [...line].forEach((ch, i) => {
        if (!(ch in legend)) return;
        const x = flip ? line.length - 1 - i : i;
        this.set(x0 + x, y0 + y, legend[ch]);
      }),
    );
    return this;
  }
}

// ------------------------------------------------------------ splines ----

/** Catmull-Rom spline. Points may carry a third value 1 to mark a sharp corner. */
export function spline(points, closed = true, samples = 8) {
  const pts = [];
  for (const p of points) {
    pts.push([p[0], p[1]]);
    if (p[2]) pts.push([p[0], p[1]]);
  }
  const n = pts.length;
  const get = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const out = [];
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    for (let k = 0; k < samples; k++) {
      const t = k / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

/** Outline polygon of a stroke along an open spline with varying width. */
export function taperPoly(points, widths, samples = 8) {
  const line = spline(points, false, samples);
  const ws = [];
  for (let i = 0; i < points.length - 1; i++)
    for (let k = 0; k < samples; k++) ws.push(widths[i] + ((widths[i + 1] - widths[i]) * k) / samples);
  ws.push(widths[widths.length - 1]);
  const left = [];
  const right = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const w = (ws[i] ?? 0) / 2;
    left.push([line[i][0] - dy * w, line[i][1] + dx * w]);
    right.push([line[i][0] + dy * w, line[i][1] - dx * w]);
  }
  return [...left, ...right.reverse()];
}

/** Integer pixel points along an open spline. */
export function splinePoints(points, samples = 8) {
  return spline(points, false, samples).map(([x, y]) => [Math.floor(x), Math.floor(y)]);
}

// ------------------------------------------------------------ shading ----

/** Pixels of mask left uncovered when the mask is shifted by (dx, dy). */
export function crescent(mask, dx, dy) {
  return mask.minus(mask.shift(dx, dy));
}

/**
 * Cel shading: base, lit rim, shadow band, optional deep band and extra regions,
 * then an inner outline. light points TOWARD the light (default top-left).
 */
export function cel(sprite, mask, rampColors, opts = {}) {
  const [lx, ly] = opts.light ?? [-0.55, -0.85];
  const edge = opts.noOutline ? new Mask(mask.w, mask.h) : mask.edge(opts.join, opts.edgeEight);
  const inner = mask.minus(edge);
  const tone = new Int8Array(mask.w * mask.h).fill(-1);
  inner.forEach((x, y) => (tone[y * mask.w + x] = opts.base ?? 3));
  const apply = (m, t) =>
    m.forEach((x, y) => {
      const i = y * mask.w + x;
      if (tone[i] >= 0) tone[i] = t;
    });
  if (opts.rim) apply(crescent(mask, -lx * opts.rim, -ly * opts.rim), 4);
  if (opts.shadow) apply(crescent(mask, lx * opts.shadow, ly * opts.shadow), 2);
  if (opts.deep) apply(crescent(mask, lx * opts.deep, ly * opts.deep), 1);
  for (const r of opts.regions ?? []) if (r.mask) apply(r.mask, r.tone);
  for (let i = 0; i < tone.length; i++) if (tone[i] >= 0) sprite.p[i] = rampColors[tone[i]];
  const ot = opts.outlineTone ?? 0;
  edge.forEach((x, y) => sprite.set(x, y, rampColors[typeof ot === "function" ? ot(x, y) : ot]));
  return { edge, inner };
}

/** Recolour outline pixels that sit inside the sprite's silhouette to a softer tone. */
export function softenInterior(sprite, rampColors, from = 0, to = 1) {
  const src = rampColors[from];
  const dst = rampColors[to];
  const solid = sprite.mask();
  const changes = [];
  solid.forEach((x, y) => {
    if (sprite.get(x, y) !== src) return;
    if (solid.has(x + 1, y) && solid.has(x - 1, y) && solid.has(x, y + 1) && solid.has(x, y - 1)) changes.push([x, y]);
  });
  for (const [x, y] of changes) sprite.set(x, y, dst);
}

/** Paint a 1px line through points, optionally clipped to a mask. */
export function strokeLine(sprite, pts, color, clip) {
  for (let i = 0; i < pts.length - 1; i++)
    for (const [x, y] of bresenham(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]))
      if (!clip || clip.has(x, y)) sprite.set(x, y, color);
}

/** Simple seeded random for repeatable "hand-made" variation. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}
