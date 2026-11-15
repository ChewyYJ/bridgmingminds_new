#!/usr/bin/env node
// Reproducible source-rig inspection. Does not rebuild the shipped asset pack.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { STYLES, renderVariant } from './illustrated/rig.mjs';
import { finishAvatarLayer, decodePng, affine } from './illustrated/raster.mjs';
import { Image, writeGrid } from './lib/render.mjs';
import { WARDROBE, CATEGORY_ORDER } from './items/wardrobe-v1.mjs';
import { shouldHideBodyArms } from '../../shared/avatar-customization.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = { hair: 0, hat: null, top: 0, jacket: 0, bottom: 0, shoes: 0, accessory: null };
const OPTIONS = Object.fromEntries(CATEGORY_ORDER.map(category => [category,
  ['hat', 'jacket', 'accessory'].includes(category) ? [null, 0, 1, 2] : [0, 1, 2]]));
const POSES = {
  big: [['idle', 0], ['walk', 2], ['walk', 6]],
  chibi: [['idle', 0], ['greet', 2], ['speak', 2], ['celebrate', 2], ['eat', 3]],
};
const pieceCache = new Map();
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const itemName = (collection, category, index) => index === null ? 'None' : WARDROBE[collection][category][index].name;

function pieces(options) {
  const key = JSON.stringify(options);
  if (pieceCache.has(key)) return pieceCache.get(key);
  const result = Object.entries(renderVariant(options)).flatMap(([slot, raw]) => {
    const image = finishAvatarLayer(raw, options.style, slot), bounds = image.bbox();
    return bounds ? [{ slot, category: options.category, x: bounds.x0, y: bounds.y0,
      image: image.crop(bounds.x0, bounds.y0, bounds.x1 - bounds.x0 + 1, bounds.y1 - bounds.y0 + 1) }] : [];
  });
  // Small cropped cells keep an exhaustive review inexpensive in memory.
  if (pieceCache.size >= 512) pieceCache.delete(pieceCache.keys().next().value);
  pieceCache.set(key, result);
  return result;
}

export function renderQaLook(style, collection, selection = {}, animation = 'idle', frame = 0) {
  const look = { ...BASE, ...selection }, config = STYLES[style];
  const common = { style, collection, animation, frame };
  const contexts = [pieces({ ...common, category: 'body', palette: 'peach' }),
    pieces({ ...common, category: 'eyes', palette: 'hazel' })];
  for (const category of CATEGORY_ORDER) {
    if (look[category] === null) continue;
    contexts.push(pieces({ ...common, category, index: look[category],
      ...(category === 'hair' ? { palette: 'espresso', hatted: look.hat !== null } : {}) }));
  }
  contexts.push(pieces({ ...common, category: 'props' }));
  const hideArms = shouldHideBodyArms(style, animation, look.jacket !== null || contexts.some(context => context.some(piece => piece.category === 'top' && /^foreSleeve/.test(piece.slot))));
  const image = new Image(config.width, config.height);
  for (const slot of config.slots) for (const context of contexts) for (const piece of context) {
    if (hideArms && piece.category === 'body' && /^(arm|fore)(Near|Far)$/.test(slot)) continue;
    if (piece.slot !== slot || look.jacket !== null && piece.category === 'top' && /^(sleeve|foreSleeve)/.test(slot)) continue;
    image.drawImage(piece.image, piece.x, piece.y);
  }
  return image;
}

export function combineQaLayers(style, contexts) {
  const image = new Image(STYLES[style].width, STYLES[style].height);
  for (const slot of STYLES[style].slots) for (const context of contexts)
    if (context[slot]) image.drawImage(context[slot]);
  return image;
}

export function waistPixels(collection, index, animation = 'idle', frame = 0) {
  const layers = renderVariant({ style: 'big', collection, category: 'bottom', index, animation, frame });
  const image = combineQaLayers('big', [layers]);
  const bounds = image.bbox(), rows = [];
  for (let y = bounds.y0 + 3; y <= bounds.y0 + 18; y++) {
    let left = image.w, right = -1;
    for (let x = 0; x < image.w; x++) if (image.d[(y * image.w + x) * 4 + 3] >= 128) {
      left = Math.min(left, x); right = Math.max(right, x);
    }
    if (right >= left) rows.push({ y, width: right - left + 1, centre: (left + right) / 2 });
  }
  const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return { width: median(rows.map(row => row.width)), centre: median(rows.map(row => row.centre)), top: bounds.y0, rows };
}

function sourceDigest() {
  return Object.fromEntries(['scripts/avatar/illustrated/rig.mjs', 'scripts/avatar/illustrated/raster.mjs',
    'assets/avatar/illustrated-v2/source/girl-kit.png', 'assets/avatar/illustrated-v2/source/boy-kit.png',
    'assets/avatar/illustrated-v2/source/pixel-faces-v3.png', 'assets/avatar/illustrated-v2/source/details-kit.png'].map(file => [file,
    createHash('sha256').update(readFileSync(resolve(ROOT, file))).digest('hex')]));
}

function htmlIndex(report) {
  const cards = report.sheets.map(sheet => `<section class="sheet" data-collection="${sheet.collection}" data-style="${sheet.style}" data-group="${sheet.group}">
<h2>${escapeHtml(sheet.title)}</h2><p>${escapeHtml(sheet.collection)} · ${sheet.style === 'big' ? 'Adult' : 'Chibi bust'} · ${sheet.animation} frame ${sheet.frame} · ${sheet.cells} combinations</p>
<p><b>Rows:</b> ${sheet.rows.map(escapeHtml).join(' · ')}<br><b>Columns:</b> ${sheet.columns.map(escapeHtml).join(' · ')}</p>
${sheet.note ? `<p class="note">${escapeHtml(sheet.note)}</p>` : ''}
<a href="${sheet.file}" target="_blank"><img loading="lazy" src="${sheet.file}" alt="${escapeHtml(sheet.title)}; rows ${sheet.rows.map(escapeHtml).join(', ')}; columns ${sheet.columns.map(escapeHtml).join(', ')}"></a></section>`).join('\n');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Avatar pairwise inspection</title>
<style>body{margin:0;padding:24px;font:15px/1.5 system-ui,sans-serif;background:#f6f3ed;color:#332d29}main{max-width:1160px;margin:auto}h1{font-size:28px}h2{font-size:19px;margin-bottom:4px}p{margin:8px 0}.controls{position:sticky;top:0;z-index:1;display:flex;flex-wrap:wrap;gap:12px;padding:12px;background:#f6f3edf5;border:1px solid #d8cfc2}select{padding:8px;font:inherit}section{background:white;padding:18px;margin:24px 0;border:1px solid #ddd4c9;border-radius:10px}img{display:block;max-width:100%;height:auto;image-rendering:pixelated}.note{color:#665747}a{color:#65503e}[hidden]{display:none!important}code{background:#e9e2d7;padding:2px 4px}</style>
<main><h1>Avatar pairwise inspection</h1><p>${report.sheets.length} contact sheets · ${report.totalTiles} rendered tiles. Source-rig output with the production pixel finish; this does not rebuild the shipped pack.</p>
<p><b>Coverage:</b> every pair among seven wearable categories, both collections and representations, with None on removable slots. Focused grids additionally exhaust 3 hair × 4 hat × 4 accessory states, adult 3 top × 4 jacket × 3 bottom × 3 shoe × 4 accessory states, and chibi 3 top × 4 jacket × 4 accessory states. Action extremes are sampled visually; numeric regression tests traverse every supported frame.</p>
<p><b>Limits:</b> this is rendered coverage, not an automatic claim of visual approval. It covers pairwise combinations plus named focused groups, not every complete outfit × palette × animation-frame combination, and not native-device validation. Chibi bottoms and shoes intentionally have no artwork. Identical lower-body choices are retained in baseline pair grids; action grids omit those duplicates.</p>
<p>Click a sheet to inspect its original pixels. Rows run top to bottom; columns left to right. Fixed review colours: peach skin, espresso hair and hazel eyes. <a href="coverage.json">Coverage and source hashes</a> · <a href="waist-metrics.json">Measured waist widths</a> · <a href="visual-review.json">Recorded visual review (verify hashes)</a></p>
<div class="controls"><label>Collection <select id="collection"><option value="">Both</option><option>girl</option><option>boy</option></select></label><label>Representation <select id="style"><option value="">Both</option><option value="big">Adult</option><option value="chibi">Chibi</option></select></label><label>Group <select id="group"><option value="">All</option><option value="pairwise">Every category pair</option><option value="head">Head combinations</option><option value="outfit">Clothing combinations</option><option value="seams">Waist and ankle close-ups</option></select></label><span id="count"></span></div>
${cards}<script>const fields=['collection','style','group'];function filter(){let count=0;document.querySelectorAll('.sheet').forEach(card=>{card.hidden=fields.some(key=>document.getElementById(key).value&&document.getElementById(key).value!==card.dataset[key]);if(!card.hidden)count++});document.getElementById('count').textContent=count+' sheets shown'}fields.forEach(key=>document.getElementById(key).addEventListener('change',filter));filter()</script></main></html>`;
}

export function buildPairwiseQa({ output = 'artifacts/avatar-modular/wardrobe-audit', section = 'all', collection: requestedCollection, style: requestedStyle } = {}) {
  const directory = resolve(ROOT, output);
  mkdirSync(directory, { recursive: true });
  const report = { version: 1, scope: 'pairwise-plus-focused-groups', sourceHashes: sourceDigest(), sheets: [], totalTiles: 0,
    visualPoseSamples: POSES, optionalNone: ['hat', 'jacket', 'accessory'], lowerBodyHiddenInChibi: true,
    palettes: { skin: 'peach', hair: 'espresso', eyes: 'hazel' } };
  const collections = requestedCollection ? [requestedCollection] : ['girl', 'boy'];
  const styles = requestedStyle ? [requestedStyle] : ['big', 'chibi'];
  if (collections.some(value => !['girl', 'boy'].includes(value)) || styles.some(value => !STYLES[value])) throw new Error('Invalid collection or style');
  const wanted = name => section === 'all' || section === name;
  function sheet({ group, collection, style, animation = 'idle', frame = 0, id, title, rows, columns, selections, crop: cropBox, scale = 1, note }) {
    const images = selections.map(row => row.map(selection => {
      const image = renderQaLook(style, collection, selection, animation, frame);
      return cropBox ? image.crop(...cropBox) : image;
    }));
    const file = `${collection}-${style}-${group}-${id}-${animation}-${frame}.png`;
    writeGrid(resolve(directory, file), images, { bg: '#ffffff', gap: 8, scale });
    const cells = selections.flat().length;
    report.sheets.push({ group, collection, style, animation, frame, title, rows, columns, file, cells, note,
      selections: selections.map(row => row.map(selection => ({ ...BASE, ...selection }))) });
    report.totalTiles += cells;
  }
  for (const collection of collections) for (const style of styles) {
    if (wanted('pairwise')) for (let a = 0; a < CATEGORY_ORDER.length; a++) for (let b = a + 1; b < CATEGORY_ORDER.length; b++) {
      const rowCategory = CATEGORY_ORDER[a], columnCategory = CATEGORY_ORDER[b];
      const showTop = [rowCategory, columnCategory].includes('top') && ![rowCategory, columnCategory].includes('jacket');
      sheet({ group: 'pairwise', collection, style, id: `${rowCategory}-${columnCategory}`, title: `${rowCategory} × ${columnCategory}`,
        rows: OPTIONS[rowCategory].map(index => itemName(collection, rowCategory, index)),
        columns: OPTIONS[columnCategory].map(index => itemName(collection, columnCategory, index)),
        selections: OPTIONS[rowCategory].map(row => OPTIONS[columnCategory].map(column => ({ ...(showTop ? { jacket: null } : {}), [rowCategory]: row, [columnCategory]: column }))),
        note: style === 'chibi' && [rowCategory, columnCategory].some(category => ['bottom', 'shoes'].includes(category)) ? 'Bottom/shoe choices are intentionally invisible in the legless chibi.' : undefined });
    }
    if (wanted('head')) for (const [animation, frame] of POSES[style]) for (const accessory of OPTIONS.accessory) {
      sheet({ group: 'head', collection, style, animation, frame, id: `accessory-${accessory ?? 'none'}`,
        title: `All hair × hat combinations · ${itemName(collection, 'accessory', accessory)}`,
        rows: OPTIONS.hair.map(index => itemName(collection, 'hair', index)), columns: OPTIONS.hat.map(index => itemName(collection, 'hat', index)),
        selections: OPTIONS.hair.map(hair => OPTIONS.hat.map(hat => ({ hair, hat, accessory }))),
        crop: style === 'big' ? [45, 0, 170, 140] : [12, 0, 232, 204], scale: style === 'big' ? 2 : 1 });
    }
    if (wanted('outfit') && style === 'big') for (const [animation, frame] of POSES.big)
      for (const top of OPTIONS.top) for (const jacket of OPTIONS.jacket) for (const accessory of OPTIONS.accessory) {
        sheet({ group: 'outfit', collection, style, animation, frame, id: `top-${top}-jacket-${jacket ?? 'none'}-accessory-${accessory ?? 'none'}`,
          title: `${itemName(collection, 'top', top)} + ${itemName(collection, 'jacket', jacket)} + ${itemName(collection, 'accessory', accessory)} · every bottom × shoe`,
          rows: OPTIONS.bottom.map(index => itemName(collection, 'bottom', index)), columns: OPTIONS.shoes.map(index => itemName(collection, 'shoes', index)),
          selections: OPTIONS.bottom.map(bottom => OPTIONS.shoes.map(shoes => ({ top, jacket, bottom, shoes, accessory }))) });
      }
    if (wanted('outfit') && style === 'chibi') for (const [animation, frame] of POSES.chibi) for (const accessory of OPTIONS.accessory) {
      sheet({ group: 'outfit', collection, style, animation, frame, id: `top-jacket-accessory-${accessory ?? 'none'}`, title: `Every top × jacket · ${itemName(collection, 'accessory', accessory)}`,
        rows: OPTIONS.top.map(index => itemName(collection, 'top', index)), columns: OPTIONS.jacket.map(index => itemName(collection, 'jacket', index)),
        selections: OPTIONS.top.map(top => OPTIONS.jacket.map(jacket => ({ top, jacket, accessory }))),
        note: 'Lower-body permutations are excluded from this action grid because chibi renders no bottoms or shoes.' });
    }
    if (wanted('seams') && style === 'big') for (const [animation, frame] of POSES.big) {
      sheet({ group: 'seams', collection, style, animation, frame, id: 'waist', title: 'Waist close-up · every top × bottom, no jacket',
        rows: OPTIONS.top.map(index => itemName(collection, 'top', index)), columns: OPTIONS.bottom.map(index => itemName(collection, 'bottom', index)),
        selections: OPTIONS.top.map(top => OPTIONS.bottom.map(bottom => ({ top, bottom, jacket: null }))), crop: [72, 172, 122, 70], scale: 3 });
      sheet({ group: 'seams', collection, style, animation, frame, id: 'ankle', title: 'Ankle close-up · every bottom × shoe',
        rows: OPTIONS.bottom.map(index => itemName(collection, 'bottom', index)), columns: OPTIONS.shoes.map(index => itemName(collection, 'shoes', index)),
        selections: OPTIONS.bottom.map(bottom => OPTIONS.shoes.map(shoes => ({ bottom, shoes }))), crop: [64, 310, 140, 70], scale: 3 });
    }
    console.log(`Rendered ${collection}/${style}: ${report.sheets.length} sheets so far`);
  }
  const waist = collections.flatMap(collection => POSES.big.flatMap(([animation, frame]) => {
    const jeansIndex = collection === 'girl' ? 1 : 2;
    const jeans = waistPixels(collection, jeansIndex, animation, frame);
    return OPTIONS.bottom.map(index => ({ collection, animation, frame, index, name: itemName(collection, 'bottom', index),
      ...waistPixels(collection, index, animation, frame), jeansWidth: jeans.width,
      ratioToJeans: waistPixels(collection, index, animation, frame).width / jeans.width }));
  }));
  report.overviews = [];
  const overviewDirectory = resolve(directory, 'overviews');
  mkdirSync(overviewDirectory, { recursive: true });
  for (const collection of collections) for (const style of styles) for (const group of ['pairwise', 'head', 'outfit', 'seams']) {
    const sheets = report.sheets.filter(sheet => sheet.collection === collection && sheet.style === style && sheet.group === group);
    for (let start = 0; start < sheets.length; start += 9) {
      const batch = sheets.slice(start, start + 9);
      const thumbs = batch.map(sheet => {
        const source = decodePng(resolve(directory, sheet.file));
        const image = new Image(360, Math.round(source.h * 360 / source.w));
        affine(image, source, { width: image.w, height: image.h });
        return image;
      });
      const rows = Array.from({ length: Math.ceil(thumbs.length / 3) }, (_, row) => thumbs.slice(row * 3, row * 3 + 3));
      const file = `overviews/${collection}-${style}-${group}-${Math.floor(start / 9) + 1}.png`;
      writeGrid(resolve(directory, file), rows, { bg: '#ffffff', gap: 12 });
      report.overviews.push({ file, collection, style, group, sheets: batch.map(sheet => sheet.file), columns: 3 });
    }
  }
  report.countsByGroup = Object.fromEntries(['pairwise', 'head', 'outfit', 'seams'].map(group => {
    const sheets = report.sheets.filter(sheet => sheet.group === group);
    return [group, { sheets: sheets.length, renderedTiles: sheets.reduce((sum, sheet) => sum + sheet.cells, 0) }];
  }));
  writeFileSync(resolve(directory, 'waist-metrics.json'), JSON.stringify(waist, null, 2) + '\n');
  writeFileSync(resolve(directory, 'coverage.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(resolve(directory, 'index.html'), htmlIndex(report));
  console.log(JSON.stringify({ directory, sheets: report.sheets.length, renderedTiles: report.totalTiles, scope: report.scope }));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = Object.fromEntries(process.argv.slice(2).map(argument => {
    if (!/^--(?:output|section|collection|style)=/.test(argument)) throw new Error(`Unknown option ${argument}`);
    const index = argument.indexOf('=');
    return [argument.slice(2, index), argument.slice(index + 1)];
  }));
  buildPairwiseQa(options);
}
