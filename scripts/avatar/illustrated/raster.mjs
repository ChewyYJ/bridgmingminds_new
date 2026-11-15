import { readFileSync } from 'node:fs';
import pngjs from 'pngjs';
import { Image } from '../lib/render.mjs';

export function decodePng(path) {
  const decoded = pngjs.PNG.sync.read(readFileSync(path));
  const result = new Image(decoded.width, decoded.height);
  result.d.set(decoded.data);
  for (let i = 0; i < result.d.length; i += 4) {
    const alpha = result.d[i + 3];
    if (alpha < 24) result.d.fill(0, i, i + 4);
    else if (alpha >= 245) result.d[i + 3] = 255;
  }
  return result;
}

export function crop(source, x, y, w, h) {
  const out = new Image(w, h);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const sx = x + xx, sy = y + yy;
    if (sx >= 0 && sy >= 0 && sx < source.w && sy < source.h)
      out.d.set(source.d.subarray((sy * source.w + sx) * 4, (sy * source.w + sx) * 4 + 4), (yy * w + xx) * 4);
  }
  return out;
}

export function masked(source, predicate) {
  const result = new Image(source.w, source.h);
  for (let y = 0; y < source.h; y++) for (let x = 0; x < source.w; x++) {
    const i = (y * source.w + x) * 4;
    if (source.d[i + 3] && predicate(x, y)) result.d.set(source.d.subarray(i, i + 4), i);
  }
  return result;
}

export function trim(source) {
  const box = source.bbox();
  return box ? crop(source, box.x0, box.y0, box.x1 - box.x0 + 1, box.y1 - box.y0 + 1) : new Image(1, 1);
}

export function largestComponent(source) {
  const seen = new Uint8Array(source.w * source.h);
  let largest = [];
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || !source.d[start * 4 + 3]) continue;
    const component = [start];
    seen[start] = 1;
    for (let at = 0; at < component.length; at++) {
      const point = component[at], x = point % source.w, y = Math.floor(point / source.w);
      for (let yy = Math.max(0, y - 1); yy <= Math.min(source.h - 1, y + 1); yy++)
        for (let xx = Math.max(0, x - 1); xx <= Math.min(source.w - 1, x + 1); xx++) {
          const index = yy * source.w + xx;
          if (!seen[index] && source.d[index * 4 + 3]) { seen[index] = 1; component.push(index); }
        }
    }
    if (component.length > largest.length) largest = component;
  }
  const result = new Image(source.w, source.h);
  for (const index of largest) result.d.set(source.d.subarray(index * 4, index * 4 + 4), index * 4);
  return result;
}

/** Smooth inverse affine sampling, interpolating premultiplied RGBA. */
export function affine(target, source, { x = 0, y = 0, width = source.w, height = source.h,
  angle = 0, anchorX = 0.5, anchorY = 0, opacity = 1 } = {}) {
  const sx = width / source.w, sy = height / source.h;
  const radians = angle * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
  const ox = width * anchorX, oy = height * anchorY;
  const forward = (u, v) => [x + ox + c * (u - ox) - s * (v - oy), y + oy + s * (u - ox) + c * (v - oy)];
  const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([u, v]) => forward(u, v));
  const left = Math.max(0, Math.floor(Math.min(...corners.map(p => p[0]))) - 1);
  const top = Math.max(0, Math.floor(Math.min(...corners.map(p => p[1]))) - 1);
  const right = Math.min(target.w, Math.ceil(Math.max(...corners.map(p => p[0]))) + 1);
  const bottom = Math.min(target.h, Math.ceil(Math.max(...corners.map(p => p[1]))) + 1);
  for (let dy = top; dy < bottom; dy++) for (let dx = left; dx < right; dx++) {
    const tx = dx + 0.5 - x - ox, ty = dy + 0.5 - y - oy;
    const u = (c * tx + s * ty + ox) / sx - 0.5;
    const v = (-s * tx + c * ty + oy) / sy - 0.5;
    const ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
    let alpha = 0, red = 0, green = 0, blue = 0;
    for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) {
      const px = ix + xx, py = iy + yy;
      if (px < 0 || py < 0 || px >= source.w || py >= source.h) continue;
      const i = (py * source.w + px) * 4;
      const weight = (xx ? fx : 1 - fx) * (yy ? fy : 1 - fy);
      const a = source.d[i + 3] * weight;
      alpha += a;
      red += source.d[i] * a; green += source.d[i + 1] * a; blue += source.d[i + 2] * a;
    }
    if (alpha > 0.1) target.blend((dy * target.w + dx) * 4,
      Math.round(red / alpha), Math.round(green / alpha), Math.round(blue / alpha), Math.round(alpha * opacity));
  }
  return target;
}

export function recolor(source, targetHex, kind) {
  if (!targetHex) return source;
  const target = [1, 3, 5].map(i => parseInt(targetHex.slice(i, i + 2), 16));
  const out = new Image(source.w, source.h);
  out.d.set(source.d);
  const base = kind === 'skin' ? [249, 209, 183] : [112, 83, 66];
  for (let i = 0; i < out.d.length; i += 4) {
    if (!out.d[i + 3]) continue;
    const [r, g, b] = source.d.subarray(i, i + 3);
    if (kind === 'skin' && (r < 90 || r < g * 1.04 || b > r * 0.94)) continue;
    for (let channel = 0; channel < 3; channel++) {
      const value = source.d[i + channel];
      const ratio = value / base[channel];
      out.d[i + channel] = Math.round(Math.max(0, Math.min(255,
        ratio <= 1 ? target[channel] * ratio : target[channel] + (255 - target[channel]) * Math.min(1, (value - base[channel]) / (255 - base[channel])))));
    }
  }
  return out;
}

/** Compile all pieces on a common pixel grid so their edges meet after posing.
 * Sampling is alpha-weighted; transparent space never adds a dark halo. */
export function pixelFinish(source, size = 3) {
  if (size <= 1) return source;
  const out = new Image(source.w, source.h);
  for (let y = 0; y < source.h; y += size) for (let x = 0; x < source.w; x += size) {
    let alpha = 0, red = 0, green = 0, blue = 0, count = 0;
    for (let dy = 0; dy < size && y + dy < source.h; dy++)
      for (let dx = 0; dx < size && x + dx < source.w; dx++) {
        const at = ((y + dy) * source.w + x + dx) * 4;
        const a = source.d[at + 3];
        alpha += a; red += source.d[at] * a; green += source.d[at + 1] * a; blue += source.d[at + 2] * a; count++;
      }
    if (alpha < count * 70) continue;
    const channel = value => Math.min(255, Math.round(value / alpha / 4) * 4);
    const rgba = [channel(red), channel(green), channel(blue), 255];
    out.fillRect(x, y, Math.min(size, source.w - x), Math.min(size, source.h - y), rgba);
  }
  return out;
}

export const PIXEL_HEAD_SLOTS = ['head', 'face', 'hairBack', 'hairFront', 'hat', 'accFace', 'accHead', 'accBack'];
export function finishAvatarLayer(image, style, slot) {
  return pixelFinish(image, style === 'chibi' ? 3 : PIXEL_HEAD_SLOTS.includes(slot) ? 2 : 1);
}
