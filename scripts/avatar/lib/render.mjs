// RGBA images, PNG output, previews and trimmed/deduplicated sprite atlases.
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { encodePng } from "./png.mjs";
import { resolveKey, DEFAULTS } from "./palettes.mjs";

const rgbaCache = new Map();
export function keyToRgba(key, choice = DEFAULTS) {
  const id = `${key}|${choice.skin}|${choice.hair}|${choice.eyes}`;
  let v = rgbaCache.get(id);
  if (!v) {
    const hex = resolveKey(key, choice).replace("#", "");
    v = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    v.push(hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255);
    rgbaCache.set(id, v);
  }
  return v;
}

export class Image {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8Array(w * h * 4);
  }
  fillRect(x0, y0, w, h, rgba) {
    for (let y = Math.max(0, y0); y < Math.min(this.h, y0 + h); y++)
      for (let x = Math.max(0, x0); x < Math.min(this.w, x0 + w); x++) this.d.set(rgba, (y * this.w + x) * 4);
  }
  blend(i, r, g, b, a) {
    const d = this.d;
    if (a === 255 || d[i + 3] === 0) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = a === 255 ? 255 : Math.max(a, d[i + 3]);
      return;
    }
    const fa = a / 255;
    const da = d[i + 3] / 255;
    const oa = fa + da * (1 - fa);
    d[i] = Math.round((r * fa + d[i] * da * (1 - fa)) / oa);
    d[i + 1] = Math.round((g * fa + d[i + 1] * da * (1 - fa)) / oa);
    d[i + 2] = Math.round((b * fa + d[i + 2] * da * (1 - fa)) / oa);
    d[i + 3] = Math.round(oa * 255);
  }
  drawSprite(sprite, ox = 0, oy = 0, choice = DEFAULTS) {
    for (let y = 0; y < sprite.h; y++)
      for (let x = 0; x < sprite.w; x++) {
        const key = sprite.p[y * sprite.w + x];
        if (key === null) continue;
        const px = ox + x;
        const py = oy + y;
        if (px < 0 || py < 0 || px >= this.w || py >= this.h) continue;
        const [r, g, b, a] = keyToRgba(key, choice);
        this.blend((py * this.w + px) * 4, r, g, b, a);
      }
  }
  drawImage(img, ox = 0, oy = 0, scale = 1, sx = 0, sy = 0, sw = img.w, sh = img.h) {
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++) {
        const i = ((sy + y) * img.w + sx + x) * 4;
        const a = img.d[i + 3];
        if (!a) continue;
        for (let yy = 0; yy < scale; yy++)
          for (let xx = 0; xx < scale; xx++) {
            const px = ox + x * scale + xx;
            const py = oy + y * scale + yy;
            if (px < 0 || py < 0 || px >= this.w || py >= this.h) continue;
            this.blend((py * this.w + px) * 4, img.d[i], img.d[i + 1], img.d[i + 2], a);
          }
      }
  }
  /** Bounding box of non-transparent pixels. */
  bbox() {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.d[(y * this.w + x) * 4 + 3]) {
          if (x < x0) x0 = x;
          if (y < y0) y0 = y;
          if (x > x1) x1 = x;
          if (y > y1) y1 = y;
        }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }
  crop(x0, y0, w, h) {
    const out = new Image(w, h);
    for (let y = 0; y < h; y++) out.d.set(this.d.subarray(((y0 + y) * this.w + x0) * 4, ((y0 + y) * this.w + x0 + w) * 4), y * w * 4);
    return out;
  }
  png() {
    return encodePng(this.w, this.h, this.d);
  }
  save(path) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, this.png());
  }
}

export function spriteToImage(sprite, choice = DEFAULTS) {
  const img = new Image(sprite.w, sprite.h);
  img.drawSprite(sprite, 0, 0, choice);
  return img;
}

/** Collects trimmed, de-duplicated cells and packs them into one atlas. */
export class AtlasBuilder {
  constructor(maxWidth = 1024) {
    this.maxWidth = maxWidth;
    this.cells = [];
    this.index = new Map();
  }
  /** Returns [cell, dx, dy] for a frame-sized image, or null when empty. */
  add(img) {
    const bb = img.bbox();
    if (!bb) return null;
    const w = bb.x1 - bb.x0 + 1;
    const h = bb.y1 - bb.y0 + 1;
    const cell = img.crop(bb.x0, bb.y0, w, h);
    const hash = createHash("sha1").update(cell.d).update(`${w}x${h}`).digest("hex");
    let id = this.index.get(hash);
    if (id === undefined) {
      id = this.cells.length;
      this.cells.push(cell);
      this.index.set(hash, id);
    }
    return [id, bb.x0, bb.y0];
  }
  /** Shelf packing; returns { image, rects: [[x, y, w, h], ...] }. */
  pack() {
    const order = this.cells.map((c, i) => i).sort((a, b) => this.cells[b].h - this.cells[a].h);
    const rects = new Array(this.cells.length);
    let x = 0;
    let y = 0;
    let shelf = 0;
    let width = 0;
    for (const i of order) {
      const c = this.cells[i];
      if (x + c.w > this.maxWidth) {
        x = 0;
        y += shelf + 1;
        shelf = 0;
      }
      rects[i] = [x, y, c.w, c.h];
      x += c.w + 1;
      shelf = Math.max(shelf, c.h);
      width = Math.max(width, x);
    }
    const height = y + shelf;
    const image = new Image(Math.max(1, width), Math.max(1, height));
    this.cells.forEach((c, i) => image.drawImage(c, rects[i][0], rects[i][1]));
    return { image, rects };
  }
}

function hexRgba(h) {
  const v = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)).concat(255);
}

/** Grid preview of RGBA images. rows: Image[][] */
export function writeGrid(path, rows, opts = {}) {
  const { scale = 1, bg = null, gap = 0 } = opts;
  const cells = rows.flat().filter(Boolean);
  const cw = Math.max(...cells.map((c) => c.w));
  const ch = Math.max(...cells.map((c) => c.h));
  const cols = Math.max(...rows.map((r) => r.length));
  const W = cols * (cw * scale + gap) + gap;
  const H = rows.length * (ch * scale + gap) + gap;
  const out = new Image(W, H);
  if (bg) out.fillRect(0, 0, W, H, hexRgba(bg));
  rows.forEach((row, ry) =>
    row.forEach((img, cx) => {
      if (img) out.drawImage(img, gap + cx * (cw * scale + gap), gap + ry * (ch * scale + gap), scale);
    }),
  );
  out.save(path);
  return out;
}
