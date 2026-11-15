import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { defaultAvatarSelection, normalizeAvatarSelection, resolveAvatarPieces, AVATAR_CATEGORIES } from '../shared/avatar-customization.mjs';

const directory = resolve('assets/avatar/illustrated-v2');
const pack = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));

test('illustrated pack preserves 42 distinct designs and declares adult and bust motion roles', () => {
  const all = [];
  for (const collection of ['boy', 'girl']) for (const category of AVATAR_CATEGORIES) {
    const items = pack.catalog[collection][category];
    assert.equal(items.length, 3);
    for (const item of items) { assert.equal(item.collection, collection); assert.equal(item.category, category); all.push(item.id); }
  }
  assert.equal(all.length, 42);
  assert.equal(new Set(all).size, 42);
  assert.deepEqual(Object.keys(pack.animations), ['idle', 'walk', 'greet', 'speak', 'celebrate', 'eat', 'eatOnigiri', 'eatBento']);
  assert.deepEqual(pack.styles.big.animations, ['idle', 'walk']);
  assert.deepEqual(pack.styles.chibi.animations, ['idle', 'greet', 'speak', 'celebrate', 'eat', 'eatOnigiri', 'eatBento']);
  for (const [key, variant] of Object.entries(pack.variants)) {
    const style = pack.styles[key.split('/')[0]];
    for (const [animation, info] of Object.entries(pack.animations)) {
      assert.equal(variant.frames[animation].length, info.frames, `${key}/${animation}`);
      for (const frame of variant.frames[animation]) for (const [slot, [cell, x, y]] of Object.entries(frame)) {
        assert.ok(style.slots.includes(slot), slot);
        assert.ok(variant.rects[cell], `${key}/${cell}`);
        const rectangle = variant.rects[cell];
        assert.ok(x >= 0 && y >= 0 && x + rectangle.w <= style.width && y + rectangle.h <= style.height, key);
      }
    }
  }
});

test('atlas images have true RGBA channels, bounded pages and matching frame rectangles', () => {
  const files = new Set();
  for (const variant of Object.values(pack.variants)) {
    for (const page of variant.pages) {
      assert.match(page.file, /^[a-z0-9_-]+\.png$/);
      assert.ok(page.width <= 1024 && page.height <= 1024);
      if (!files.has(page.file)) {
        files.add(page.file);
        const png = readFileSync(resolve(directory, page.file));
        assert.equal(png.subarray(1, 4).toString(), 'PNG');
        assert.equal(png.readUInt32BE(16), page.width);
        assert.equal(png.readUInt32BE(20), page.height);
        assert.equal(png[25], 6, 'PNG must support per-pixel alpha');
      }
    }
    for (const rect of variant.rects) {
      const page = variant.pages[rect.page];
      assert.ok(page && rect.x > 0 && rect.y > 0);
      assert.ok(rect.x + rect.w < page.width && rect.y + rect.h < page.height, page.file);
    }
  }
  assert.ok(files.size > 42);
});

test('foreign-collection wearables and corrupt saved values cannot be equipped', () => {
  const girl = defaultAvatarSelection(pack, 'girl');
  const boy = defaultAvatarSelection(pack, 'boy');
  const corrected = normalizeAvatarSelection(pack, { ...girl, hair: boy.hair, top: boy.top, hat: pack.catalog.boy.hat[1].id, skin: 'unknown', hairColor: 42 });
  assert.deepEqual(corrected, girl);
  assert.deepEqual(normalizeAvatarSelection(pack, null), girl);
  const optional = normalizeAvatarSelection(pack, { ...girl, hat: null, jacket: null, accessory: null });
  assert.equal(optional.jacket, null);
  assert.equal(optional.hat, null);
  assert.equal(normalizeAvatarSelection(pack, { ...girl, top: null }).top, girl.top);
});

test('every wearable resolves both styles and every pose, with hat-aware hair and jacket sleeve ownership', () => {
  for (const collection of ['boy', 'girl']) {
    const base = defaultAvatarSelection(pack, collection);
    for (const category of AVATAR_CATEGORIES) for (const item of pack.catalog[collection][category]) {
      const look = { ...base, [category]: item.id };
      for (const style of ['big', 'chibi']) for (const animation of Object.keys(pack.animations)) for (let frame = 0; frame < 8; frame++) {
        const pieces = resolveAvatarPieces(pack, look, style, animation, frame);
        assert.ok(pieces.length > 5);
        const itemPieces = pieces.filter(p => p.variant.includes(`/${category}/${item.id}`));
        if (style === 'chibi' && ['bottom', 'shoes'].includes(category)) assert.equal(itemPieces.length, 0, 'A chibi bust has no lower-body artwork');
        else assert.ok(itemPieces.length > 0, `${style}/${item.id}/${animation}/${frame}`);
        if (look.jacket) assert.ok(!pieces.some(p => p.variant.includes(`/top/${look.top}`) && /^(sleeve|foreSleeve)/.test(p.slot)));
        if (look.hat) assert.ok(pieces.filter(p => p.variant.includes('/hair/')).every(p => p.variant.endsWith('/hatted')));
      }
    }
  }
});

test('animation frames change, palette selections stay independent, and frame indices wrap safely', () => {
  for (const style of ['big', 'chibi']) for (const collection of ['boy', 'girl']) {
    const look = defaultAvatarSelection(pack, collection);
    for (const animation of pack.styles[style].animations) {
      const signatures = new Set(Array.from({ length: 8 }, (_, frame) => createHash('sha256').update(JSON.stringify(resolveAvatarPieces(pack, look, style, animation, frame))).digest('hex')));
      assert.ok(signatures.size > 1, `${style}/${collection}/${animation}`);
    }
    assert.deepEqual(resolveAvatarPieces(pack, look, style, 'walk', 9), resolveAvatarPieces(pack, look, style, 'walk', 1));
    assert.deepEqual(resolveAvatarPieces(pack, look, style, 'walk', NaN), resolveAvatarPieces(pack, look, style, 'walk', 0));
    const recoloured = { ...look, skin: 'deep', hairColor: 'black', eyeColor: 'slate' };
    const pieces = resolveAvatarPieces(pack, recoloured, style, 'idle', 0);
    assert.ok(pieces.some(p => p.variant.endsWith('/body/deep')));
    assert.ok(pieces.some(p => p.variant.includes('/black/plain')));
    assert.ok(pieces.some(p => p.variant.endsWith('/eyes/slate')));
    assert.ok(pieces.some(p => p.variant.endsWith(`/top/${look.top}`)));
  }
});

test('unsupported motions use idle and chibi never resolves legs, trousers or shoes', () => {
  for (const collection of ['boy', 'girl']) {
    const look = defaultAvatarSelection(pack, collection);
    for (const action of ['greet', 'speak', 'celebrate', 'eat', 'eatOnigiri', 'eatBento'])
      assert.deepEqual(resolveAvatarPieces(pack, look, 'big', action, 3), resolveAvatarPieces(pack, look, 'big', 'idle', 3));
    assert.deepEqual(resolveAvatarPieces(pack, look, 'chibi', 'walk', 3), resolveAvatarPieces(pack, look, 'chibi', 'idle', 3));
    for (const action of pack.styles.chibi.animations) for (let frame = 0; frame < 8; frame++) {
      const pieces = resolveAvatarPieces(pack, look, 'chibi', action, frame);
      assert.ok(!pieces.some(p => /^(leg|pant|shoe)/.test(p.slot)));
    }
  }
});

test('meal sleeves own covered arms while gripping hands and short-sleeve bare arms remain visible', () => {
  for (const collection of ['boy', 'girl']) {
    const base = defaultAvatarSelection(pack, collection);
    for (const top of pack.catalog[collection].top) for (const jacket of [null, ...pack.catalog[collection].jacket.map(item => item.id)]) {
      const selection = { ...base, top: top.id, jacket };
      const longSleeves = jacket !== null || top.id === pack.catalog[collection].top[2].id;
      for (const action of ['eat', 'eatOnigiri', 'eatBento']) for (let frame = 0; frame < 8; frame++) {
        const pieces = resolveAvatarPieces(pack, selection, 'chibi', action, frame);
        const body = pieces.filter(piece => piece.variant.includes('/body/'));
        const arms = body.filter(piece => /^(arm|fore)(Near|Far)$/.test(piece.slot));
        assert.equal(arms.length > 0, !longSleeves,
          `${collection}/${top.id}/${jacket}/${action}/${frame}: incorrect sleeve/skin ownership`);
        assert.ok(body.some(piece => piece.slot === 'handNear') && body.some(piece => piece.slot === 'handFar'),
          `${collection}/${action}/${frame}: sleeve ownership removed the food-gripping hands`);
      }
      const idle = resolveAvatarPieces(pack, selection, 'chibi', 'idle', 0);
      assert.ok(idle.some(piece => piece.variant.includes('/body/') && /^arm/.test(piece.slot)),
        'Idle hands still live in the arm artwork and must not be removed');
    }
  }
});
