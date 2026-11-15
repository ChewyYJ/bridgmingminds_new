import test from "node:test";
import assert from "node:assert/strict";
import { WARDROBE, CATEGORY_ORDER } from "../scripts/avatar/items/wardrobe-v1.mjs";
import * as big from "../scripts/avatar/styles/big.mjs";
import * as chibi from "../scripts/avatar/styles/chibi.mjs";

const STYLES = [big, chibi];
const COLLECTIONS = ["boy", "girl"];
const POSES = [["idle", 0], ["walk", 4], ["greet", 2], ["speak", 3], ["celebrate", 2], ["eat", 3]];

function draw(style, collection, item, animation = "idle", frame = 0, options = {}) {
  const ctx = style.makeContext(animation, frame, collection);
  item.draw(ctx, options);
  return ctx;
}

function compositeKeys(style, contexts) {
  const pixels = new Array(style.W * style.H).fill(null);
  for (const slot of style.SLOTS)
    for (const ctx of contexts) {
      const layer = ctx.layers[slot];
      if (!layer) continue;
      for (let i = 0; i < pixels.length; i++)
        if (layer.p[i] !== null) pixels[i] = layer.p[i];
    }
  return pixels;
}

test("wardrobe has three separate designs in every collection/category and 42 stable IDs", () => {
  assert.deepEqual(CATEGORY_ORDER, ["hair", "hat", "top", "jacket", "bottom", "shoes", "accessory"]);
  assert.deepEqual(Object.keys(WARDROBE).sort(), ["boy", "girl"]);
  const ids = new Set();
  for (const collection of COLLECTIONS) {
    assert.deepEqual(Object.keys(WARDROBE[collection]), CATEGORY_ORDER);
    for (const category of CATEGORY_ORDER) {
      const items = WARDROBE[collection][category];
      assert.equal(items.length, 3, `${collection}/${category}`);
      assert.equal(new Set(items.map(item => item.name)).size, 3);
      for (const item of items) {
        assert.equal(item.collection, collection);
        assert.equal(item.category, category);
        assert.ok(item.id.startsWith(`${collection}-${category}-`), item.id);
        assert.ok(!ids.has(item.id), `Duplicate ID ${item.id}`);
        ids.add(item.id);
        assert.equal(typeof item.draw, "function");
      }
    }
  }
  assert.equal(ids.size, 42);
});

test("each jacket leaves a real transparent aperture and preserves separately selected tops", () => {
  for (const style of STYLES)
    for (const collection of COLLECTIONS) {
      const group = WARDROBE[collection];
      const firstTop = draw(style, collection, group.top[0]);
      const secondTop = draw(style, collection, group.top[2]);
      for (const item of group.jacket) {
        const coat = draw(style, collection, item);
        assert.ok(!coat.layers.top?.p.some(pixel => pixel !== null), `${item.id}: baked undershirt`);
        assert.ok(Object.values(coat.layers).every(layer => layer.p.every(pixel => pixel === null || pixel.startsWith("#"))), `${item.id}: body or hair baked into jacket`);
        const x = Math.floor(coat.P.frontX);
        const y = Math.floor(coat.P.chestY + 4 * coat.P.k);
        assert.equal(coat.layers.outer.get(x, y), null, `${item.id}: closed centre aperture`);
        assert.notEqual(firstTop.layers.top.get(x, y), null, `${collection}: missing underlying shirt`);
        const before = compositeKeys(style, [firstTop, coat]);
        const after = compositeKeys(style, [secondTop, coat]);
        assert.equal(before[y * style.W + x], firstTop.layers.top.get(x, y));
        assert.equal(after[y * style.W + x], secondTop.layers.top.get(x, y));
        const visibleChanges = before.filter((pixel, i) => pixel !== null && after[i] !== null && pixel !== after[i]).length;
        assert.ok(visibleChanges > 30, `${item.id}: top changes hidden by outerwear`);
        for (let i = 0; i < coat.layers.outer.p.length; i++)
          if (coat.layers.outer.p[i] !== null)
            assert.equal(before[i], after[i], `${item.id}: shirt paints over jacket`);
      }
    }
});

test("jacket cuffs leave skin visible at the hands in idle and articulated poses", () => {
  for (const style of STYLES)
    for (const collection of COLLECTIONS)
      for (const [animation, frame] of POSES) {
        const body = style.makeContext(animation, frame, collection);
        style.drawBody(body);
        const base = compositeKeys(style, [body]);
        const arms = body.P.arms.near ? [body.P.arms.near] : Object.values(body.P.arms);
        for (const item of WARDROBE[collection].jacket) {
          const coat = draw(style, collection, item, animation, frame);
          const dressed = compositeKeys(style, [body, coat]);
          for (const arm of arms) {
            const hand = style === big
              ? big.handMask(body.S, arm).all
              : chibi.handShapes(body.S, arm).main;
            let bareSkin = 0;
            let visibleSkin = 0;
            hand.forEach((x, y) => {
              const i = y * style.W + x;
              if (base[i]?.startsWith("skin.")) bareSkin++;
              if (dressed[i]?.startsWith("skin.")) visibleSkin++;
            });
            if (bareSkin < 10) continue; // The pose itself can occlude a far hand.
            assert.ok(visibleSkin >= 8 && visibleSkin >= bareSkin * 0.2,
              `${style.W}/${item.id}/${animation}/${arm.side}: cuff hides hand (${visibleSkin}/${bareSkin})`);
          }
        }
      }
});

test("headwear and accessories remain bounded and emit only accessory layers through motion", () => {
  for (const style of STYLES)
    for (const collection of COLLECTIONS)
      for (const [animation, frame] of POSES)
        for (const item of [...WARDROBE[collection].hat, ...WARDROBE[collection].accessory]) {
          const ctx = draw(style, collection, item, animation, frame);
          let painted = 0;
          for (const [slot, layer] of Object.entries(ctx.layers)) {
            assert.ok(item.category === "hat" ? slot === "hat" : slot.startsWith("acc"), `${item.id}: leaked ${slot}`);
            assert.equal(layer.w, style.W);
            assert.equal(layer.h, style.H);
            for (let x = 0; x < style.W; x++) {
              assert.equal(layer.get(x, 0), null, `${item.id}/${animation}: top clipping`);
              assert.equal(layer.get(x, style.H - 1), null, `${item.id}/${animation}: bottom clipping`);
            }
            for (let y = 0; y < style.H; y++) {
              assert.equal(layer.get(0, y), null, `${item.id}/${animation}: left clipping`);
              assert.equal(layer.get(style.W - 1, y), null, `${item.id}/${animation}: right clipping`);
            }
            painted += layer.p.filter(pixel => pixel !== null).length;
          }
          assert.ok(painted > 10, `${item.id}/${animation}: empty accessory`);
        }
});

test("hat-compatible hair removes crown overlap without changing lower hair or palette keys", () => {
  for (const style of STYLES)
    for (const collection of COLLECTIONS)
      for (const item of WARDROBE[collection].hair) {
        const plain = draw(style, collection, item);
        const hatted = draw(style, collection, item, "idle", 0, { hatted: true });
        const line = plain.P.head.cy + plain.HEAD.hatLine;
        let removed = 0;
        let palettePixels = 0;
        for (const slot of ["hairBack", "hairFront", "hairShade"]) {
          const a = plain.layers[slot], b = hatted.layers[slot];
          if (!a) continue;
          for (let y = 0; y < style.H; y++)
            for (let x = 0; x < style.W; x++) {
              const original = a.get(x, y);
              if (original?.startsWith("hair.")) palettePixels++;
              if (y < line) {
                assert.equal(b.get(x, y), null, `${item.id}: hair above hat band`);
                if (original !== null) removed++;
              } else assert.equal(b.get(x, y), original, `${item.id}: lower hair changed`);
            }
        }
        assert.ok(removed > 0);
        assert.ok(palettePixels > 20);
      }
});
