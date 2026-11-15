#!/usr/bin/env node
// Compiles the generated illustrated paper-doll artwork into wearable atlases.
// Original source sheets and the previous procedural pack are kept intact.
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { STYLES, renderVariant } from './illustrated/rig.mjs';
import { finishAvatarLayer, PIXEL_HEAD_SLOTS } from './illustrated/raster.mjs';
import { WARDROBE } from './items/wardrobe-v1.mjs';
import { SKIN, HAIR, EYES } from './lib/palettes.mjs';
import { Image, writeGrid } from './lib/render.mjs';
import { writeGif } from './lib/gif.mjs';
import { AVATAR_CATEGORIES, defaultAvatarSelection, resolveAvatarPieces } from '../../shared/avatar-customization.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT = resolve(ROOT, 'assets/avatar/illustrated-v2');
const PREVIEW = resolve(ROOT, 'artifacts/avatar-modular');
const previousManifestPath = resolve(OUTPUT, 'manifest.json');
const previousPages = existsSync(previousManifestPath)
  ? new Set(Object.values(JSON.parse(readFileSync(previousManifestPath, 'utf8')).variants)
    .flatMap(variant => variant.pages.map(page => page.file)))
  : new Set();
const ANIMATIONS = {
  idle: { frames: 8, fps: 4, loopFrom: 0 },
  walk: { frames: 8, fps: 8, loopFrom: 0 },
  greet: { frames: 8, fps: 6, loopFrom: 0 },
  speak: { frames: 8, fps: 6, loopFrom: 0 },
  celebrate: { frames: 8, fps: 8, loopFrom: 0 },
  eat: { frames: 8, fps: 6, loopFrom: 0 },
  eatOnigiri: { frames: 8, fps: 5, loopFrom: 0 },
  eatBento: { frames: 8, fps: 5, loopFrom: 0 },
};
const title = value => value.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const paletteList = table => Object.entries(table).map(([id, colors]) => ({ id, name: title(id), color: colors[3] }));
const pack = {
  version: 'bridgingminds-illustrated-v5-meals',
  styles: Object.fromEntries(Object.entries(STYLES).map(([key, style]) => [key, {
    width: style.width, height: style.height, slots: style.slots,
    pivot: style.pivot, animations: style.animations,
    pixelSize: key === 'chibi' ? 3 : 2,
    pixelSlots: key === 'chibi' ? style.slots : PIXEL_HEAD_SLOTS,
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
      const png = image.png();
      const hash = createHash('sha256').update(png).digest('hex').slice(0, 12);
      // The standalone file preview must never combine a new manifest with a
      // browser-cached atlas from an earlier revision of the same wearable.
      const file = `${key.replaceAll('/', '__')}__${index}--${hash}.png`;
      writeFileSync(resolve(OUTPUT, file), png);
      decodedPages.set(file, image);
      pagePaths.add(file);
      pages.push({ file, width: image.w, height: image.h });
    });
    return { pages, rects };
  }
}

function contexts(options) {
  const frames = {};
  for (const [animation, config] of Object.entries(ANIMATIONS)) {
    if (!STYLES[options.style].animations.includes(animation)) continue;
    frames[animation] = Array.from({ length: config.frames }, (_, frame) => renderVariant({ ...options, animation, frame }));
  }
  // Retain complete legacy keys without drawing an unsupported action.
  for (const animation of Object.keys(ANIMATIONS)) frames[animation] ??= frames.idle;
  return frames;
}

function variant(key, options) {
  const source = contexts(options);
  const atlas = new Pages();
  const frames = {};
  for (const [animation, list] of Object.entries(source)) {
    frames[animation] = list.map(layers => {
      const pieces = {};
      for (const [slot, image] of Object.entries(layers)) {
        const cell = atlas.add(finishAvatarLayer(image, options.style, slot));
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
  const revision = new Image(1056, 400);
  revision.fillRect(0, 0, revision.w, revision.h, [255, 255, 255, 255]);
  const girl = defaultAvatarSelection(pack, 'girl'), boy = defaultAvatarSelection(pack, 'boy');
  revision.drawImage(render(girl, 'big'), 0, 8);
  revision.drawImage(render(girl, 'chibi', 'eat', 3), 264, 72);
  revision.drawImage(render(boy, 'big'), 528, 8);
  revision.drawImage(render(boy, 'chibi', 'celebrate', 3), 792, 72);
  revision.save(resolve(PREVIEW, 'revision-preview.png'));
  const polish = new Image(1056, 400);
  polish.fillRect(0, 0, polish.w, polish.h, [255, 255, 255, 255]);
  polish.drawImage(render({ ...girl, hair: pack.catalog.girl.hair[2].id, accessory: pack.catalog.girl.accessory[0].id }, 'big'), 0, 8);
  polish.drawImage(render({ ...girl, hair: pack.catalog.girl.hair[1].id, accessory: pack.catalog.girl.accessory[1].id }, 'chibi'), 264, 72);
  polish.drawImage(render({ ...boy, accessory: pack.catalog.boy.accessory[0].id }, 'big'), 528, 8);
  polish.drawImage(render({ ...girl, hair: pack.catalog.girl.hair[2].id }, 'chibi', 'eatOnigiri', 3), 792, 72);
  polish.save(resolve(PREVIEW, 'polish-preview.png'));
  const mealFrames = Array.from({ length: 8 }, (_, frame) => {
    const image = new Image(800, 536);
    image.fillRect(0, 0, image.w, image.h, [255, 255, 255, 255]);
    for (const [row, base] of [girl, boy].entries())
      for (const [column, action] of ['eat', 'eatOnigiri', 'eatBento'].entries())
        image.drawImage(render(base, 'chibi', action, frame), 8 + column * 264, 8 + row * 264);
    return image;
  });
  mealFrames[3].save(resolve(PREVIEW, 'meals-preview.png'));
  writeGif(resolve(PREVIEW, 'meals-preview.gif'), mealFrames, mealFrames.map(() => 20));
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
      writeGrid(resolve(PREVIEW, `${collection}-${style}-animations.png`), STYLES[style].animations.map(animation =>
        Array.from({ length: 8 }, (_, frame) => render(base, style, animation, frame))), { bg: '#ffffff', gap: 8 });
    }
    for (const [animation, info] of Object.entries(ANIMATIONS)) {
      const frames = Array.from({ length: 8 }, (_, frame) => {
        const image = new Image(544, 400);
        image.fillRect(0, 0, image.w, image.h, [255, 255, 255, 255]);
        image.drawImage(render(base, 'big', animation, frame), 8, 8);
        image.drawImage(render(base, 'chibi', animation, frame), 280, 80);
        return image;
      });
      writeGif(resolve(PREVIEW, `${collection}-${animation}.gif`), frames, frames.map(() => Math.round(100 / info.fps)));
    }
    const attachmentFrames = Array.from({ length: 8 }, (_, frame) => {
      const image = new Image(544, 400);
      image.fillRect(0, 0, image.w, image.h, [255, 255, 255, 255]);
      const adult = { ...base, bottom: pack.catalog[collection].bottom[collection === 'girl' ? 2 : 1].id, hat: pack.catalog[collection].hat[0].id, accessory: pack.catalog[collection].accessory[2].id };
      const bust = { ...base, hat: pack.catalog[collection].hat[1].id, accessory: pack.catalog[collection].accessory[1].id };
      image.drawImage(render(adult, 'big', 'walk', frame), 8, 8);
      image.drawImage(render(bust, 'chibi', 'greet', frame), 280, 80);
      return image;
    });
    writeGif(resolve(PREVIEW, `${collection}-attachments.gif`), attachmentFrames, attachmentFrames.map(() => 16));
  }
  writeFileSync(resolve(PREVIEW, 'catalog.json'), JSON.stringify(entries, null, 2) + '\n');
  const template = readFileSync(resolve(ROOT, 'scripts/avatar/preview-illustrated-template.html'), 'utf8');
  const helpers = readFileSync(resolve(ROOT, 'shared/avatar-customization.mjs'), 'utf8').replace(/^export /gm, '');
  writeFileSync(resolve(PREVIEW, 'index.html'), template
    .replace('__PACK_JSON__', () => JSON.stringify(pack))
    .replace('__CUSTOMIZATION_JS__', () => helpers));
}

mkdirSync(OUTPUT, { recursive: true });
mkdirSync(PREVIEW, { recursive: true });
const ids = Object.values(pack.catalog).flatMap(collection => Object.values(collection).flat().map(item => item.id));
if (ids.length !== 42 || new Set(ids).size !== ids.length) throw new Error('Expected 42 distinct wearable designs');
for (const styleName of Object.keys(STYLES)) for (const collection of ['boy', 'girl']) {
  const prefix = `${styleName}/${collection}`;
  const common = { style: styleName, collection };
  for (const skin of Object.keys(SKIN)) variant(`${prefix}/body/${skin}`, { ...common, category: 'body', palette: skin });
  for (const eyes of Object.keys(EYES)) variant(`${prefix}/eyes/${eyes}`, { ...common, category: 'eyes', palette: eyes });
  variant(`${prefix}/props`, { ...common, category: 'props' });
  for (const category of AVATAR_CATEGORIES) {
    for (const [index, item] of WARDROBE[collection][category].entries()) {
      if (category === 'hair') {
        for (const hatted of [false, true]) {
          for (const hair of Object.keys(HAIR))
            variant(`${prefix}/hair/${item.id}/${hair}/${hatted ? 'hatted' : 'plain'}`, { ...common, category, index, palette: hair, hatted });
        }
      } else variant(`${prefix}/${category}/${item.id}`, { ...common, category, index });
    }
    console.log(`Built ${styleName} / ${collection} / ${category}`);
  }
}
writeFileSync(resolve(OUTPUT, 'manifest.json'), JSON.stringify(pack) + '\n');
const indexLines = [
  '// Generated by scripts/avatar/build-illustrated.mjs. Do not hand-edit.',
  "import type { AvatarPack } from './pack';",
  "export const AVATAR_PACK = require('../../assets/avatar/illustrated-v2/manifest.json') as AvatarPack;",
  'export const AVATAR_ATLASES: Record<string, number> = {',
  ...[...pagePaths].sort().map(file => `  ${JSON.stringify(file)}: require(${JSON.stringify(`../../assets/avatar/illustrated-v2/${file}`)}),`),
  '};',
];
writeFileSync(resolve(ROOT, 'src/avatar/generated-pack.ts'), indexLines.join('\n') + '\n');
writePreviews();
// Only prune files explicitly referenced by the preceding generated manifest.
// Source sheets and every other directory remain outside this cleanup.
for (const file of previousPages) {
  const path = resolve(OUTPUT, file);
  if (!pagePaths.has(file) && /^[a-z0-9_-]+\.png$/.test(file) && dirname(path) === OUTPUT && existsSync(path))
    unlinkSync(path);
}
const bytes = [...pagePaths].reduce((sum, file) => sum + readFileSync(resolve(OUTPUT, file)).length, 0);
console.log(JSON.stringify({ designs: ids.length, styles: 2, animations: Object.keys(ANIMATIONS).length, variants: Object.keys(pack.variants).length, atlasPages: pagePaths.size, pngBytes: bytes }));
