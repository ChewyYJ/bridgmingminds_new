// Original, composable wardrobe artwork. Each item draws only its own layers.
// All geometry follows the supplied rig pose; no finished-character cutouts or
// cached mutable contexts are shared between items, frames or body styles.
import { cel, strokeLine } from "../lib/canvas.mjs";
import { drawHair, HAIR_STYLES } from "./hair.mjs";
import { BOTTOMS, SHOES } from "./clothes.mjs";
import { drawTop, rampOf, fold } from "./garments.mjs";
import * as D from "./details.mjs";

export const WARDROBE_VERSION = "wardrobe-v1";
export const CATEGORY_ORDER = Object.freeze([
  "hair", "hat", "top", "jacket", "bottom", "shoes", "accessory",
]);
export const CATEGORY_LABELS = Object.freeze({
  hair: "Hair", hat: "Hats", top: "Tops", jacket: "Jackets",
  bottom: "Bottoms", shoes: "Shoes", accessory: "Accessories",
});

const item = (collection, category, slug, name, render, extra = {}) =>
  Object.freeze({ id: `${collection}-${category}-${slug}`, name, category, collection,
    draw: (ctx, options = {}) => render(ctx, options), ...extra });

function hairstyle(collection, slug, name) {
  const source = HAIR_STYLES[collection].find((entry) => entry.id === slug);
  if (!source) throw new Error(`Missing hairstyle ${collection}/${slug}`);
  return item(collection, "hair", slug, name, (ctx, options = {}) =>
    drawHair(ctx, source, { hatted: Boolean(options.hatted) }),
  { defaultHairColor: source.color });
}

function existing(collection, category, source, slug) {
  const entry = source[collection].find((candidate) => candidate.id === slug);
  if (!entry) throw new Error(`Missing wardrobe item ${collection}/${category}/${slug}`);
  return item(collection, category, slug, entry.name, (ctx, _options = {}) => entry.draw(ctx));
}

const shirt = (collection, slug, name, spec) => item(collection, "top", slug, name,
  (ctx, _options = {}) => drawTop(ctx, spec));
const jacket = (collection, slug, name, spec) => item(collection, "jacket", slug, name,
  (ctx, _options = {}) => drawTop(ctx, {
    fit: 2, loose: 0.65, sleeve: "long", sleeveEase: 1.4,
    sleeveTo: 0.985, cuff: true, neck: "none", slot: "outer", ...spec,
    open: { transparent: true, gap: 3.8, spread: 1.6, ...spec.open },
  }));

function pocket(ctx, { sp, inner, R, hemY, k }) {
  const x = D.fx(ctx.P, -8.5);
  fold(sp, [[x - 2.7 * k, hemY - 9 * k], [x + 2.7 * k, hemY - 8.4 * k]], R[1], inner);
  fold(sp, [[x - 2.7 * k, hemY - 8 * k], [x + 2.7 * k, hemY - 7.4 * k]], R[4], inner);
}

function ribLines(ctx, { sp, inner, R, k }) {
  const step = Math.max(2, Math.round(2.8 * k));
  inner.forEach((x, y) => {
    if ((x - Math.round(ctx.P.frontX)) % step === 0 && sp.get(x, y) === R[3]) sp.set(x, y, R[2]);
  });
}

function hatFrame(ctx) {
  const { P, HEAD: h } = ctx;
  const side = P.view === "side";
  return {
    cx: P.head.cx, cy: P.head.cy,
    rx: Math.max(Math.abs(h.left), Math.abs(h.right)) + (side ? 3.5 : 5),
    band: P.head.cy + h.hatLine,
    top: P.head.cy + h.top - (side ? 4 : 7),
    unit: side ? 1 : 1.65,
    side,
  };
}

// Hats start at the shared hatLine, leaving eyes and forehead visible. Their
// opaque crown covers the clipped hair variant; hair below the band stays free.
function drawCap(ctx, color, newsboy = false) {
  const { S, L } = ctx;
  const { cx, rx, band, top, unit: u, side } = hatFrame(ctx);
  const sp = L("hat");
  const R = rampOf(color);
  const crown = newsboy
    ? S.blob([[cx - rx - 2 * u, band - 4 * u], [cx - rx + 2 * u, top + 4 * u],
      [cx - 7 * u, top - 2 * u], [cx + 10 * u, top - 1 * u],
      [cx + rx + u, top + 7 * u], [cx + rx, band - 2 * u]])
    : S.ellipse(cx, band - 3 * u, rx, band - top).and(S.rect(0, 0, ctx.W, band + u));
  cel(sp, crown, R, { shadow: 3 * u, rim: 1.4 * u });
  const bandMask = S.rect(cx - rx + u, band - 3 * u, rx * 2 - 2 * u, 4 * u).and(crown.grow(1));
  cel(sp, bandMask, R, { base: 2, shadow: u });
  const brim = side
    ? S.blob([[cx + 3 * u, band - 1.5 * u], [cx + rx + 6 * u, band - u],
      [cx + rx + 12 * u, band + 2 * u], [cx + rx + 10 * u, band + 5 * u],
      [cx + 3 * u, band + 3 * u]])
    : S.blob([[cx - rx + 5 * u, band - u], [cx + rx - 5 * u, band - u],
      [cx + rx - 3 * u, band + 3 * u], [cx + 5 * u, band + 6 * u],
      [cx - rx + 3 * u, band + 3 * u]]);
  cel(sp, brim, R, { base: newsboy ? 2 : 3, shadow: 1.4 * u, rim: u });
  if (newsboy) {
    strokeLine(sp, [[cx - rx + 2 * u, band - 5 * u], [cx - 2 * u, top + 3 * u], [cx + rx - 3 * u, band - 5 * u]], R[2], crown.shrink(1));
  } else {
    strokeLine(sp, [[cx - 4 * u, top + 3 * u], [cx - 5 * u, band - 4 * u]], R[2], crown.shrink(1));
    cel(sp, S.rect(cx + (side ? 5 : -3) * u, band - 10 * u, 6 * u, 4 * u).and(crown), rampOf("#d8cfba"), { outlineTone: 1 });
  }
}

function drawBeanie(ctx, color) {
  const { S, L } = ctx;
  const { cx, rx, band, top, unit: u } = hatFrame(ctx);
  const sp = L("hat");
  const R = rampOf(color);
  const cap = S.blob([[cx - rx, band], [cx - rx - u, top + 10 * u],
    [cx - rx * 0.5, top - 3 * u], [cx + rx * 0.45, top - 4 * u],
    [cx + rx, top + 7 * u], [cx + rx, band]]);
  cel(sp, cap, R, { shadow: 3 * u, rim: 1.3 * u });
  const cuff = S.rect(cx - rx - u, band - 6 * u, rx * 2 + 2 * u, 7 * u);
  cel(sp, cuff, R, { base: 4, shadow: 2 * u, rim: 1 });
  const inner = cuff.shrink(1);
  inner.forEach((x, y) => { if ((x - Math.round(cx)) % Math.max(2, Math.round(3 * u)) === 0) sp.set(x, y, R[2]); });
  cel(sp, S.rect(cx + rx * 0.32, band - 4.8 * u, 5 * u, 3.5 * u), rampOf("#c8bea9"), { outlineTone: 1 });
}

function drawBucket(ctx, color, wide = false) {
  const { S, L } = ctx;
  const { cx, rx, band, top, unit: u } = hatFrame(ctx);
  const sp = L("hat");
  const R = rampOf(color);
  const crown = S.blob([[cx - rx + 4 * u, top + 3 * u], [cx + rx - 4 * u, top + 3 * u],
    [cx + rx, band - 3 * u], [cx - rx, band - 3 * u]]);
  cel(sp, crown, R, { shadow: 3 * u, rim: 1.4 * u });
  const brim = S.blob([[cx - rx, band - 5 * u], [cx + rx, band - 5 * u],
    [cx + rx + (wide ? 12 : 5) * u, band + 3 * u],
    [cx + rx * 0.5, band + (wide ? 5 : 4) * u], [cx - rx - (wide ? 12 : 5) * u, band + 3 * u]]);
  cel(sp, brim, R, { shadow: 2 * u, rim: u });
  const bandMask = crown.and(S.rect(0, band - 8 * u, ctx.W, 3 * u));
  sp.fill(bandMask, wide ? "#766553" : R[2]);
  strokeLine(sp, [[cx - rx + 2 * u, band + u], [cx, band + 2 * u], [cx + rx - 2 * u, band + u]], R[2], brim.shrink(1));
  if (wide) {
    const bow = S.blob([[cx - rx + 2 * u, band - 7 * u], [cx - rx - 3 * u, band - 10 * u],
      [cx - rx - 2 * u, band - 4 * u], [cx - rx + 2 * u, band - 6 * u],
      [cx - rx + 6 * u, band - 10 * u], [cx - rx + 6 * u, band - 4 * u]]);
    cel(sp, bow, rampOf("#766553"), { shadow: u });
  }
}

function drawBeret(ctx, color) {
  const { S, L } = ctx;
  const { cx, rx, band, top, unit: u } = hatFrame(ctx);
  const sp = L("hat");
  const R = rampOf(color);
  const crown = S.blob([[cx - rx - 4 * u, band - 8 * u], [cx - rx * 0.65, top - 3 * u],
    [cx + rx * 0.55, top - 5 * u], [cx + rx + 5 * u, top + 3 * u],
    [cx + rx + 4 * u, band - 6 * u], [cx + rx * 0.55, band - u], [cx - rx + 3 * u, band]]);
  cel(sp, crown, R, { shadow: 4 * u, rim: 1.5 * u });
  cel(sp, S.rect(cx - rx + 3 * u, band - 3 * u, rx * 2 - 6 * u, 4 * u), R, { base: 2, shadow: u });
  cel(sp, S.rect(cx + 3 * u, top - 7 * u, 2 * u, 4 * u), R, { base: 2, shadow: u });
  strokeLine(sp, [[cx + rx * 0.6, top + 2 * u], [cx + rx * 0.55, band - 4 * u]], R[2], crown.shrink(1));
}

function glasses(ctx, color, round) {
  const { S, L, P, HEAD: h } = ctx;
  const sp = L("accFace");
  const side = P.view === "side";
  const { cx, cy } = P.head;
  const u = side ? 1 : 1.65;
  const points = Object.values(h.eyes).map(([x, y]) => [cx + x, cy + y]);
  const R = rampOf(color);
  points.forEach(([x, y], index) => {
    const rx = (side ? (index === 0 ? 6.3 : 4.8) : 7.4) * u;
    const ry = (round ? 6.1 : 5) * u;
    const mask = round ? S.ellipse(x, y, rx, ry) : S.blob([
      [x - rx, y - ry + u], [x - rx + u, y - ry], [x + rx - u, y - ry],
      [x + rx, y - ry + u], [x + rx - u, y + ry], [x - rx + u, y + ry],
    ]);
    sp.fill(mask.minus(mask.shrink(Math.max(1, Math.round(u)))), R[1]);
    strokeLine(sp, [[x - rx + 2 * u, y - ry + u], [x - rx + 4 * u, y - ry + u]], R[4]);
  });
  const [a, b] = points;
  sp.fill(S.taper([[a[0] + 5 * u, a[1] - u], [(a[0] + b[0]) / 2, a[1] - 2 * u], [b[0] - 4 * u, b[1] - u]], [u, u, u]), R[1]);
  const left = Math.min(...points.map((p) => p[0])) - 6 * u;
  strokeLine(sp, [[left, a[1] - 2 * u], [cx + h.left, cy + h.ear[1] - 2 * u]], R[1]);
}

function headphones(ctx, color, slim) {
  const { S, L, P, HEAD: h } = ctx;
  const { cx, cy } = P.head;
  const side = P.view === "side";
  const u = side ? 1 : 1.65;
  const rx = Math.max(Math.abs(h.left), Math.abs(h.right)) + 3 * u;
  const crownY = cy + h.top - 2 * u;
  const earY = cy + h.ear[1];
  const R = rampOf(color);
  const path = [[cx - rx, earY], [cx - rx - u, cy + h.top * 0.45],
    [cx - rx * 0.6, crownY], [cx + rx * 0.4, crownY],
    [cx + rx + u, cy + h.top * 0.45], [cx + rx, earY]];
  const band = S.taper(path, Array(path.length).fill((slim ? 2.3 : 3.6) * u));
  cel(L("accHead"), band, R, { shadow: u, rim: 1 });
  const ears = side ? [[cx + h.ear[0] - 2 * u, earY]] : [[cx - rx, earY], [cx + rx, earY]];
  for (const [x, y] of ears) {
    const cup = S.ellipse(x, y, (slim ? 3.6 : 4.8) * u, (slim ? 6.4 : 8) * u);
    cel(L("accHead"), cup, R, { shadow: 1.6 * u, rim: u });
    cel(L("accHead"), S.ellipse(x + u, y, (slim ? 2 : 2.8) * u, (slim ? 4.7 : 5.6) * u), R, { base: 4, outlineTone: 2, shadow: u });
  }
}

function shoulderBag(ctx, color, mini) {
  const { S, L, P } = ctx;
  const k = P.k;
  const front = P.view === "front";
  const R = rampOf(color);
  const sp = L("accMid");
  const bagW = (mini ? 10 : 13.5) * k;
  const bagH = (mini ? 9 : 11.5) * k;
  const x = P.frontX + (front ? 2.6 : -8.5) * k;
  const y = P.hipY - (mini ? 4 : 2) * k;
  const start = [P.box.shL[0] + 4 * k, P.shoulderY + 2 * k];
  const end = [x + bagW * 0.65, y + 2 * k];
  const strap = S.taper([start, [P.frontX - 2 * k, P.chestY + 2 * k], end], [2.2 * k, 2.2 * k, 2.2 * k]);
  cel(sp, strap, R, { base: 2, shadow: k, rim: 0.5 * k });
  const bag = mini
    ? S.blob([[x, y + 2 * k], [x + 2 * k, y], [x + bagW - 2 * k, y], [x + bagW, y + 2 * k],
      [x + bagW - k, y + bagH], [x + k, y + bagH]])
    : S.blob([[x, y], [x + bagW, y + k], [x + bagW + k, y + bagH - k],
      [x + bagW - k, y + bagH], [x, y + bagH], [x - k, y + 2 * k]]);
  cel(sp, bag, R, { shadow: 2 * k, rim: k });
  const flap = bag.and(S.rect(x - k, y, bagW + 2 * k, bagH * (mini ? 0.46 : 0.38)));
  cel(sp, flap, R, { base: 4, shadow: k, outlineTone: 1 });
  cel(sp, S.rect(x + bagW * 0.5 - k, y + bagH * 0.38, 2 * k, 2.2 * k), rampOf("#b4a386"), { outlineTone: 1 });
}

export const WARDROBE = Object.freeze({
  boy: Object.freeze({
    hair: Object.freeze([
      hairstyle("boy", "sweep", "Side sweep"),
      hairstyle("boy", "curls", "Short curls"),
      hairstyle("boy", "curtains", "Curtain cut"),
    ]),
    hat: Object.freeze([
      item("boy", "hat", "field-cap", "Field cap", (ctx) => drawCap(ctx, "#819078")),
      item("boy", "hat", "rib-beanie", "Ribbed beanie", (ctx) => drawBeanie(ctx, "#555250")),
      item("boy", "hat", "canvas-bucket", "Canvas bucket", (ctx) => drawBucket(ctx, "#b7a78d")),
    ]),
    top: Object.freeze([
      shirt("boy", "everyday-tee", "Everyday tee", { color: "#eee9de", fit: 1.1, sleeve: "short", sleeveEase: 0.8, neck: "crew" }),
      shirt("boy", "sage-polo", "Sage polo", { color: "#899785", fit: 1.1, sleeve: "short", sleeveEase: 0.8, neck: "none", cuff: true, details: (ctx, info) => D.poloPlacket(ctx, info, "#9aa591") }),
      shirt("boy", "stripe-knit", "Stripe knit", { color: "#c8bda8", fit: 1, sleeveEase: 0.7, neck: "crew", stripes: { color: "#645e55", every: 5.5, h: 0.8 }, cuff: true }),
    ]),
    jacket: Object.freeze([
      jacket("boy", "city-overshirt", "City overshirt", { color: "#575957", hem: 3, open: { lapel: 5 }, details: D.chestPockets }),
      jacket("boy", "weekend-bomber", "Weekend bomber", { color: "#9a8d78", hem: 1.5, hemBand: true, open: { gap: 3.5 }, details: pocket }),
      jacket("boy", "slate-denim", "Slate denim jacket", { color: "#70818b", hem: 2, hemBand: true, open: { lapel: 6 }, details: (ctx, info) => { D.chestPockets(ctx, info); D.stitching(ctx, info, "#aab2ad"); } }),
    ]),
    bottom: Object.freeze([
      existing("boy", "bottom", BOTTOMS, "school-trousers"),
      existing("boy", "bottom", BOTTOMS, "cargo-pants"),
      existing("boy", "bottom", BOTTOMS, "blue-jeans"),
    ]),
    shoes: Object.freeze([
      existing("boy", "shoes", SHOES, "white-sneakers"),
      existing("boy", "shoes", SHOES, "brown-boots"),
      existing("boy", "shoes", SHOES, "black-loafers"),
    ]),
    accessory: Object.freeze([
      item("boy", "accessory", "square-glasses", "Square glasses", (ctx) => glasses(ctx, "#57534d", false)),
      item("boy", "accessory", "studio-headphones", "Studio headphones", (ctx) => headphones(ctx, "#555956", false)),
      item("boy", "accessory", "canvas-messenger", "Canvas messenger", (ctx) => shoulderBag(ctx, "#7f8b76", false)),
    ]),
  }),
  girl: Object.freeze({
    hair: Object.freeze([
      hairstyle("girl", "waves", "Soft waves"),
      hairstyle("girl", "bob", "Classic bob"),
      hairstyle("girl", "ponytail", "High ponytail"),
    ]),
    hat: Object.freeze([
      item("girl", "hat", "wool-beret", "Wool beret", (ctx) => drawBeret(ctx, "#947967")),
      item("girl", "hat", "newsboy-cap", "Newsboy cap", (ctx) => drawCap(ctx, "#625d58", true)),
      item("girl", "hat", "ribbon-sunhat", "Ribbon sunhat", (ctx) => drawBucket(ctx, "#d0bea0", true)),
    ]),
    top: Object.freeze([
      shirt("girl", "cotton-tee", "Cotton tee", { color: "#f1e8db", fit: 0.8, sleeve: "cap", sleeveEase: 0.6, neck: "wide", hem: 0.5 }),
      shirt("girl", "sage-blouse", "Sage blouse", { color: "#a5b09b", fit: 1.1, loose: 0.2, sleeve: "short", sleeveEase: 0.8, neck: "none", details: (ctx, info) => { D.shirtCollar(ctx, info, "#b6c0ac"); D.buttons(ctx, info, { n: 3, color: "#e5ddca" }); } }),
      shirt("girl", "oat-rib-knit", "Oat rib knit", { color: "#cabb9f", fit: 0.9, sleeveEase: 0.6, neck: "crew", cuff: true, hemBand: true, details: ribLines }),
    ]),
    jacket: Object.freeze([
      jacket("girl", "tailored-blazer", "Tailored blazer", { color: "#5c5556", hem: 4, loose: 0.35, open: { lapel: 10 }, details: pocket }),
      jacket("girl", "soft-cardigan", "Soft cardigan", { color: "#b5a58e", hem: 3, open: { gap: 4.5 }, hemBand: true, details: (ctx, info) => { ribLines(ctx, info); pocket(ctx, info); } }),
      jacket("girl", "sage-cropped", "Sage cropped jacket", { color: "#8b9c87", hem: 0.5, hemBand: true, open: { lapel: 5 }, details: D.chestPockets }),
    ]),
    bottom: Object.freeze([
      existing("girl", "bottom", BOTTOMS, "wide-trousers"),
      existing("girl", "bottom", BOTTOMS, "blue-jeans"),
      existing("girl", "bottom", BOTTOMS, "pleated-skirt"),
    ]),
    shoes: Object.freeze([
      existing("girl", "shoes", SHOES, "chunky-sneakers"),
      existing("girl", "shoes", SHOES, "penny-loafers"),
      existing("girl", "shoes", SHOES, "ankle-boots"),
    ]),
    accessory: Object.freeze([
      item("girl", "accessory", "round-glasses", "Round glasses", (ctx) => glasses(ctx, "#8a6d52", true)),
      item("girl", "accessory", "slim-headphones", "Slim headphones", (ctx) => headphones(ctx, "#c8bda7", true)),
      item("girl", "accessory", "mini-crossbody", "Mini crossbody", (ctx) => shoulderBag(ctx, "#9e7f66", true)),
    ]),
  }),
});
