import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { STYLES, renderVariant, getMealLayout } from '../scripts/avatar/illustrated/rig.mjs';
import { combineQaLayers } from '../scripts/avatar/qa-pairwise.mjs';
import { shouldHideBodyArms } from '../shared/avatar-customization.mjs';

const ACTIONS = ['eat', 'eatOnigiri', 'eatBento'];
const COLLECTIONS = ['girl', 'boy'];
const cache = new Map();
function render(options) {
  const key = JSON.stringify(options);
  if (!cache.has(key)) cache.set(key, renderVariant(options));
  return cache.get(key);
}
const signature = image => createHash('sha256').update(image.d).digest('hex');
function opaque(image, callback) {
  for (let y = 0; y < image.h; y++) for (let x = 0; x < image.w; x++) {
    const at = (y * image.w + x) * 4;
    if (image.d[at + 3] >= 128) callback(x, y, at);
  }
}

test('each meal has distinct painted food and a changing eight-frame eating performance', () => {
  for (const collection of COLLECTIONS) {
    const mealSignatures = [];
    for (const animation of ACTIONS) {
      assert.ok(STYLES.chibi.animations.includes(animation));
      const frames = new Set(), propFrames = [];
      for (let frame = 0; frame < 8; frame++) {
        const common = { style: 'chibi', collection, animation, frame };
        const body = render({ ...common, category: 'body' });
        const props = render({ ...common, category: 'props' });
        assert.ok(body.handNear?.bbox() && body.handFar?.bbox(), `${collection}/${animation}/${frame}: missing active hand`);
        assert.ok(props.propFront?.bbox(), `${collection}/${animation}/${frame}: missing selected food`);
        frames.add(signature(combineQaLayers('chibi', [body, props])));
        propFrames.push(signature(props.propFront));
        opaque(props.propFront, (x, y) => assert.ok(x > 0 && x < 255 && y > 0 && y < 255,
          `${collection}/${animation}/${frame}: food clipped at canvas boundary`));
      }
      // Poses may intentionally hold during a chew, but cannot be a renamed
      // still or the same animation with a different UI label.
      assert.ok(frames.size >= 5, `${collection}/${animation}: eating motion is frozen`);
      mealSignatures.push(propFrames.join('/'));
    }
    assert.equal(new Set(mealSignatures).size, 3, `${collection}: food actions reuse the same painted prop`);
    for (const animation of ['idle', 'greet', 'speak', 'celebrate'])
      assert.deepEqual(Object.keys(render({ style: 'chibi', collection, category: 'props', animation })), [], `${animation}: meal prop leaked into another action`);
    for (const animation of ACTIONS)
      assert.deepEqual(Object.keys(render({ style: 'big', collection, category: 'props', animation })), [], `${animation}: meal prop leaked into the adult idle fallback`);
  }
});

test('onigiri has only its held rice ball and gripping hands, without old bowls or chopsticks', () => {
  for (const collection of COLLECTIONS) for (let frame = 0; frame < 8; frame++) {
    const common = { style: 'chibi', collection, animation: 'eatOnigiri', frame };
    const meal = getMealLayout('eatOnigiri', frame), props = render({ ...common, category: 'props' });
    const body = render({ ...common, category: 'body' });
    const [x0, y0, width, height] = meal.foodRect;
    opaque(props.propFront, (x, y) => assert.ok(x >= x0 - 1 && x <= x0 + width + 1 && y >= y0 - 1 && y <= y0 + height + 1,
      `${collection}/onigiri/${frame}: pixels outside the held rice-ball silhouette`));
    for (const side of ['Near', 'Far']) {
      const [wx, wy] = meal[`${side.toLowerCase()}Wrist`];
      opaque(body[`hand${side}`], (x, y) => assert.ok(Math.hypot(x - wx, y - wy) <= 29,
        `${collection}/onigiri/${frame}/${side}: extended utensil or stale hand artwork`));
    }
    // The rice ball must travel to the mouth, not remain at the bowl position.
    if (frame === 3) {
      const head = body.head.bbox(), food = props.propFront.bbox();
      assert.ok(food.y0 < head.y1 && food.y1 > head.y1, `${collection}: lifted food never meets the lower face`);
    }
  }
});

test('each selected food remains visible with every top and jacket throughout eating', () => {
  let checked = 0;
  for (const collection of COLLECTIONS) for (const animation of ACTIONS) for (let frame = 0; frame < 8; frame++) {
    const common = { style: 'chibi', collection, animation, frame };
    const body = render({ ...common, category: 'body' }), props = render({ ...common, category: 'props' });
    for (let topIndex = 0; topIndex < 3; topIndex++) for (const jacketIndex of [null, 0, 1, 2]) {
      const top = render({ ...common, category: 'top', index: topIndex });
      const shirt = jacketIndex === null ? top : Object.fromEntries(Object.entries(top).filter(([slot]) => !/^(sleeve|foreSleeve)/.test(slot)));
      const jacket = jacketIndex === null ? {} : render({ ...common, category: 'jacket', index: jacketIndex });
      const hideArms = shouldHideBodyArms('chibi', animation, jacketIndex !== null || topIndex === 2);
      const visibleBody = hideArms ? Object.fromEntries(Object.entries(body).filter(([slot]) => !/^(arm|fore)(Near|Far)$/.test(slot))) : body;
      const composite = combineQaLayers('chibi', [visibleBody, shirt, jacket, props]);
      let total = 0, visible = 0;
      opaque(props.propFront, (_x, _y, at) => {
        if (props.propFront.d[at + 3] !== 255 || (body.handNear?.d[at + 3] ?? 0) > 0) return;
        total++;
        if ([0, 1, 2].every(channel => composite.d[at + channel] === props.propFront.d[at + channel])) visible++;
      });
      assert.ok(total > 300, `${collection}/${animation}/${frame}: selected food has no visible surface`);
      assert.equal(visible, total, `${collection}/${animation}/${frame}/top${topIndex}/jacket${jacketIndex}: clothing occludes the selected food`);
      checked++;
    }
  }
  assert.equal(checked, 576);
});
