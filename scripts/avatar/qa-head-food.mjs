#!/usr/bin/env node
// Focused follow-up to the screenshot-reported hair, eyewear and eating issues.
// Renders source pieces with production pixel finishing, without rebuilding a pack.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { STYLES } from './illustrated/rig.mjs';
import { renderQaLook } from './qa-pairwise.mjs';
import { Image, writeGrid } from './lib/render.mjs';
import { writeGif } from './lib/gif.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(ROOT, process.argv.find(value => value.startsWith('--output='))?.slice(9) ?? 'artifacts/avatar-modular/head-food-audit');
const FOOD = ['eat', 'eatOnigiri', 'eatBento'];
const POSES = { big: [['idle', 0], ['walk', 2]], chibi: [['idle', 0], ['greet', 2], ['celebrate', 2], ...FOOD.map(action => [action, 3])] };
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const sourceFiles = ['scripts/avatar/illustrated/rig.mjs', 'scripts/avatar/illustrated/raster.mjs', 'scripts/avatar/illustrated/meals.mjs', 'shared/avatar-customization.mjs',
  'scripts/avatar/qa-pairwise.mjs', 'scripts/avatar/qa-head-food.mjs', 'scripts/avatar/lib/render.mjs',
  'assets/avatar/illustrated-v2/source/girl-kit.png', 'assets/avatar/illustrated-v2/source/boy-kit.png',
  'assets/avatar/illustrated-v2/source/details-kit.png', 'assets/avatar/illustrated-v2/source/pixel-faces-v3.png',
  ...['ramen', 'ramen-held', 'onigiri', 'bento'].map(food => `assets/avatar/food-v1/${food}.png`)];
for (const action of FOOD) if (!STYLES.chibi.animations.includes(action)) throw new Error(`Rig is not ready for ${action}; no audit was rendered.`);
mkdirSync(output, { recursive: true });
const coverage = { version: 1, scope: 'screenshot-follow-up-head-fit-and-three-food-actions',
  sourceHashes: Object.fromEntries(sourceFiles.map(file => [file, hash(resolve(ROOT, file))])),
  palettes: { skin: 'peach', hair: 'espresso', eyes: 'hazel' }, sheets: [], gifs: [], totalTiles: 0,
  limits: 'Focused coverage, not a full wardrobe rerun or native-device validation. Rendered output is not visual approval. Read visual-review.json for reviewed hashes.' };
const escape = value => String(value).replace(/[&<>\"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
function sheet(file, rows, info) {
  writeGrid(resolve(output, file), rows, { bg: '#ffffff', gap: 8 });
  const record = { file, ...info, tiles: rows.flat().length, sha256: hash(resolve(output, file)) };
  coverage.sheets.push(record); coverage.totalTiles += record.tiles;
}
for (const collection of ['girl', 'boy']) {
  for (const style of ['big', 'chibi']) for (const [animation, frame] of POSES[style]) {
    // Natural logical-canvas size keeps the adult face at its real displayed
    // scale; users can open the PNG to inspect pixels rather than blurred zoom.
    const selections = [0, 1, 2].map(hair => [null, 0, 1].map(accessory => ({ hair, accessory })));
    sheet(`${collection}-${style}-head-${animation}-${frame}.png`, selections.map(row => row.map(selection => renderQaLook(style, collection, selection, animation, frame))),
      { group: 'head', collection, style, animation, frame, rows: ['Hair 0', 'Hair 1', 'Hair 2'], columns: ['No accessory', 'Glasses', 'Headphones'], selections });
  }
  for (const animation of FOOD) {
    const selection = { hair: collection === 'girl' ? 1 : 0, jacket: 0 };
    const frames = Array.from({ length: 8 }, (_, frame) => renderQaLook('chibi', collection, selection, animation, frame));
    sheet(`${collection}-${animation}-frames.png`, [frames.slice(0, 4), frames.slice(4)],
      { group: 'food-frames', collection, style: 'chibi', animation, frameOrder: [[0, 1, 2, 3], [4, 5, 6, 7]], selection });
    const selections = [0, 1, 2].map(top => [null, 0, 1, 2].map(jacket => ({ ...selection, top, jacket })));
    sheet(`${collection}-${animation}-clothing.png`, selections.map(row => row.map(look => renderQaLook('chibi', collection, look, animation, 3))),
      { group: 'food-clothing', collection, style: 'chibi', animation, frame: 3,
        rows: ['Top 0', 'Top 1', 'Top 2'], columns: ['No jacket', 'Jacket 0', 'Jacket 1', 'Jacket 2'], selections });
    const file = `${collection}-${animation}.gif`;
    const whiteFrames = frames.map(frame => { const image = new Image(frame.w, frame.h); image.fillRect(0, 0, frame.w, frame.h, [255, 255, 255, 255]); image.drawImage(frame); return image; });
    writeGif(resolve(output, file), whiteFrames, whiteFrames.map(() => 17));
    coverage.gifs.push({ file, collection, animation, sha256: hash(resolve(output, file)), frames: 8 });
  }
}
writeFileSync(resolve(output, 'coverage.json'), JSON.stringify(coverage, null, 2));
writeFileSync(resolve(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Head fit and food action checks</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:24px;background:#f5f2ed;color:#352f2b}main{max-width:1120px;margin:auto}section{margin:24px 0;padding:16px;background:#fff;border:1px solid #d7cfc3;border-radius:12px}h1{font-size:27px}h2{font-size:18px}img{max-width:100%;height:auto;image-rendering:pixelated}.motion{display:flex;flex-wrap:wrap;gap:12px}.motion img{width:256px;height:256px}a{color:#67523f}</style>
<main><h1>Head fit and food action checks</h1><p>${coverage.sheets.length} sheets / ${coverage.totalTiles} rendered tiles. Adult canvases are 256 × 384; chibi canvases are 256 × 256. Open a PNG for its original pixels. These are source-rig renders with production pixel finishing.</p>
<p>Focus: the reported girl bob/ponytail, headphone cup size and pupil-to-lens placement, then all eight frames of each food and every top/jacket pairing at the bite pose. Head sheets use all three hairstyles with no accessory, glasses and headphones. Hats, bags and every palette are outside this focused visual pass.</p>
<p>${escape(coverage.limits)} <a href="coverage.json">Coverage / source hashes</a> · <a href="visual-review.json">Recorded visual review</a> · <a href="../index.html">Avatar preview</a></p>
<div class="motion">${coverage.gifs.map(item => `<figure><img src="${item.file}" alt="${item.collection} ${item.animation}"><figcaption>${item.collection} · ${item.animation}</figcaption></figure>`).join('')}</div>
${coverage.sheets.map(item => `<section><h2>${escape(item.collection)} · ${escape(item.style)} · ${escape(item.animation)} · ${escape(item.group)}</h2><p>${item.rows ? `Rows: ${item.rows.join(' / ')}. Columns: ${item.columns.join(' / ')}. Frame ${item.frame}.` : 'Frames 0–3 in top row; 4–7 below.'}</p><a href="${item.file}"><img loading="lazy" src="${item.file}" alt="${escape(item.file)}"></a></section>`).join('')}</main></html>`);
console.log(`Rendered ${coverage.sheets.length} sheets, ${coverage.totalTiles} tiles and ${coverage.gifs.length} GIFs into ${output}. Visual approval is recorded separately.`);
