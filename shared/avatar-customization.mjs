// Pure, versioned selection and layer composition. No network or user balances.
export const AVATAR_CATEGORIES = ['hair', 'hat', 'top', 'jacket', 'bottom', 'shoes', 'accessory'];
const OPTIONAL = new Set(['hat', 'jacket', 'accessory']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/** Meal hands are separate; long sleeves own the covered arm silhouette. */
export function shouldHideBodyArms(style, animation, longSleeves) {
  return style === 'chibi' && ['eat', 'eatOnigiri', 'eatBento'].includes(animation) && longSleeves;
}

export function defaultAvatarSelection(pack, collection = 'girl') {
  const gender = collection === 'boy' ? 'boy' : 'girl';
  const catalog = pack.catalog[gender];
  const selection = {
    collection: gender,
    skin: pack.palettes.skin.find(p => p.id === 'peach')?.id ?? pack.palettes.skin[0].id,
    hairColor: pack.palettes.hair.find(p => p.id === 'espresso')?.id ?? pack.palettes.hair[0].id,
    eyeColor: pack.palettes.eyes[0].id,
  };
  for (const category of AVATAR_CATEGORIES)
    selection[category] = category === 'hat' || category === 'accessory' ? null : catalog[category][0].id;
  return selection;
}

export function normalizeAvatarSelection(pack, value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = defaultAvatarSelection(pack, input.collection);
  for (const [field, palette] of [['skin', 'skin'], ['hairColor', 'hair'], ['eyeColor', 'eyes']])
    if (pack.palettes[palette].some(p => p.id === input[field])) result[field] = input[field];
  for (const category of AVATAR_CATEGORIES) {
    if (OPTIONAL.has(category) && own(input, category) && input[category] === null)
      result[category] = null;
    else if (pack.catalog[result.collection][category].some(item => item.id === input[category]))
      result[category] = input[category];
  }
  return result;
}

/** Resolve per-frame pieces in a stable back-to-front order. */
export function resolveAvatarPieces(pack, rawSelection, style, animation, frame = 0) {
  if (!own(pack.styles, style)) throw new TypeError(`Unknown avatar style: ${style}`);
  if (!own(pack.animations, animation)) throw new TypeError(`Unknown avatar animation: ${animation}`);
  const supported = pack.styles[style].animations;
  if (supported && !supported.includes(animation)) animation = 'idle';
  const selection = normalizeAvatarSelection(pack, rawSelection);
  const prefix = `${style}/${selection.collection}`;
  const keys = [
    `${prefix}/body/${selection.skin}`,
    `${prefix}/eyes/${selection.eyeColor}`,
    `${prefix}/bottom/${selection.bottom}`,
    `${prefix}/shoes/${selection.shoes}`,
    `${prefix}/top/${selection.top}`,
    ...(selection.jacket ? [`${prefix}/jacket/${selection.jacket}`] : []),
    `${prefix}/hair/${selection.hair}/${selection.hairColor}/${selection.hat ? 'hatted' : 'plain'}`,
    ...(selection.hat ? [`${prefix}/hat/${selection.hat}`] : []),
    ...(selection.accessory ? [`${prefix}/accessory/${selection.accessory}`] : []),
    `${prefix}/props`,
  ];
  const index = Math.max(0, Math.trunc(Number.isFinite(frame) ? frame : 0)) % pack.animations[animation].frames;
  const topFrame = pack.variants[`${prefix}/top/${selection.top}`]?.frames[animation]?.[index];
  const hideArms = shouldHideBodyArms(style, animation, Boolean(selection.jacket || topFrame?.foreSleeveNear || topFrame?.foreSleeveFar));
  const layers = [];
  for (const slot of pack.styles[style].slots) {
    for (const key of keys) {
      if (hideArms && key === `${prefix}/body/${selection.skin}` && /^(arm|fore)(Near|Far)$/.test(slot)) continue;
      // A jacket owns its sleeves. A loose shirt cannot poke through a jacket.
      if (selection.jacket && key === `${prefix}/top/${selection.top}` && /^(sleeve|foreSleeve)/.test(slot)) continue;
      const variant = pack.variants[key];
      if (!variant) throw new Error(`Missing avatar variant: ${key}`);
      const frames = variant.frames[animation];
      if (!frames || frames.length !== pack.animations[animation].frames)
        throw new Error(`Incomplete animation: ${key}/${animation}`);
      const piece = frames[index][slot];
      if (!piece) continue;
      const [cell, offsetX, offsetY] = piece;
      const rect = variant.rects[cell];
      if (!rect) throw new Error(`Missing atlas cell: ${key}/${cell}`);
      const page = variant.pages[rect.page];
      layers.push({
        file: page.file, atlasWidth: page.width, atlasHeight: page.height,
        x: rect.x, y: rect.y, width: rect.w, height: rect.h,
        offsetX, offsetY, slot, variant: key,
      });
    }
  }
  return layers;
}
