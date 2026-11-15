// Small, dependency-free animated GIF writer for generated artwork previews.
// The production renderer uses the lossless PNG atlases, not these previews.
import { writeFileSync } from 'node:fs';

function word(value) { const bytes = Buffer.alloc(2); bytes.writeUInt16LE(value); return bytes; }
function blocks(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const part = bytes.subarray(i, i + 255);
    parts.push(Buffer.from([part.length]), part);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

// Frequent clear codes keep this deliberately simple literal encoder at 9 bits.
// This trades file size for a tiny deterministic writer without dependencies.
function lzw(indices) {
  const bytes = [];
  let accumulator = 0, bits = 0;
  function code(value) {
    accumulator |= value << bits;
    bits += 9;
    while (bits >= 8) { bytes.push(accumulator & 255); accumulator >>>= 8; bits -= 8; }
  }
  for (let i = 0; i < indices.length; i += 240) {
    code(256);
    for (let j = i; j < Math.min(i + 240, indices.length); j++) code(indices[j]);
  }
  code(257);
  if (bits) bytes.push(accumulator & 255);
  return Buffer.from(bytes);
}

export function writeGif(path, frames, delays) {
  const { w, h } = frames[0];
  const frequencies = new Map();
  for (const frame of frames) {
    if (frame.w !== w || frame.h !== h) throw new Error('GIF frame size mismatch');
    for (let i = 0; i < frame.d.length; i += 4) {
      const color = (frame.d[i] << 16) | (frame.d[i + 1] << 8) | frame.d[i + 2];
      frequencies.set(color, (frequencies.get(color) ?? 0) + 1);
    }
  }
  const colors = [...frequencies].sort((a, b) => b[1] - a[1]).slice(0, 256).map(([color]) => color);
  const palette = Buffer.alloc(768);
  colors.forEach((color, i) => { palette[i * 3] = color >>> 16; palette[i * 3 + 1] = (color >>> 8) & 255; palette[i * 3 + 2] = color & 255; });
  const lookup = new Map(colors.map((color, i) => [color, i]));
  for (const color of frequencies.keys()) {
    if (lookup.has(color)) continue;
    let best = 0, distance = Infinity;
    for (let i = 0; i < colors.length; i++) {
      const dr = (color >>> 16) - palette[i * 3];
      const dg = ((color >>> 8) & 255) - palette[i * 3 + 1];
      const db = (color & 255) - palette[i * 3 + 2];
      const d = dr * dr + dg * dg + db * db;
      if (d < distance) { distance = d; best = i; }
    }
    lookup.set(color, best);
  }
  const chunks = [Buffer.from('GIF89a'), word(w), word(h), Buffer.from([0xf7, 0, 0]), palette,
    Buffer.from([0x21, 0xff, 11]), Buffer.from('NETSCAPE2.0'), Buffer.from([3, 1, 0, 0, 0])];
  frames.forEach((frame, index) => {
    const pixels = new Uint8Array(w * h);
    for (let i = 0; i < pixels.length; i++) pixels[i] = lookup.get((frame.d[i * 4] << 16) | (frame.d[i * 4 + 1] << 8) | frame.d[i * 4 + 2]);
    chunks.push(Buffer.from([0x21, 0xf9, 4, 4]), word(Math.max(2, delays[index])), Buffer.from([0, 0]),
      Buffer.from([0x2c]), word(0), word(0), word(w), word(h), Buffer.from([0, 8]), blocks(lzw(pixels)));
  });
  chunks.push(Buffer.from([0x3b]));
  writeFileSync(path, Buffer.concat(chunks));
}
