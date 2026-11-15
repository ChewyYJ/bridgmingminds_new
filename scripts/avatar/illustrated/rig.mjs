import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Image } from '../lib/render.mjs';
import { SKIN, HAIR, EYES } from '../lib/palettes.mjs';
import { decodePng, crop, trim, masked, affine, recolor, largestComponent } from './raster.mjs';
import { MEAL_ACTIONS, getMealLayout, solveMealArm, renderMealProps } from './meals.mjs';
export { getMealLayout } from './meals.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const cache = new Map();
const cellCache = new Map();
const SLOTS = ['accBack', 'hairBack', 'armFar', 'armNear', 'sleeveFar', 'legFar', 'shoeFar', 'pantFar',
  'legNear', 'shoeNear', 'pantNear', 'torso', 'bottom', 'top', 'outer', 'accMid',
  'sleeveNear', 'head', 'face', 'accFace', 'hairFront', 'accHead', 'hat',
  'foreFar', 'foreSleeveFar', 'foreNear', 'foreSleeveNear', 'handFar', 'propFront', 'handNear', 'fx'];
export const STYLES = {
  big: { width: 256, height: 384, W: 256, H: 384, slots: SLOTS, SLOTS, pivot: [128, 367], animations: ['idle', 'walk'] },
  chibi: { width: 256, height: 256, W: 256, H: 256, slots: SLOTS, SLOTS, pivot: [128, 245], animations: ['idle', 'greet', 'speak', 'celebrate', 'eat', 'eatOnigiri', 'eatBento'] },
};

function source(collection) {
  if (!cache.has(collection)) cache.set(collection, decodePng(resolve(ROOT, `assets/avatar/illustrated-v2/source/${collection}-kit.png`)));
  return cache.get(collection);
}

function cell(collection, number) {
  const key = `${collection}/${number}`;
  if (!cellCache.has(key)) {
    const sheet = source(collection), size = Math.round(sheet.w / 6);
    const col = number % 6, row = Math.floor(number / 6);
    const skip = row === 3 && col < 3 ? Math.round(size * 0.125) : 0;
    const extension = row === 2 && col < 3 ? Math.round(size * 0.125) : number === 23 ? Math.round(size * 0.04) : 0;
    let artwork = trim(crop(sheet, col * size, row * size + skip, size, size - skip + extension));
    if (number >= 0 && number <= 2 || number >= 12 && number <= 14)
      artwork = trim(largestComponent(artwork));
    cellCache.set(key, artwork);
  }
  return cellCache.get(key);
}

function horizontalSpan(image, fraction) {
  const y = Math.round(Math.max(0.025, Math.min(0.97, fraction)) * (image.h - 1));
  let left = image.w, right = -1;
  for (let x = 0; x < image.w; x++) if (image.d[(y * image.w + x) * 4 + 3] >= 96) {
    left = Math.min(left, x); right = x;
  }
  return { center: (left + right + 1) / (2 * image.w), width: Math.max(1, right - left + 1) / image.w };
}

// Fit the actual painted upper fabric to a common pelvis. This changes the
// waistband/hip silhouette, not the lower leg or skirt hem, and retains all
// pleats, pockets and shading through premultiplied horizontal interpolation.
function fittedBottom(collection, index) {
  const key = `waist-fit/${collection}/${index}`;
  if (!cellCache.has(key)) {
    const original = cell(collection, 12 + index);
    const referenceIndex = collection === 'girl' ? 1 : 2;
    if (index === referenceIndex) cellCache.set(key, original);
    else {
      const reference = cell(collection, 12 + referenceIndex), result = new Image(original.w, original.h);
      for (let y = 0; y < original.h; y++) {
        const v = y / (original.h - 1), blend = Math.max(0, Math.min(1, (v - 0.16) / 0.27));
        const weight = 1 - blend * blend * (3 - 2 * blend);
        const from = horizontalSpan(original, v), to = horizontalSpan(reference, v);
        const sourceCenter = from.center * original.w;
        const targetCenter = (from.center + (to.center - from.center) * weight) * original.w;
        // A pleated skirt should flare continuously from the fitted waistband,
        // rather than inherit the jeans' wider hip and narrower thigh profile.
        const skirtWaist = horizontalSpan(reference, 0.05).width;
        const skirtWidth = skirtWaist + (1 - skirtWaist) * Math.pow(v, 0.9);
        const scale = collection === 'girl' && index === 2
          ? skirtWidth / horizontalSpan(original, v).width
          : 1 + (to.width / from.width - 1) * weight;
        for (let x = 0; x < original.w; x++) {
          const u = (x + 0.5 - targetCenter) / scale + sourceCenter - 0.5;
          const left = Math.floor(u), fraction = u - left;
          let alpha = 0, red = 0, green = 0, blue = 0;
          for (let dx = 0; dx < 2; dx++) {
            const sx = left + dx;
            if (sx < 0 || sx >= original.w) continue;
            const offset = (y * original.w + sx) * 4, a = original.d[offset + 3] * (dx ? fraction : 1 - fraction);
            alpha += a; red += original.d[offset] * a; green += original.d[offset + 1] * a; blue += original.d[offset + 2] * a;
          }
          if (alpha > 0.1) result.d.set([Math.round(red / alpha), Math.round(green / alpha), Math.round(blue / alpha), Math.round(alpha)], (y * original.w + x) * 4);
        }
      }
      cellCache.set(key, result);
    }
  }
  return cellCache.get(key);
}

function smoothStep(start, end, value) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function wideTrouserLegs(bottom) {
  const key = 'girl-wide-trouser-legs';
  if (!cellCache.has(key)) {
    const gaps = [];
    for (let y = Math.floor(bottom.h * 0.3); y < bottom.h; y++) {
      for (let x = 1; x < bottom.w - 1; x++) {
        if (bottom.d[(y * bottom.w + x) * 4 + 3] >= 64) continue;
        const left = x;
        while (x < bottom.w - 1 && bottom.d[(y * bottom.w + x) * 4 + 3] < 64) x++;
        const right = x - 1, middle = (left + right + 1) / 2;
        if (middle > bottom.w * 0.3 && middle < bottom.w * 0.75 &&
          bottom.d[(y * bottom.w + left - 1) * 4 + 3] >= 64 && bottom.d[(y * bottom.w + x) * 4 + 3] >= 64) {
          gaps.push({ y, middle }); break;
        }
      }
    }
    const dividers = new Float64Array(bottom.h).fill(bottom.w * 0.5);
    if (gaps.length) {
      const points = [{ y: bottom.h * 0.3, middle: bottom.w * 0.5 }, ...gaps, { y: bottom.h - 1, middle: gaps.at(-1).middle }];
      let at = 0;
      for (let y = Math.ceil(bottom.h * 0.3); y < bottom.h; y++) {
        while (at < points.length - 2 && points[at + 1].y < y) at++;
        const a = points[at], b = points[at + 1], t = (y - a.y) / Math.max(1, b.y - a.y);
        dividers[y] = a.middle + (b.middle - a.middle) * Math.max(0, Math.min(1, t));
      }
    }
    cellCache.set(key, {
      far: masked(bottom, (x, y) => x >= dividers[y]),
      near: masked(bottom, (x, y) => x < dividers[y] + (y < bottom.h * 0.3 ? 2 : 0)),
    });
  }
  return cellCache.get(key);
}

// Inverse-sample one continuous painted garment surface. The waist remains
// stationary, hip rotation eases in down the thigh, and knee rotation blends
// across the joint. There is no cut horizontal panel or overlapping shorts edge.
function paintWaistWeighted(target, sourceImage, rect, angle, bend, jointX) {
  const [x, y, width, height] = rect;
  const hipX = x + width * jointX, hipY = y;
  const radians = angle * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
  const kneeX = hipX - s * height * 0.54, kneeY = hipY + c * height * 0.54;
  const forward = (px, py) => {
    const v = (py - y) / height;
    const dx = px - hipX, dy = py - hipY;
    const upperX = hipX + c * dx - s * dy, upperY = hipY + s * dx + c * dy;
    const bendRadians = bend * smoothStep(0.46, 0.62, v) * Math.PI / 180;
    const bc = Math.cos(bendRadians), bs = Math.sin(bendRadians);
    const bentX = kneeX + bc * (upperX - kneeX) - bs * (upperY - kneeY);
    const bentY = kneeY + bs * (upperX - kneeX) + bc * (upperY - kneeY);
    const weight = smoothStep(0.06, 0.34, v);
    return [px + (bentX - px) * weight, py + (bentY - py) * weight];
  };
  const left = Math.max(0, Math.floor(x - 45)), right = Math.min(target.w, Math.ceil(x + width + 45));
  const top = Math.max(0, Math.floor(y - 8)), bottom = Math.min(target.h, Math.ceil(y + height + 25));
  for (let yy = top; yy < bottom; yy++) for (let xx = left; xx < right; xx++) {
    const qx = xx + 0.5, qy = yy + 0.5;
    let px = qx, py = qy;
    for (let iteration = 0; iteration < 8; iteration++) {
      const [fx, fy] = forward(px, py), ex = qx - fx, ey = qy - fy;
      px += ex; py += ey;
      if (Math.abs(ex) + Math.abs(ey) < 0.015) break;
    }
    const u = (px - x) / width * sourceImage.w - 0.5, v = (py - y) / height * sourceImage.h - 0.5;
    const sx = Math.floor(u), sy = Math.floor(v), fractionX = u - sx, fractionY = v - sy;
    let alpha = 0, red = 0, green = 0, blue = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const sampleX = sx + dx, sampleY = sy + dy;
      if (sampleX < 0 || sampleY < 0 || sampleX >= sourceImage.w || sampleY >= sourceImage.h) continue;
      const i = (sampleY * sourceImage.w + sampleX) * 4;
      const a = sourceImage.d[i + 3] * (dx ? fractionX : 1 - fractionX) * (dy ? fractionY : 1 - fractionY);
      alpha += a; red += sourceImage.d[i] * a; green += sourceImage.d[i + 1] * a; blue += sourceImage.d[i + 2] * a;
    }
    if (alpha > 0.1) target.blend((yy * target.w + xx) * 4, Math.round(red / alpha), Math.round(green / alpha), Math.round(blue / alpha), Math.round(alpha));
  }
}

/** Stable garment anchors for pixel-based fit and coverage tests. */
export function getGarmentLayout({ style, collection, animation = 'idle', frame = 0 }) {
  const box = boxes(style, pose(style, animation, frame));
  return { shirtRect: box.shirt, jacketRect: box.jacket,
    bottomRect: style === 'big' ? box.bottom : null,
    waistY: style === 'big' ? box.bottom[1] : null,
    hipY: style === 'big' ? box.bottom[1] + box.bottom[3] * 0.22 : null,
    referenceBottomIndex: collection === 'girl' ? 1 : 2 };
}

function detail(number) {
  const key = `detail/${number}`;
  if (!cellCache.has(key)) {
    if (!cache.has('details')) cache.set('details', decodePng(resolve(ROOT, 'assets/avatar/illustrated-v2/source/details-kit.png')));
    const sheet = cache.get('details'), size = Math.round(sheet.w / 6);
    cellCache.set(key, trim(crop(sheet, number % 6 * size, Math.floor(number / 6) * size, size, size)));
  }
  return cellCache.get(key);
}

function faceCell(collection, column) {
  const key = `pixel-face/${collection}/${column}`;
  if (!cellCache.has(key)) {
    if (!cache.has('pixel-faces')) cache.set('pixel-faces', decodePng(resolve(ROOT, 'assets/avatar/illustrated-v2/source/pixel-faces-v3.png')));
    const sheet = cache.get('pixel-faces');
    const left = Math.floor(column * sheet.w / 7), right = Math.floor((column + 1) * sheet.w / 7);
    const top = collection === 'girl' ? 0 : Math.floor(sheet.h / 2);
    const height = Math.floor(sheet.h / 2);
    cellCache.set(key, trim(largestComponent(crop(sheet, left, top, right - left, height))));
  }
  return cellCache.get(key);
}

// Expressions replace only interior facial paint. The neutral skull, ear,
// jaw and neck are identical in every frame, including the alpha silhouette.
function registeredHead(collection, style, expression) {
  const neutralColumn = style === 'big' ? 0 : 2;
  const key = `registered-face/${collection}/${style}/${expression}`;
  if (!cellCache.has(key)) {
    const neutral = faceCell(collection, neutralColumn);
    if (expression === neutralColumn) cellCache.set(key, neutral);
    else {
      const alternate = faceCell(collection, expression);
      const normalized = new Image(neutral.w, neutral.h);
      affine(normalized, alternate, { width: neutral.w, height: neutral.h });
      const result = new Image(neutral.w, neutral.h);
      result.d.set(neutral.d);
      for (let y = 0; y < neutral.h; y++) for (let x = 0; x < neutral.w; x++) {
        const u = x / neutral.w, v = y / neutral.h;
        const eyePatch = u > 0.35 && u < 0.985 && v > (style === 'big' ? 0.29 : 0.33) && v < (style === 'big' ? 0.61 : 0.68);
        const mouthPatch = u > 0.55 && u < 0.93 && v > (style === 'big' ? 0.60 : 0.63) && v < 0.83;
        const i = (y * neutral.w + x) * 4;
        if ((eyePatch || mouthPatch) && neutral.d[i + 3] === 255 && normalized.d[i + 3] > 230)
          result.d.set(normalized.d.subarray(i, i + 3), i);
      }
      cellCache.set(key, result);
    }
  }
  return cellCache.get(key);
}

function transformPoint(point, transform) {
  const [x, y] = point, [px, py] = transform.pivot;
  const radians = transform.angle * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
  return [px + c * (x - px) - s * (y - py) + transform.translation[0],
    py + s * (x - px) + c * (y - py) + transform.translation[1]];
}

function eyewearLandmarks(collection) {
  const key = `eyewear-landmarks/${collection}`;
  if (!cellCache.has(key)) {
    const glasses = cell(collection, 18), seen = new Uint8Array(glasses.w * glasses.h), holes = [];
    for (let start = 0; start < seen.length; start++) {
      if (seen[start] || glasses.d[start * 4 + 3] >= 128) continue;
      const points = [start]; seen[start] = 1;
      let edge = false, sx = 0, sy = 0;
      for (let at = 0; at < points.length; at++) {
        const point = points[at], x = point % glasses.w, y = Math.floor(point / glasses.w);
        sx += x; sy += y;
        if (x === 0 || y === 0 || x === glasses.w - 1 || y === glasses.h - 1) edge = true;
        for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (xx < 0 || yy < 0 || xx >= glasses.w || yy >= glasses.h) continue;
          const next = yy * glasses.w + xx;
          if (!seen[next] && glasses.d[next * 4 + 3] < 128) { seen[next] = 1; points.push(next); }
        }
      }
      if (!edge && points.length > 16) holes.push({ size: points.length, center: [sx / points.length, sy / points.length] });
    }
    const lenses = holes.sort((a, b) => b.size - a.size).slice(0, 2).sort((a, b) => a.center[0] - b.center[0]);
    if (lenses.length !== 2) throw new Error(`Could not register both ${collection} glasses lenses`);
    cellCache.set(key, { near: lenses[0].center, far: lenses[1].center });
  }
  return cellCache.get(key);
}

function headphoneParts(collection) {
  const key = `headphone-parts/${collection}`;
  if (!cellCache.has(key)) {
    const image = cell(collection, 19);
    cellCache.set(key, {
      band: trim(masked(image, (_x, y) => y < image.h * 0.48)),
      near: trim(masked(image, (x, y) => x < image.w * 0.49 && y >= image.h * 0.44)),
      far: trim(masked(image, (x, y) => x >= image.w * 0.49 && y >= image.h * 0.45)),
    });
  }
  return cellCache.get(key);
}

/** Shared anatomical registration for every head-mounted raster attachment.
 * Rectangles and canonicalAnchors are in the neutral canvas coordinate system;
 * anchors are their posed positions. This is also the public QA contract.
 */
export function getAttachmentLayout({ style, collection, animation = 'idle', frame = 0, hairIndex = 0, hatIndex = 0 }) {
  const p = pose(style, animation, frame), neutral = boxes(style, { bob: 0 });
  const chibi = style === 'chibi';
  const headRect = chibi && collection === 'girl' ? [74, 68, 118, 110] : neutral.head;
  const [x, y, w, h] = headRect;
  const neckPivot = chibi ? [130, 176] : [130, 108];
  let angle = Math.sin(p.phase) * (chibi ? 1.8 : 1.5);
  let dx = Math.sin(p.phase) * (chibi ? 0.9 : 0.5), dy = p.bob;
  if (p.walk) { angle = -Math.sin(p.phase) * 2.4; dx = Math.sin(p.phase) * 0.8; }
  if (p.reaction === 'greet') angle = -3 + Math.sin(p.phase * 2) * 1.8;
  if (p.reaction === 'speak') angle = Math.sin(p.phase) * 2.8;
  if (p.reaction === 'celebrate') { angle = Math.sin(p.phase) * 3; dy -= Math.abs(Math.sin(p.phase)) * 2; }
  if (p.reaction === 'eat') { angle = 2 + Math.sin(p.phase) * 1.2; dx += 0.7; }
  const headTransform = { pivot: neckPivot, translation: [dx, dy], angle };
  // Measured centres of the actual painted pupil components in the neutral
  // face atlas, excluding the outer face contour and eyebrow pixels.
  const pupils = collection === 'girl'
    ? chibi ? [[0.50007, 0.55604], [0.84129, 0.50633]] : [[0.52991, 0.49422], [0.88047, 0.46805]]
    : chibi ? [[0.49598, 0.55735], [0.83452, 0.50247]] : [[0.53946, 0.46792], [0.89157, 0.44539]];
  const canonicalAnchors = {
    neck: neckPivot, crown: [x + w * 0.5, y + h * 0.04],
    skull: [x + w * 0.5, y + h * 0.35],
    nearEar: [x + w * 0.17, y + h * (chibi ? 0.67 : 0.63)],
    farEar: [x + w * 0.98, y + h * (chibi ? 0.63 : 0.59)],
    nearEye: [x + w * pupils[0][0], y + h * pupils[0][1]],
    farEye: [x + w * pupils[1][0], y + h * pupils[1][1]],
  };
  // Each painted cut is fitted by its forehead opening, rather than expanded
  // to the same silhouette. Girl fits preserve the native artwork's aspect.
  const hairFits = collection === 'girl'
    ? chibi ? [[36, 26, 174, 158], [39, 34, 164, 134], [30, 22, 171, 164]]
      : [[83, 22, 91, 86], [85, 26, 88, 73], [76, 18, 90, 87]]
    : chibi ? [[43, 31, 170.52, 123.97], [43, 31, 170.52, 123.97], [43, 31, 170.52, 123.97]]
      : [[84, 24, 89.18, 70.07], [84, 24, 89.18, 70.07], [84, 24, 89.18, 70.07]];
  const hairRect = [...hairFits[hairIndex]];
  const hat = cell(collection, 3 + hatIndex);
  const brimRatio = collection === 'girl' ? [0.78, 0.78, 0.44][hatIndex] : [0.75, 0.80, 0.61][hatIndex];
  const brimY = y + h * 0.22, topMargin = chibi ? 8 : 5;
  const hatWidth = Math.min(chibi ? 165 : 87, (brimY - topMargin) / brimRatio * hat.w / hat.h);
  const hatHeight = hatWidth * hat.h / hat.w;
  const hatRect = [130 - hatWidth * 0.5, brimY - hatHeight * brimRatio, hatWidth, hatHeight];
  const glasses = cell(collection, 18), lenses = eyewearLandmarks(collection);
  const sourceDelta = [lenses.far[0] - lenses.near[0], lenses.far[1] - lenses.near[1]];
  const targetDelta = [canonicalAnchors.farEye[0] - canonicalAnchors.nearEye[0], canonicalAnchors.farEye[1] - canonicalAnchors.nearEye[1]];
  const glassesScale = Math.hypot(...targetDelta) / Math.hypot(...sourceDelta);
  const glassesAngle = (Math.atan2(targetDelta[1], targetDelta[0]) - Math.atan2(sourceDelta[1], sourceDelta[0])) * 180 / Math.PI;
  const glassesRect = [canonicalAnchors.nearEye[0] - lenses.near[0] * glassesScale, canonicalAnchors.nearEye[1] - lenses.near[1] * glassesScale, glasses.w * glassesScale, glasses.h * glassesScale];
  const parts = headphoneParts(collection), nearHeight = h * 0.29, farHeight = h * 0.25;
  const nearWidth = nearHeight * parts.near.w / parts.near.h, farWidth = farHeight * parts.far.w / parts.far.h;
  const nearCup = [canonicalAnchors.nearEar[0] - nearWidth * 0.5, canonicalAnchors.nearEar[1] - nearHeight * 0.5, nearWidth, nearHeight];
  const farCup = [canonicalAnchors.farEar[0] - farWidth * 0.5, canonicalAnchors.farEar[1] - farHeight * 0.5, farWidth, farHeight];
  const bandTop = y - h * (chibi ? 0.22 : 0.16), bandBottom = canonicalAnchors.nearEar[1] - nearHeight * 0.25;
  const headphoneRect = [canonicalAnchors.nearEar[0] - 3, bandTop, canonicalAnchors.farEar[0] - canonicalAnchors.nearEar[0] + 6, bandBottom - bandTop];
  const bag = cell(collection, 20), bagHeight = chibi ? 80 : 98, bagWidth = bagHeight * bag.w / bag.h;
  const bagRect = [(chibi ? 173 : 158) - bagWidth * 0.91, (chibi ? 178 : 110) + p.bob, bagWidth, bagHeight];
  return { headRect, neckPivot, headTransform, canonicalAnchors,
    anchors: Object.fromEntries(Object.entries(canonicalAnchors).map(([name, point]) => [name, transformPoint(point, headTransform)])),
    hairRect, hatRect, accessoryRects: { glasses: glassesRect, headphones: headphoneRect, bag: bagRect },
    glassesFit: { sourceLensCenters: lenses, scale: glassesScale, angle: glassesAngle, lensCenters: [canonicalAnchors.nearEye, canonicalAnchors.farEye] },
    headphoneFit: { bandRect: headphoneRect, nearCupRect: nearCup, farCupRect: farCup, nearCupHeightRatio: 0.29 },
    torsoRect: boxes(style, p).jacket };
}

function transformBox(sourceImage, targetBox, angle = 0, anchorX = 0.5, anchorY = 0) {
  return { x: targetBox[0], y: targetBox[1], width: targetBox[2], height: targetBox[3], angle, anchorX, anchorY };
}

function pose(style, animation, frame) {
  const f = ((frame % 8) + 8) % 8;
  const walk = style === 'big' && animation === 'walk';
  const phase = f / 8 * Math.PI * 2;
  const bob = walk ? -Math.abs(Math.sin(phase * 2)) * 1.2 : Math.sin(phase) * 0.6;
  const reaction = style === 'chibi' ? MEAL_ACTIONS[animation] ? 'eat' : animation : 'idle';
  return { f, phase, walk, bob, reaction,
    armNear: walk ? Math.sin(phase) * 9 : reaction === 'greet' ? 80 + Math.sin(phase * 2) * 4 : reaction === 'celebrate' ? 115 + Math.sin(phase) * 5 : reaction === 'speak' ? 18 + Math.sin(phase) * 4 : 0,
    armFar: walk ? -Math.sin(phase) * 9 : reaction === 'celebrate' ? -115 + Math.sin(phase) * 5 : 0,
    foreNear: reaction === 'greet' ? 75 + Math.sin(phase * 2) * 12 : reaction === 'celebrate' ? 45 : 0,
    foreFar: reaction === 'celebrate' ? -45 : 0,
    legNear: walk ? -Math.sin(phase) * 7 : 0,
    legFar: walk ? Math.sin(phase) * 7 : 0,
    kneeNear: walk ? Math.max(0, Math.sin(phase)) * 18 : 0,
    kneeFar: walk ? Math.max(0, -Math.sin(phase)) * 18 : 0,
  };
}

function boxes(style, p) {
  if (style === 'big') return {
    head: [103, 35 + p.bob, 61, 79], hair: [84, 24 + p.bob, 91, 91],
    shirt: [88, 99 + p.bob, 80, 105], jacket: [81, 95 + p.bob, 94, 114],
    bottom: [94, 191 + p.bob, 69, 160], shoes: [93, 338, 77, 31],
    arms: [87, 106 + p.bob, 86, 116], hat: [86, 20 + p.bob, 91, 52],
  };
  return {
    head: [65, 64 + p.bob, 130, 116], hair: [43, 31 + p.bob, 174, 161],
    shirt: [75, 173 + p.bob, 110, 80], jacket: [68, 170 + p.bob, 124, 86],
    arms: [66, 178 + p.bob, 130, 76], hat: [49, 29 + p.bob, 169, 71],
  };
}

/** Every result is a fresh full-canvas RGBA layer using the actual painted art. */
export function renderVariant({ style, collection, category, index = 0, palette = 'default', hatted = false, animation = 'idle', frame = 0 }) {
  const config = STYLES[style];
  if (!config) throw new Error(`Unknown illustrated style ${style}`);
  if (!['boy', 'girl'].includes(collection)) throw new Error(`Unknown illustrated collection ${collection}`);
  const p = pose(style, animation, frame), box = boxes(style, p), layers = {};
  const meal = style === 'chibi' ? getMealLayout(animation, frame) : null;
  const attachment = getAttachmentLayout({ style, collection, animation, frame, hairIndex: index, hatIndex: index });
  const layer = slot => layers[slot] ??= new Image(config.width, config.height);
  const draw = (slot, image, rect, angle = 0, anchorX = 0.5, anchorY = 0) =>
    affine(layer(slot), image, transformBox(image, rect, angle, anchorX, anchorY));
  const drawHead = (slot, image, rect) => {
    const { pivot, translation, angle } = attachment.headTransform;
    draw(slot, image, [rect[0] + translation[0], rect[1] + translation[1], rect[2], rect[3]], angle,
      (pivot[0] - rect[0]) / rect[2], (pivot[1] - rect[1]) / rect[3]);
  };
  const lowerTransform = (rect, angle, rootX, rootY, jointX, jointY, bend) => {
    const sx = rect[0] + rect[2] * rootX, sy = rect[1] + rect[3] * rootY;
    const ex = rect[0] + rect[2] * jointX, ey = rect[1] + rect[3] * jointY;
    const radians = angle * Math.PI / 180;
    const qx = sx + Math.cos(radians) * (ex - sx) - Math.sin(radians) * (ey - sy);
    const qy = sy + Math.sin(radians) * (ex - sx) + Math.cos(radians) * (ey - sy);
    return { rect: [rect[0] + qx - ex, rect[1] + qy - ey, rect[2], rect[3]], angle: angle + bend, jointX, jointY, delta: [qx - ex, qy - ey] };
  };
  const articulated = (slot, foreSlot, image, rect, angle, rootX, rootY, jointX, jointY, bend) => {
    if (!bend && slot === foreSlot) return draw(slot, image, rect, angle, rootX, rootY);
    const overlap = Math.max(3, image.h * 0.045);
    const upper = masked(image, (_x, y) => y <= image.h * jointY + overlap);
    const lower = masked(image, (_x, y) => y >= image.h * jointY - overlap);
    draw(slot, upper, rect, angle, rootX, rootY);
    const t = lowerTransform(rect, angle, rootX, rootY, jointX, jointY, bend);
    draw(foreSlot, lower, t.rect, t.angle, jointX, jointY);
  };
  const posedPoint = (rect, angle, rootX, rootY, jointX, jointY, bend, pointX, pointY) => {
    const t = lowerTransform(rect, angle, rootX, rootY, jointX, jointY, bend);
    const ex = t.rect[0] + t.rect[2] * jointX, ey = t.rect[1] + t.rect[3] * jointY;
    const dx = (pointX - jointX) * rect[2], dy = (pointY - jointY) * rect[3];
    const r = t.angle * Math.PI / 180;
    return [ex + Math.cos(r) * dx - Math.sin(r) * dy, ey + Math.sin(r) * dx + Math.cos(r) * dy];
  };
  const part = number => cell(collection, number);
  if (category === 'body' || category === 'eyes') {
    let headNumber = style === 'big' ? (p.f === 5 ? 1 : 0) : p.f === 5 ? 3 : 2;
    if (style === 'chibi') {
      if (p.reaction === 'speak' && [1, 2, 4, 6].includes(p.f)) headNumber = 4;
      if (p.reaction === 'celebrate' || p.reaction === 'greet') headNumber = 5;
      if (p.reaction === 'eat') headNumber = p.f < 2 ? 2 : 6;
    }
    const head = registeredHead(collection, style, headNumber);
    if (category === 'eyes') {
      if ([1, 3, 5, 6].includes(headNumber)) return layers;
      const iris = masked(head, (x, y) => {
        const u = x / head.w, v = y / head.h;
        const inEye = (u > 0.42 && u < 0.68 || u > 0.79 && u < 0.96) && v > (style === 'big' ? 0.36 : 0.43) && v < (style === 'big' ? 0.59 : 0.67);
        const i = (y * head.w + x) * 4;
        return inEye && head.d[i] < 125 && head.d[i + 1] < 110 && head.d[i + 2] < 110;
      });
      const color = EYES[palette]?.[3];
      drawHead('face', recolor(iris, color, 'hair'), attachment.headRect);
      return layers;
    }
    const tint = palette === 'peach' || palette === 'default' ? null : SKIN[palette]?.[3];
    drawHead('head', recolor(head, tint, 'skin'), attachment.headRect);
    const arms = recolor(part(23), tint, 'skin');
    const replaceHands = style === 'chibi' && ['greet', 'celebrate', 'eat'].includes(p.reaction);
    const left = masked(arms, (x, y) => x < arms.w * 0.5 && (!replaceHands || y < arms.h * 0.84));
    const right = masked(arms, (x, y) => x >= arms.w * 0.5 && (!replaceHands || y < arms.h * 0.84));
    const farArm = meal ? solveMealArm(box.arms, false, meal) : { angle: p.armFar, bend: p.foreFar };
    const nearArm = meal ? solveMealArm(box.arms, true, meal) : { angle: p.armNear, bend: p.foreNear };
    articulated('armFar', farArm.bend ? 'foreFar' : 'armFar', right, box.arms, farArm.angle, 0.74, 0.04, 0.82, 0.55, farArm.bend);
    articulated('armNear', nearArm.bend ? 'foreNear' : 'armNear', left, box.arms, nearArm.angle, 0.29, 0.04, 0.18, 0.55, nearArm.bend);
    if (style === 'chibi' && p.reaction === 'greet') {
      const wrist = posedPoint(box.arms, p.armNear, 0.29, 0.04, 0.18, 0.55, p.foreNear, 0.12, 0.87);
      draw('handNear', recolor(detail(6), tint, 'skin'), [wrist[0] - 11, wrist[1] - 30, 27, 35], Math.sin(p.phase * 2) * 8, 0.5, 0.88);
    }
    if (style === 'chibi' && p.reaction === 'speak') {
      const wrist = posedPoint(box.jacket, p.armNear, 0.32, 0.18, 0.2, 0.6, 0, 0.13, 0.97);
      // A small open palm overlaps the painted cuff and turns outward as an
      // explanatory gesture; its fingers stay inside the cropped bust canvas.
      draw('handNear', recolor(detail(6), tint, 'skin'), [wrist[0] - 11, wrist[1] - 25, 22, 28], -65 + Math.sin(p.phase) * 3, 0.5, 0.9);
    }
    if (style === 'chibi' && p.reaction === 'celebrate') {
      for (const [slot, number, side] of [['handNear', 7, 'Near'], ['handFar', 8, 'Far']]) {
        const near = side === 'Near';
        const wrist = posedPoint(box.arms, p[`arm${side}`], near ? 0.29 : 0.74, 0.04, near ? 0.18 : 0.82, 0.55, p[`fore${side}`], near ? 0.12 : 0.9, 0.87);
        draw(slot, recolor(detail(number), tint, 'skin'), [wrist[0] - 13, wrist[1] - 22, 27, 31]);
      }
    }
    if (meal) {
      if (meal.food === 'onigiri') {
        draw('handNear', recolor(detail(7), tint, 'skin'), [meal.nearWrist[0] - 10, meal.nearWrist[1] - 23, 20, 26], 12, 0.5, 0.88);
        draw('handFar', recolor(detail(8), tint, 'skin'), [meal.farWrist[0] - 10, meal.farWrist[1] - 23, 20, 26], -12, 0.5, 0.88);
      } else {
        draw('handNear', recolor(detail(9), tint, 'skin'), [meal.nearWrist[0] - 42 * 0.15, meal.nearWrist[1] - 25 * 0.85, 42, 25]);
        draw('handFar', recolor(detail(10), tint, 'skin'), meal.handRect, meal.handAngle, 0.88, 0.88);
      }
    }
    return layers;
  }
  if (category === 'hair') {
    const hair = recolor(part(index), palette === 'espresso' || palette === 'default' ? null : HAIR[palette]?.[3], 'hair');
    // Hats occlude the real hair silhouette through their own alpha. A generic
    // horizontal crop would chop a rear ponytail that extends beyond the brim.
    if (collection === 'girl') {
      const [hx, hy, hw, hh] = attachment.hairRect;
      const ear = attachment.canonicalAnchors.nearEar;
      const isBehindEar = (px, py) => hx + px / hair.w * hw < ear[0] + attachment.headRect[2] * 0.16 &&
        hy + py / hair.h * hh > ear[1] - attachment.headRect[3] * 0.13;
      drawHead('hairBack', masked(hair, isBehindEar), attachment.hairRect);
      drawHead('hairFront', masked(hair, (px, py) => !isBehindEar(px, py)), attachment.hairRect);
    } else drawHead('hairFront', hair, attachment.hairRect);
    return layers;
  }
  if (category === 'hat') {
    drawHead('hat', part(3 + index), attachment.hatRect);
    return layers;
  }
  if (category === 'top' || category === 'jacket') {
    const garment = part((category === 'top' ? 6 : 9) + index);
    const target = category === 'top' ? box.shirt : box.jacket;
    const isLong = category === 'jacket' || index === 2;
    const leftBoundary = y => garment.w * (isLong ? 0.36 - Math.max(0, y / garment.h - 0.18) * 0.12 : 0.34 - Math.max(0, y / garment.h - 0.12) * 0.13);
    const rightBoundary = y => garment.w * (isLong ? 0.72 + Math.max(0, y / garment.h - 0.18) * 0.1 : 0.75 + Math.max(0, y / garment.h - 0.12) * 0.16);
    const shortSleeveEnd = (collection === 'girl' ? [0.60, 0.62] : [0.62, 0.64])[index] ?? 0.62;
    const torso = masked(garment, (x, y) => x >= leftBoundary(y) && x <= rightBoundary(y) || y < garment.h * 0.12 || !isLong && y >= garment.h * (shortSleeveEnd - 0.025));
    const sleeveHeight = y => isLong || y <= garment.h * shortSleeveEnd;
    const nearSleeve = masked(garment, (x, y) => x < leftBoundary(y) + 2 && y >= garment.h * 0.1 && sleeveHeight(y));
    const farSleeve = masked(garment, (x, y) => x > rightBoundary(y) - 2 && y >= garment.h * 0.1 && sleeveHeight(y));
    draw(category === 'top' ? 'top' : 'outer', torso, target);
    const farArm = meal ? solveMealArm(target, false, meal, true) : { angle: p.armFar, bend: p.foreFar };
    const nearArm = meal ? solveMealArm(target, true, meal, true) : { angle: p.armNear, bend: p.foreNear };
    const farBend = isLong ? farArm.bend : 0, nearBend = isLong ? nearArm.bend : 0;
    articulated('sleeveFar', farBend ? 'foreSleeveFar' : 'sleeveFar', farSleeve, target, farArm.angle, 0.76, 0.18, 0.83, 0.6, farBend);
    articulated('sleeveNear', nearBend ? 'foreSleeveNear' : 'sleeveNear', nearSleeve, target, nearArm.angle, 0.32, 0.18, 0.2, 0.6, nearBend);
    return layers;
  }
  if (category === 'bottom') {
    if (style === 'chibi') return layers;
    const bottom = fittedBottom(collection, index);
    if (collection === 'girl' && index === 2) {
      paintWaistWeighted(layer('bottom'), bottom, box.bottom, p.walk ? Math.sin(p.phase) * 2 : 0, 0, 0.5);
    }
    else {
      // This source is asymmetrical: its transparent leg gap sits right of
      // centre. Following that gap prevents a strip of the near leg being
      // carried along with the far leg during a stride.
      const legs = collection === 'girl' && index === 0 ? wideTrouserLegs(bottom) : {
        far: masked(bottom, x => x >= bottom.w * 0.5), near: masked(bottom, x => x < bottom.w * 0.5 + 2),
      };
      paintWaistWeighted(layer('pantFar'), legs.far, box.bottom, p.legFar, p.kneeFar, 0.72);
      paintWaistWeighted(layer('pantNear'), legs.near, box.bottom, p.legNear, p.kneeNear, 0.25);
    }
    return layers;
  }
  if (category === 'shoes') {
    if (style === 'chibi') return layers;
    const shoes = detail(index + (collection === 'boy' ? 3 : 0));
    const boot = collection === 'girl' ? index === 2 : index === 1;
    const shoeHeight = boot ? 40 : 27;
    for (const [name, jointX, angle, bend] of [['Far', 0.72, p.legFar, p.kneeFar], ['Near', 0.25, p.legNear, p.kneeNear]]) {
      const ankleX = box.bottom[0] + box.bottom[2] * jointX;
      const rect = [ankleX - 13, 367 - shoeHeight + p.bob, 43, shoeHeight];
      const knee = lowerTransform(box.bottom, angle, jointX, 0, jointX, 0.54, bend);
      const kneeX = box.bottom[0] + box.bottom[2] * jointX, kneeY = box.bottom[1] + box.bottom[3] * 0.54;
      draw(`shoe${name}`, shoes, [rect[0] + knee.delta[0], rect[1] + knee.delta[1], ...rect.slice(2)], knee.angle, (kneeX - rect[0]) / rect[2], (kneeY - rect[1]) / rect[3]);
    }
    return layers;
  }
  if (category === 'accessory') {
    const image = part(18 + index);
    if (index === 0) {
      const fit = attachment.glassesFit, near = attachment.anchors.nearEye;
      const rect = [near[0] - fit.sourceLensCenters.near[0] * fit.scale, near[1] - fit.sourceLensCenters.near[1] * fit.scale,
        image.w * fit.scale, image.h * fit.scale];
      draw('accFace', image, rect, fit.angle + attachment.headTransform.angle,
        fit.sourceLensCenters.near[0] / image.w, fit.sourceLensCenters.near[1] / image.h);
    }
    else if (index === 1) {
      // Cups fit the ears independently from the crown band. Scaling the
      // entire product photo to the skull made its cups larger than the face.
      const parts = headphoneParts(collection), fit = attachment.headphoneFit;
      drawHead('accBack', parts.far, fit.farCupRect);
      const [bx, by, bw, bh] = fit.bandRect, cap = Math.max(1, Math.round(parts.band.h * 0.25));
      const capHeight = Math.min(bh * 0.25, cap * bw / parts.band.w);
      // The far rail recedes behind the turned head; it must not descend over
      // the far pupil merely because the source product is shown front-on.
      for (const [slot, band] of [
        ['accBack', masked(parts.band, px => px >= parts.band.w * 0.65)],
        ['accHead', masked(parts.band, px => px < parts.band.w * 0.65)],
      ]) {
        drawHead(slot, crop(band, 0, 0, band.w, cap), [bx, by, bw, capHeight]);
        drawHead(slot, crop(band, 0, cap, band.w, band.h - cap), [bx, by + capHeight, bw, bh - capHeight]);
      }
      drawHead('accHead', parts.near, fit.nearCupRect);
    } else {
      // Straps travel behind the torso and sleeves. Only the hanging pouch
      // sits in front; it can still be covered naturally by the near arm.
      const pouch = (x, y) => x < image.w * 0.59 && y > image.h * (collection === 'girl' ? 0.55 : 0.53);
      const bagRect = attachment.accessoryRects.bag;
      const rearLeft = box.shirt[0] + box.shirt[2] * 0.20, rearRight = box.shirt[0] + box.shirt[2] * 0.72;
      draw('accBack', masked(image, (x, y) => {
        const worldX = bagRect[0] + x / image.w * bagRect[2];
        return !pouch(x, y) && y >= image.h * 0.20 && worldX >= rearLeft && worldX <= rearRight;
      }), bagRect);
      draw('accMid', masked(image, pouch), attachment.accessoryRects.bag);
    }
    return layers;
  }
  if (category === 'props') {
    if (meal) renderMealProps(layer('propFront'), animation, frame);
    return layers;
  }
  throw new Error(`Unknown illustrated category ${category}`);
}
