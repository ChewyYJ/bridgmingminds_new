#!/usr/bin/env node
// Compiles the existing code-native pixel artwork into independently wearable
// transparent PNG layers. No source mock is cut up or overwritten by this build.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import * as big from './styles/big.mjs';
import * as chibi from './styles/chibi.mjs';
import { WARDROBE } from './items/wardrobe-v1.mjs';
import { SKIN, HAIR, EYES, DEFAULTS } from './lib/palettes.mjs';
import { Image, spriteToImage, writeGrid } from './lib/render.mjs';
import { Sprite } from './lib/canvas.mjs';
import { writeGif } from './lib/gif.mjs';
import { AVATAR_CATEGORIES, defaultAvatarSelection, resolveAvatarPieces } from '../../shared/avatar-customization.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT = resolve(ROOT, 'assets/avatar/modular-v1');
const PREVIEW = resolve(ROOT, 'artifacts/avatar-modular');
const STYLES = { big, chibi };
const ANIMATIONS = {
  idle: { frames: 8, fps: 4, loopFrom: 0 },
  walk: { frames: 8, fps: 8, loopFrom: 0 },
  greet: { frames: 8, fps: 6, loopFrom: 0 },
  speak: { frames: 8, fps: 6, loopFrom: 0 },
  celebrate: { frames: 8, fps: 8, loopFrom: 0 },
  eat: { frames: 8, fps: 6, loopFrom: 0 },
};
const title = value => value.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const paletteList = table => Object.entries(table).map(([id, colors]) => ({ id, name: title(id), color: colors[3] }));
const pack = {
  version: 'bridgingminds-modular-v1',
  styles: Object.fromEntries(Object.entries(STYLES).map(([key, style]) => [key, {
    width: style.W, height: style.H, slots: style.SLOTS,
    pivot: style.FOOT_PIVOT ?? [style.W / 2, style.H - 12],
  }])),
  animations: ANIMATIONS,
  catalog: Object.fromEntries(['boy', 'girl'].map(collection => [collection, Object.fromEntries(AVATAR_CATEGORIES.map(category => [category,
    WARDROBE[collection][category].map(({ id, name }) => ({ id, name, category, collection })),
  ]))])),
  palettes: { skin: paletteList(SKIN), hair: paletteList(HAIR), eyes: paletteList(EYES) },
  variants: {},
};
const decodedPages = new Map();
const pagePaths = new Set();

/** Small bounded atlas pages, one transparent pixel of padding, no rotations. */
class Pages {
  constructor() { this.cells = []; this.lookup = new Map(); }
  add(image) {
    const box = image.bbox();
    if (!box) return null;
    const cell = image.crop(box.x0, box.y0, box.x1 - box.x0 + 1, box.y1 - box.y0 + 1);
    const key = createHash('sha256').update(cell.d).update(`${cell.w}:${cell.h}`).digest('hex');
    let index = this.lookup.get(key);
    if (index === undefined) { index = this.cells.length; this.cells.push(cell); this.lookup.set(key, index); }
    return [index, box.x0, box.y0];
  }
  write(key) {
    const rects = new Array(this.cells.length);
    const pages = [];
    let page = 0, x = 1, y = 1, shelf = 0;
    const dims = [{ w: 1, h: 1 }];
    const order = this.cells.map((_, i) => i).sort((a, b) => this.cells[b].h - this.cells[a].h || a - b);
    for (const index of order) {
      const cell = this.cells[index];
      if (cell.w > 1022 || cell.h > 1022) throw new Error('Sprite exceeds atlas limit');
      if (x + cell.w + 1 > 1024) { x = 1; y += shelf + 1; shelf = 0; }
      if (y + cell.h + 1 > 1024) { page++; x = 1; y = 1; shelf = 0; dims.push({ w: 1, h: 1 }); }
      rects[index] = { page, x, y, w: cell.w, h: cell.h };
      dims[page].w = Math.max(dims[page].w, x + cell.w + 1);
      dims[page].h = Math.max(dims[page].h, y + cell.h + 1);
      x += cell.w + 1; shelf = Math.max(shelf, cell.h);
    }
    const images = dims.map(({ w, h }) => new Image(w, h));
    this.cells.forEach((cell, index) => { const rect = rects[index]; images[rect.page].drawImage(cell, rect.x, rect.y); });
    images.forEach((image, index) => {
      const file = `${key.replaceAll('/', '__')}__${index}.png`;
      image.save(resolve(OUTPUT, file));
      decodedPages.set(file, image);
      pagePaths.add(file);
      pages.push({ file, width: image.w, height: image.h });
    });
    return { pages, rects };
  }
}

function filterSprite(sprite, predicate) {
  const result = new Sprite(sprite.w, sprite.h);
  for (let i = 0; i < sprite.p.length; i++) if (sprite.p[i] !== null && predicate(sprite.p[i])) result.p[i] = sprite.p[i];
  return result;
}

function contexts(style, collection, draw) {
  const frames = {};
  for (const [animation, config] of Object.entries(ANIMATIONS)) {
    frames[animation] = [];
    if (!style.ANIMATIONS[animation]) throw new Error(`Animation not implemented: ${animation}`);
    for (let frame = 0; frame < config.frames; frame++) {
      const context = style.makeContext(animation, frame, collection);
      draw(context);
      frames[animation].push(context.layers);
    }
  }
  return frames;
}

function variant(key, source, colors = DEFAULTS, filter = null) {
  const atlas = new Pages();
  const frames = {};
  for (const [animation, list] of Object.entries(source)) {
    frames[animation] = list.map(layers => {
      const pieces = {};
      for (const [slot, original] of Object.entries(layers)) {
        const sprite = filter ? filterSprite(original, filter) : original;
        const cell = atlas.add(spriteToImage(sprite, colors));
        if (cell) pieces[slot] = cell;
      }
      return pieces;
    });
  }
  pack.variants[key] = { ...atlas.write(key), frames };
}

function render(selection, style, animation = 'idle', frame = 0) {
  const size = pack.styles[style];
  const image = new Image(size.width, size.height);
  for (const part of resolveAvatarPieces(pack, selection, style, animation, frame))
    image.drawImage(decodedPages.get(part.file), part.offsetX, part.offsetY, 1, part.x, part.y, part.width, part.height);
  return image;
}

function writePreviews() {
  const entries = [];
  for (const collection of ['boy', 'girl']) {
    const base = defaultAvatarSelection(pack, collection);
    const row = [];
    for (let index = 0; index < 3; index++) {
      const look = { ...base };
      for (const category of AVATAR_CATEGORIES) look[category] = pack.catalog[collection][category][index].id;
      row.push(render(look, 'big'), render(look, 'chibi'));
    }
    writeGrid(resolve(PREVIEW, `${collection}-looks.png`), [row], { bg: '#ffffff', scale: 2, gap: 16 });
    for (const category of AVATAR_CATEGORIES) {
      const rows = ['big', 'chibi'].map(style => pack.catalog[collection][category].map(item => {
        const selection = { ...base, [category]: item.id };
        if (category === 'top') selection.jacket = null;
        return render(selection, style);
      }));
      writeGrid(resolve(PREVIEW, `${collection}-${category}.png`), rows, { bg: '#ffffff', scale: 2, gap: 12 });
      pack.catalog[collection][category].forEach(item => entries.push({ ...item, preview: `${collection}-${category}.png` }));
    }
    for (const style of ['big', 'chibi']) {
      writeGrid(resolve(PREVIEW, `${collection}-${style}-animations.png`), Object.keys(ANIMATIONS).map(animation =>
        Array.from({ length: 8 }, (_, frame) => render(base, style, animation, frame))), { bg: '#ffffff', gap: 8 });
    }
    for (const [animation, info] of Object.entries(ANIMATIONS)) {
      const frames = Array.from({ length: 8 }, (_, frame) => {
        const image = new Image(400, 280);
        image.fillRect(0, 0, image.w, image.h, [255, 255, 255, 255]);
        image.drawImage(render(base, 'big', animation, frame), 8, 8);
        image.drawImage(render(base, 'chibi', animation, frame), 200, 48);
        return image;
      });
      writeGif(resolve(PREVIEW, `${collection}-${animation}.gif`), frames, frames.map(() => Math.round(100 / info.fps)));
    }
  }
  writeFileSync(resolve(PREVIEW, 'catalog.json'), JSON.stringify(entries, null, 2) + '\n');
  const template = readFileSync(resolve(ROOT, 'scripts/avatar/preview-template.html'), 'utf8');
  const helpers = readFileSync(resolve(ROOT, 'shared/avatar-customization.mjs'), 'utf8').replace(/^export /gm, '');
  writeFileSync(resolve(PREVIEW, 'index.html'), template
    .replace('__PACK_JSON__', () => JSON.stringify(pack))
    .replace('__CUSTOMIZATION_JS__', () => helpers));
}

mkdirSync(OUTPUT, { recursive: true });
mkdirSync(PREVIEW, { recursive: true });
const ids = Object.values(pack.catalog).flatMap(collection => Object.values(collection).flat().map(item => item.id));
if (ids.length !== 42 || new Set(ids).size !== ids.length) throw new Error('Expected 42 distinct wearable designs');
for (const [styleName, style] of Object.entries(STYLES)) for (const collection of ['boy', 'girl']) {
  const prefix = `${styleName}/${collection}`;
  const body = contexts(style, collection, context => style.drawBody(context));
  for (const skin of Object.keys(SKIN)) variant(`${prefix}/body/${skin}`, body, { ...DEFAULTS, skin }, key => !key.startsWith('eye.'));
  for (const eyes of Object.keys(EYES)) variant(`${prefix}/eyes/${eyes}`, body, { ...DEFAULTS, eyes }, key => key.startsWith('eye.'));
  const props = contexts(style, collection, context => style.drawProps?.(context));
  variant(`${prefix}/props`, props);
  for (const category of AVATAR_CATEGORIES) {
    for (const item of WARDROBE[collection][category]) {
      if (category === 'hair') {
        for (const hatted of [false, true]) {
          const source = contexts(style, collection, context => item.draw(context, { hatted }));
          for (const hair of Object.keys(HAIR))
            variant(`${prefix}/hair/${item.id}/${hair}/${hatted ? 'hatted' : 'plain'}`, source, { ...DEFAULTS, hair });
        }
      } else variant(`${prefix}/${category}/${item.id}`, contexts(style, collection, context => item.draw(context)));
    }
    console.log(`Built ${styleName} / ${collection} / ${category}`);
  }
}
writeFileSync(resolve(OUTPUT, 'manifest.json'), JSON.stringify(pack) + '\n');
const indexLines = [
  '// Generated by scripts/avatar/build-modular.mjs. Do not hand-edit.',
  "import type { AvatarPack } from './pack';",
  "export const AVATAR_PACK = require('../../assets/avatar/modular-v1/manifest.json') as AvatarPack;",
  'export const AVATAR_ATLASES: Record<string, number> = {',
  ...[...pagePaths].sort().map(file => `  ${JSON.stringify(file)}: require(${JSON.stringify(`../../assets/avatar/modular-v1/${file}`)}),`),
  '};',
];
writeFileSync(resolve(ROOT, 'src/avatar/generated-pack.ts'), indexLines.join('\n') + '\n');
writePreviews();
const bytes = [...pagePaths].reduce((sum, file) => sum + readFileSync(resolve(OUTPUT, file)).length, 0);
console.log(JSON.stringify({ designs: ids.length, styles: 2, animations: 6, variants: Object.keys(pack.variants).length, atlasPages: pagePaths.size, pngBytes: bytes }));
