import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STYLES, renderVariant, getAttachmentLayout, getGarmentLayout } from '../scripts/avatar/illustrated/rig.mjs';
import { decodePng } from '../scripts/avatar/illustrated/raster.mjs';
import { combineQaLayers, waistPixels } from '../scripts/avatar/qa-pairwise.mjs';

// Inspect the painted pixels rather than repeating the rig's transform formula.
// These checks catch motion/registration faults that valid atlas bounds miss.
const COLLECTIONS = ['girl', 'boy'];
const renderCache = new Map();
const metricsCache = new WeakMap();
const alphaThreshold = 64;

function render(options) {
  const key = JSON.stringify(options);
  if (!renderCache.has(key)) renderCache.set(key, renderVariant(options));
  return renderCache.get(key);
}

function pixels(image) {
  assert.ok(image, 'Expected a rendered layer');
  if (metricsCache.has(image)) return metricsCache.get(image);
  let weight = 0, sumX = 0, sumY = 0;
  let x0 = image.w, y0 = image.h, x1 = -1, y1 = -1;
  for (let y = 0; y < image.h; y++) for (let x = 0; x < image.w; x++) {
    const alpha = image.d[(y * image.w + x) * 4 + 3];
    if (alpha < alphaThreshold) continue;
    weight += alpha;
    sumX += x * alpha;
    sumY += y * alpha;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  assert.ok(weight > 0, 'Expected visible painted pixels');
  const result = { x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1,
    cx: sumX / weight, cy: sumY / weight };
  metricsCache.set(image, result);
  return result;
}

function unposeCentre({ cx, cy }, { pivot, translation, angle }) {
  const x = cx - pivot[0] - translation[0], y = cy - pivot[1] - translation[1];
  const radians = -angle * Math.PI / 180;
  return [pivot[0] + Math.cos(radians) * x - Math.sin(radians) * y,
    pivot[1] + Math.sin(radians) * x + Math.cos(radians) * y];
}

function relativeCentre(image, head, transform) {
  const a = pixels(image), b = pixels(head);
  const [ax, ay] = unposeCentre(a, transform), [bx, by] = unposeCentre(b, transform);
  return [ax - bx, ay - by];
}

function layerBounds(layers) {
  const bounds = Object.values(layers).map(pixels);
  const x0 = Math.min(...bounds.map(box => box.x0)), x1 = Math.max(...bounds.map(box => box.x1));
  const y0 = Math.min(...bounds.map(box => box.y0)), y1 = Math.max(...bounds.map(box => box.y1));
  return { x0, x1, y0, y1, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

function assertRange(value, minimum, maximum, label) {
  assert.ok(value >= minimum && value <= maximum,
    `${label}: ${value.toFixed(3)} is outside ${minimum}..${maximum}`);
}

function* poses(style) {
  for (const animation of STYLES[style].animations)
    for (let frame = 0; frame < 8; frame++) yield { animation, frame };
}

function faceCoverage(style, head, accessoryLayers) {
  const box = pixels(head);
  const foreground = Object.entries(accessoryLayers)
    .filter(([slot]) => STYLES[style].slots.indexOf(slot) > STYLES[style].slots.indexOf('head'))
    .map(([, image]) => image);
  let total = 0, obscured = 0;
  // Central eyes/nose area. Hair may intentionally frame its edge; an opaque
  // headphone cup must not occupy it. Thin spectacle rims are allowed.
  for (let y = Math.ceil(box.y0 + box.height * 0.33); y < box.y0 + box.height * 0.69; y++)
    for (let x = Math.ceil(box.x0 + box.width * 0.36); x < box.x0 + box.width * 0.96; x++) {
      const offset = (y * head.w + x) * 4 + 3;
      if (head.d[offset] < 128) continue;
      total++;
      if (foreground.some(image => image.d[offset] >= 128)) obscured++;
    }
  assert.ok(total > 100, 'Face coverage region must contain painted head pixels');
  return obscured / total;
}

function lensHoles(image) {
  const box = pixels(image), left = Math.max(0, box.x0 - 2), top = Math.max(0, box.y0 - 2);
  const right = Math.min(image.w - 1, box.x1 + 2), bottom = Math.min(image.h - 1, box.y1 + 2);
  const seen = new Uint8Array(image.w * image.h), holes = [];
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const start = y * image.w + x;
    if (seen[start] || image.d[start * 4 + 3] >= 16) continue;
    const queue = [start]; seen[start] = 1;
    let count = 0, sumX = 0, sumY = 0, exterior = false;
    for (let n = 0; n < queue.length; n++) {
      const index = queue[n], px = index % image.w, py = Math.floor(index / image.w);
      count++; sumX += px; sumY += py;
      if (px === left || px === right || py === top || py === bottom) exterior = true;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = px + dx, ny = py + dy, next = ny * image.w + nx;
        if (nx < left || nx > right || ny < top || ny > bottom || seen[next] || image.d[next * 4 + 3] >= 16) continue;
        seen[next] = 1; queue.push(next);
      }
    }
    if (!exterior && count >= 3) holes.push({ count, cx: sumX / count, cy: sumY / count });
  }
  return holes.sort((a, b) => b.count - a.count).slice(0, 2).sort((a, b) => a.cx - b.cx);
}

test('hair, hats and facial accessories stay registered to the head in every supported frame', () => {
  for (const style of Object.keys(STYLES)) for (const collection of COLLECTIONS) {
    const common = { style, collection };
    const baseHead = render({ ...common, category: 'body', animation: 'idle', frame: 0 }).head;
    const baseTransform = getAttachmentLayout({ ...common, animation: 'idle', frame: 0 }).headTransform;
    const attachments = [
      ...Array.from({ length: 3 }, (_, index) => ({ category: 'hair', index, hatted: false })),
      ...Array.from({ length: 3 }, (_, index) => ({ category: 'hair', index, hatted: true })),
      ...Array.from({ length: 3 }, (_, index) => ({ category: 'hat', index })),
      { category: 'accessory', index: 0 },
      { category: 'accessory', index: 1 },
    ];
    for (const attachment of attachments) {
      const baseLayers = render({ ...common, ...attachment, animation: 'idle', frame: 0 });
      for (const pose of poses(style)) {
        const head = render({ ...common, category: 'body', ...pose }).head;
        const layers = render({ ...common, ...attachment, ...pose });
        const transform = getAttachmentLayout({ ...common, ...pose }).headTransform;
        assert.deepEqual(Object.keys(layers).sort(), Object.keys(baseLayers).sort(), 'Attachment layers changed between poses');
        for (const [slot, image] of Object.entries(layers)) {
          const base = relativeCentre(baseLayers[slot], baseHead, baseTransform);
          const actual = relativeCentre(image, head, transform);
          const label = `${style}/${collection}/${attachment.category}${attachment.index}/${slot}/${pose.animation}/${pose.frame}`;
          const bounds = pixels(image);
          assert.ok(bounds.x0 > 0 && bounds.y0 > 0 && bounds.x1 < image.w - 1 && bounds.y1 < image.h - 1,
            `${label}: head attachment clipped at canvas edge`);
          // Remove legitimate head rotation before measuring drift. These are
          // raw rig layers, before the coarser build-time pixel quantisation.
          assert.ok(Math.abs(actual[0] - base[0]) <= 1.25, `${label}: horizontal head-relative drift`);
          assert.ok(Math.abs(actual[1] - base[1]) <= 1.25, `${label}: vertical head-relative drift`);
        }
      }
    }
  }
});

test('every hairstyle covers the upper skull, including all hat combinations', () => {
  for (const style of Object.keys(STYLES)) for (const collection of COLLECTIONS) for (const pose of poses(style)) {
    const common = { style, collection, ...pose };
    const head = render({ ...common, category: 'body' }).head;
    const { headRect, headTransform } = getAttachmentLayout(common);
    const bounds = pixels(head), scalp = [];
    const { pivot, translation, angle } = headTransform;
    const radians = -angle * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
    for (let y = bounds.y0; y <= bounds.y1; y++) for (let x = bounds.x0; x <= bounds.x1; x++) {
      const offset = (y * head.w + x) * 4 + 3;
      if (head.d[offset] < 128) continue;
      const localY = pivot[1] + s * (x - pivot[0] - translation[0]) + c * (y - pivot[1] - translation[1]);
      if (localY >= headRect[1] && localY < headRect[1] + headRect[3] * 0.30) scalp.push(offset);
    }
    assert.ok(scalp.length > 100, 'Upper-skull registration region must be visible');
    for (let hairIndex = 0; hairIndex < 3; hairIndex++) for (const hatIndex of [null, 0, 1, 2]) {
      const layers = Object.values(render({ ...common, category: 'hair', index: hairIndex, hatted: hatIndex !== null }));
      if (hatIndex !== null) layers.push(...Object.values(render({ ...common, category: 'hat', index: hatIndex })));
      const covered = scalp.filter(offset => layers.some(image => image.d[offset] >= 128)).length;
      assert.ok(covered / scalp.length >= 0.70,
        `${style}/${collection}/hair${hairIndex}/hat${hatIndex}/${pose.animation}/${pose.frame}: exposed upper skull`);
    }
  }
});

test('eyewear leaves the central face visible and stays proportional to the adult head', () => {
  for (const collection of COLLECTIONS) for (const style of Object.keys(STYLES)) {
    for (const pose of poses(style)) {
      const common = { style, collection, ...pose };
      const head = render({ ...common, category: 'body' }).head;
      const headBox = pixels(head);
      for (const index of [0, 1]) {
        const layers = render({ ...common, category: 'accessory', index });
        const label = `${style}/${collection}/accessory${index}/${pose.animation}/${pose.frame}`;
        assert.ok(faceCoverage(style, head, layers) <= (index === 0 ? 0.30 : 0.20),
          `${label}: accessory covers the central face`);
        if (style !== 'big') continue;
        const box = layerBounds(layers);
        assertRange(box.width / headBox.width, index === 0 ? 0.55 : 0.90,
          index === 0 ? 1.15 : 1.65, `${label}: width/head width`);
        assertRange(box.height / headBox.height, index === 0 ? 0.10 : 0.50,
          index === 0 ? 0.35 : 1.20, `${label}: height/head height`);
      }
    }
  }
});

test('painted spectacle lens openings centre over both pupil anchors', () => {
  for (const style of Object.keys(STYLES)) for (const collection of COLLECTIONS) for (const pose of poses(style)) {
    const common = { style, collection, ...pose };
    const glasses = render({ ...common, category: 'accessory', index: 0 }).accFace;
    const layout = getAttachmentLayout(common), holes = lensHoles(glasses);
    const label = `${style}/${collection}/${pose.animation}/${pose.frame}`;
    assert.equal(holes.length, 2, `${label}: spectacle lenses are missing or closed`);
    for (let index = 0; index < 2; index++) {
      const eye = layout.anchors[index === 0 ? 'nearEye' : 'farEye'];
      // Allow sampling error in the small adult raster. This independently
      // measures the visible openings, not the declared glasses transform.
      assert.ok(Math.hypot(holes[index].cx - eye[0], holes[index].cy - eye[1]) <= 2,
        `${label}/lens${index}: painted lens opening is off the pupil`);
    }
  }
});

test('visible headphone cups are ear-sized and centred instead of covering the cheek', () => {
  for (const style of Object.keys(STYLES)) for (const collection of COLLECTIONS) for (const pose of poses(style)) {
    const common = { style, collection, ...pose }, layout = getAttachmentLayout(common);
    const phones = render({ ...common, category: 'accessory', index: 1 }).accHead;
    const [earX, earY] = layout.canonicalAnchors.nearEar, headHeight = layout.headRect[3];
    let minimum = Infinity, maximum = -Infinity;
    // A horizontal slice through the visible ear cup excludes the crown band.
    // Measure actual painted pixels after undoing the legitimate head motion.
    for (let y = 0; y < phones.h; y++) for (let x = 0; x < phones.w; x++) {
      if (phones.d[(y * phones.w + x) * 4 + 3] < 128) continue;
      const [localX, localY] = unposeCentre({ cx: x, cy: y }, layout.headTransform);
      if (Math.abs(localY - earY) > headHeight * 0.04 || localX > layout.canonicalAnchors.nearEye[0]) continue;
      minimum = Math.min(minimum, localX); maximum = Math.max(maximum, localX);
    }
    const label = `${style}/${collection}/${pose.animation}/${pose.frame}`;
    assertRange((maximum - minimum + 1) / headHeight, 0.14, 0.35, `${label}: painted ear-cup width/head height`);
    assert.ok(Math.abs((maximum + minimum) / 2 - earX) <= headHeight * 0.07,
      `${label}: visible ear cup is displaced onto the cheek`);
  }
});

test('adult bags retain torso-relative scale and hip placement during walking', () => {
  for (const collection of COLLECTIONS) {
    const common = { style: 'big', collection };
    const referenceBag = pixels(combineQaLayers('big', [render({ ...common, category: 'accessory', index: 2, animation: 'idle', frame: 0 })]));
    const referenceTorso = pixels(render({ ...common, category: 'jacket', index: 0, animation: 'idle', frame: 0 }).outer);
    for (const pose of poses('big')) {
      const bag = pixels(combineQaLayers('big', [render({ ...common, category: 'accessory', index: 2, ...pose })]));
      for (let index = 0; index < 3; index++) {
        const jacket = render({ ...common, category: 'jacket', index, ...pose });
        const torso = pixels(jacket.outer);
        const shoulderSpan = layerBounds(render({ ...common, category: 'jacket', index, animation: 'idle', frame: 0 })).width;
        const label = `${collection}/bag/jacket${index}/${pose.animation}/${pose.frame}`;
        assertRange(bag.height / torso.height, 0.65, 1.35, `${label}: height/torso height`);
        // Use the neutral shoulder span, including sleeves: swinging arms can
        // narrow a posed silhouette without changing the wearer's body size.
        // A pouch may extend slightly beyond the torso at the hip.
        assertRange(bag.width / shoulderSpan, 0.25, 1.10, `${label}: width/shoulder span`);
        // The upper strap is intentionally tucked beneath clothing, so its
        // first painted pixel need not reach the exposed shoulder contour.
        assertRange((bag.y0 - torso.y0) / torso.height, 0, 0.55, `${label}: tucked strap start`);
        assertRange((bag.y1 - torso.y0) / torso.height, 0.75, 1.40, `${label}: bag bottom`);
      }
      const torso = pixels(render({ ...common, category: 'jacket', index: 0, ...pose }).outer);
      assert.ok(Math.abs((bag.cx - torso.cx) - (referenceBag.cx - referenceTorso.cx)) <= 1,
        `${collection}/${pose.animation}/${pose.frame}: bag horizontal drift`);
      assert.ok(Math.abs((bag.cy - torso.cy) - (referenceBag.cy - referenceTorso.cy)) <= 1,
        `${collection}/${pose.animation}/${pose.frame}: bag vertical drift`);
    }
  }
});

test('all chibi source poses remain busts without lower-body pixels or slots', () => {
  for (const collection of COLLECTIONS) for (const pose of poses('chibi')) {
    const common = { style: 'chibi', collection, ...pose };
    for (const category of ['bottom', 'shoes']) for (let index = 0; index < 3; index++) {
      const layers = render({ ...common, category, index });
      assert.equal(Object.keys(layers).length, 0, `${collection}/${category}/${index}: lower body in chibi bust`);
    }
    for (const category of ['body', 'hair', 'hat', 'top', 'jacket', 'accessory', 'props']) {
      for (let index = 0; index < (['body', 'props'].includes(category) ? 1 : 3); index++) {
        const layers = render({ ...common, category, index });
        assert.ok(Object.keys(layers).every(slot => !/^(leg|pant|shoe|bottom)/.test(slot)),
          `${collection}/${category}/${pose.animation}/${pose.frame}: lower-body slot in chibi bust`);
      }
    }
  }
});

test('eye-colour overlays stay inside the registered head silhouette', () => {
  for (const collection of COLLECTIONS) for (const style of Object.keys(STYLES)) {
    for (const pose of poses(style)) {
      const common = { style, collection, ...pose };
      const head = render({ ...common, category: 'body' }).head;
      const eyes = render({ ...common, category: 'eyes', palette: 'slate' }).face;
      if (!eyes) continue; // Closed-eye expressions do not have iris overlays.
      let painted = 0, outside = 0;
      for (let offset = 3; offset < eyes.d.length; offset += 4) {
        if (eyes.d[offset] < alphaThreshold) continue;
        painted++;
        if (head.d[offset] < alphaThreshold) outside++;
      }
      assert.ok(painted > 0, `${style}/${collection}/${pose.animation}/${pose.frame}: empty iris overlay`);
      assert.ok(outside / painted <= 0.01, `${style}/${collection}/${pose.animation}/${pose.frame}: iris outside head`);
    }
  }
});

test('compiled atlases preserve one common pixel grid after trimming and packing', () => {
  const directory = resolve('assets/avatar/illustrated-v2');
  const pack = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
  const pages = new Map(), checked = new Set();
  const adultHeadSlots = new Set(['head', 'face', 'hairBack', 'hairFront', 'hat', 'accFace', 'accHead', 'accBack']);
  let cells = 0;
  for (const [key, variant] of Object.entries(pack.variants)) {
    const [style, , category, palette] = key.split('/');
    // All designs and motions; extra colour swaps share the same geometry.
    if (category === 'body' && palette !== 'peach') continue;
    if (category === 'eyes' && palette !== 'hazel') continue;
    if (category === 'hair' && !key.includes('/espresso/')) continue;
    for (const animation of pack.styles[style].animations) for (const frame of variant.frames[animation]) {
      for (const [slot, [cell, offsetX, offsetY]] of Object.entries(frame)) {
        const grid = style === 'chibi' ? 3 : adultHeadSlots.has(slot) ? 2 : 1;
        if (grid === 1) continue;
        const signature = `${key}/${cell}/${offsetX % grid}/${offsetY % grid}`;
        if (checked.has(signature)) continue;
        checked.add(signature);
        const rect = variant.rects[cell], page = variant.pages[rect.page];
        const label = `${key}/${slot}/${cell}`;
        // Trimming must retain the canvas grid origin. Otherwise independently
        // packed hair, face and hats acquire different pixel phases at runtime.
        assert.equal(offsetX % grid, 0, `${label}: horizontal grid phase`);
        assert.equal(offsetY % grid, 0, `${label}: vertical grid phase`);
        assert.ok(rect.w % grid === 0 || offsetX + rect.w === pack.styles[style].width,
          `${label}: partial horizontal pixel block`);
        assert.ok(rect.h % grid === 0 || offsetY + rect.h === pack.styles[style].height,
          `${label}: partial vertical pixel block`);
        if (!pages.has(page.file)) pages.set(page.file, decodePng(resolve(directory, page.file)));
        const image = pages.get(page.file);
        for (let y = 0; y < rect.h; y += grid) for (let x = 0; x < rect.w; x += grid) {
          const start = ((rect.y + y) * image.w + rect.x + x) * 4;
          for (let dy = 0; dy < Math.min(grid, rect.h - y); dy++)
            for (let dx = 0; dx < Math.min(grid, rect.w - x); dx++) {
              const at = ((rect.y + y + dy) * image.w + rect.x + x + dx) * 4;
              for (let channel = 0; channel < 4; channel++)
                assert.equal(image.d[at + channel], image.d[start + channel], `${label}: nonuniform pixel block`);
            }
        }
        cells++;
      }
    }
  }
  assert.ok(cells > 100, 'Expected complete head/accessory and chibi atlas coverage');
});

test('opaque hats occlude every overlapping accessory in the composed pixels', () => {
  let intersections = 0;
  for (const collection of COLLECTIONS) for (const style of Object.keys(STYLES)) for (const pose of poses(style)) {
    const common = { style, collection, ...pose };
    for (let hatIndex = 0; hatIndex < 3; hatIndex++) {
      const hat = render({ ...common, category: 'hat', index: hatIndex });
      for (let accessoryIndex = 0; accessoryIndex < 3; accessoryIndex++) {
        const accessory = render({ ...common, category: 'accessory', index: accessoryIndex });
        const composite = combineQaLayers(style, [accessory, hat]);
        for (let offset = 0; offset < hat.hat.d.length; offset += 4) {
          if (hat.hat.d[offset + 3] !== 255 || !Object.values(accessory).some(image => image.d[offset + 3] >= 128)) continue;
          intersections++;
          for (let channel = 0; channel < 4; channel++) assert.equal(composite.d[offset + channel], hat.hat.d[offset + channel],
            `${style}/${collection}/hat${hatIndex}/accessory${accessoryIndex}/${pose.animation}/${pose.frame}: accessory paints over hat`);
        }
      }
    }
  }
  assert.ok(intersections > 1000, 'Occlusion test must exercise real accessory/hat intersections');
});

test('rear bag straps are hidden by opaque clothing above the hanging pouch', () => {
  let intersections = 0;
  for (const collection of COLLECTIONS) for (const style of Object.keys(STYLES)) for (const pose of poses(style)) {
    const common = { style, collection, ...pose };
    const bag = render({ ...common, category: 'accessory', index: 2 });
    assert.ok(bag.accBack && bag.accMid, 'Bag needs separate rear straps and front pouch artwork');
    const pouchTop = pixels(bag.accMid).y0;
    for (let topIndex = 0; topIndex < 3; topIndex++) for (const jacketIndex of [null, 0, 1, 2]) {
      const top = render({ ...common, category: 'top', index: topIndex });
      const cloth = [{ top: top.top }];
      if (jacketIndex !== null) cloth.push({ outer: render({ ...common, category: 'jacket', index: jacketIndex }).outer });
      const clothingOnly = combineQaLayers(style, cloth);
      const withBag = combineQaLayers(style, [bag, ...cloth]);
      for (let y = 0; y < pouchTop; y++) for (let x = 0; x < withBag.w; x++) {
        const offset = (y * withBag.w + x) * 4;
        const opaqueCloth = cloth.some(context => Object.values(context).some(image => image.d[offset + 3] === 255));
        if (!opaqueCloth || bag.accBack.d[offset + 3] < 128 || bag.accMid.d[offset + 3] > 0) continue;
        intersections++;
        for (let channel = 0; channel < 4; channel++) assert.equal(withBag.d[offset + channel], clothingOnly.d[offset + channel],
          `${style}/${collection}/top${topIndex}/jacket${jacketIndex}/${pose.animation}/${pose.frame}: strap paints over torso`);
      }
    }
  }
  assert.ok(intersections > 1000, 'Strap test must exercise actual torso overlap');
});

test('all adult bottom waists match the jeans fit and avoid abrupt hip contour steps', () => {
  for (const collection of COLLECTIONS) for (const pose of poses('big')) {
    const reference = waistPixels(collection, collection === 'girl' ? 1 : 2, pose.animation, pose.frame);
    for (let index = 0; index < 3; index++) {
      const waist = waistPixels(collection, index, pose.animation, pose.frame);
      const label = `${collection}/bottom${index}/${pose.animation}/${pose.frame}`;
      assertRange(waist.width / reference.width, 0.87, 1.13, `${label}: waist/jeans waist`);
      assert.ok(Math.abs(waist.centre - reference.centre) <= 3, `${label}: waistband is off-centre`);
      const bottom = combineQaLayers('big', [render({ style: 'big', collection, category: 'bottom', index, ...pose })]);
      let previous;
      // Hip panel cutoffs appear as a sudden sideways shelf. Read the outer
      // contour below the waistband rather than inspecting internal seams.
      for (let y = waist.top + 16; y <= waist.top + 53; y++) {
        let left = bottom.w, right = -1;
        for (let x = 0; x < bottom.w; x++) if (bottom.d[(y * bottom.w + x) * 4 + 3] >= 128) {
          left = Math.min(left, x); right = Math.max(right, x);
        }
        if (right < left) continue;
        if (previous) {
          assert.ok(Math.abs(left - previous.left) <= 5 && Math.abs(right - previous.right) <= 5,
            `${label}: abrupt outer hip contour at row ${y}`);
        }
        previous = { left, right };
      }
    }
  }
});

test('every adult shoe stays connected to the selected bottom through walking', () => {
  for (const collection of COLLECTIONS) for (const pose of poses('big')) for (let bottomIndex = 0; bottomIndex < 3; bottomIndex++) {
    const common = { style: 'big', collection, ...pose };
    const bottom = combineQaLayers('big', [render({ ...common, category: 'bottom', index: bottomIndex })]);
    for (let shoeIndex = 0; shoeIndex < 3; shoeIndex++) for (const [slot, shoe] of Object.entries(render({ ...common, category: 'shoes', index: shoeIndex }))) {
      const bounds = pixels(shoe);
      let touches = false;
      for (let y = bounds.y0; y <= bounds.y1 && !touches; y++) for (let x = bounds.x0; x <= bounds.x1 && !touches; x++) {
        if (shoe.d[(y * shoe.w + x) * 4 + 3] < 128) continue;
        for (let dy = -2; dy <= 2 && !touches; dy++) for (let dx = -2; dx <= 2 && !touches; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < bottom.w && yy < bottom.h && bottom.d[(yy * bottom.w + xx) * 4 + 3] >= 128) touches = true;
        }
      }
      assert.ok(touches, `${collection}/bottom${bottomIndex}/shoe${shoeIndex}/${slot}/${pose.animation}/${pose.frame}: detached ankle`);
    }
  }
});

test('short-sleeve shirts retain their lower torso fabric when the arms move', () => {
  for (const collection of COLLECTIONS) for (const style of Object.keys(STYLES)) for (const index of [0, 1]) {
    const common = { style, collection, category: 'top', index };
    const neutral = combineQaLayers(style, [render({ ...common, animation: 'idle', frame: 0 })]);
    const neutralRect = getGarmentLayout({ style, collection, animation: 'idle', frame: 0 }).shirtRect;
    for (const pose of poses(style)) {
      const animated = combineQaLayers(style, [render({ ...common, ...pose })]);
      const rect = getGarmentLayout({ style, collection, ...pose }).shirtRect;
      const dx = rect[0] - neutralRect[0], dy = rect[1] - neutralRect[1];
      let expected = 0, retained = 0;
      // The lower body of a short-sleeve shirt is below the arm opening. It
      // must not peel away with the sleeve during walking or raised gestures.
      for (let y = Math.ceil(neutralRect[1] + neutralRect[3] * 0.70); y < neutralRect[1] + neutralRect[3] * 0.90; y++)
        for (let x = Math.ceil(neutralRect[0]); x < neutralRect[0] + neutralRect[2]; x++) {
          if (neutral.d[(y * neutral.w + x) * 4 + 3] < 230) continue;
          expected++;
          const px = Math.round(x + dx), py = Math.round(y + dy);
          if (px >= 0 && py >= 0 && px < animated.w && py < animated.h && animated.d[(py * animated.w + px) * 4 + 3] >= 128) retained++;
        }
      assert.ok(expected > 100, 'Lower-torso comparison must contain substantial painted fabric');
      assert.ok(retained / expected >= 0.97,
        `${style}/${collection}/top${index}/${pose.animation}/${pose.frame}: lower shirt peels away (${(100 * retained / expected).toFixed(1)}% retained)`);
    }
  }
});

test('each trouser calf has one connected painted silhouette without opposite-leg fragments', () => {
  for (const collection of COLLECTIONS) for (const pose of poses('big')) for (let index = 0; index < 3; index++) {
    const common = { style: 'big', collection, category: 'bottom', index, ...pose };
    const { bottomRect } = getGarmentLayout(common);
    const calfTop = Math.ceil(bottomRect[1] + bottomRect[3] * 0.65);
    for (const [slot, image] of Object.entries(render(common))) {
      if (!slot.startsWith('pant')) continue; // A skirt has one unsplit silhouette.
      const seen = new Uint8Array(image.w * image.h), components = [];
      for (let y = calfTop; y < image.h; y++) for (let x = 0; x < image.w; x++) {
        const start = y * image.w + x;
        if (seen[start] || image.d[start * 4 + 3] < 128) continue;
        const queue = [start];
        seen[start] = 1;
        for (let cursor = 0; cursor < queue.length; cursor++) {
          const point = queue[cursor], px = point % image.w, py = Math.floor(point / image.w);
          for (let yy = Math.max(calfTop, py - 1); yy <= Math.min(image.h - 1, py + 1); yy++)
            for (let xx = Math.max(0, px - 1); xx <= Math.min(image.w - 1, px + 1); xx++) {
              const next = yy * image.w + xx;
              if (!seen[next] && image.d[next * 4 + 3] >= 128) { seen[next] = 1; queue.push(next); }
            }
        }
        components.push(queue.length);
      }
      // Tiny disconnected edge samples can arise from rasterisation. A second
      // readable fragment indicates one leg inherited pixels from the other.
      const substantial = components.filter(area => area > 3);
      assert.equal(substantial.length, 1,
        `${collection}/bottom${index}/${slot}/${pose.animation}/${pose.frame}: disconnected calf areas ${components.join(',')}`);
    }
  }
});
