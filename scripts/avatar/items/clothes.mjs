// Wardrobe: 10 tops, 10 bottoms and 10 shoes for each of girl and boy.
// Every item draws itself on any pose of either style through the garment renderers.
import { cel } from "../lib/canvas.mjs";
import { drawTop, drawBottom, drawShoes, rampOf, fold } from "./garments.mjs";
import * as D from "./details.mjs";

const weltPockets = (ctx, { sp, inner, R, hemY, k }) => {
  const { P } = ctx;
  for (const [a, b] of [[-10, -3]]) {
    const y = hemY - 9 * k;
    fold(sp, [[D.fx(P, a), y], [D.fx(P, b), y - 0.6 * k]], R[0], inner);
    fold(sp, [[D.fx(P, a), y + 1], [D.fx(P, b), y + 1 - 0.6 * k]], R[4], inner);
  }
};

const cargoPocket = (ctx, { sp, inner, l, R, far, k }) => {
  if (far && ctx.P.view === "side") return;
  const { S } = ctx;
  const mx = (l.hip[0] + l.knee[0]) / 2;
  const my = (l.hip[1] + l.knee[1]) / 2 + 2 * k;
  const out = ctx.P.view === "front" ? (l.side === "L" ? -1 : 1) : -1;
  const x = mx + out * 3 * k - 2.6 * k;
  const m = S.rect(x, my, 5.2 * k, 6 * k);
  cel(sp, m.and(inner), R, { shadow: 0.8 * k, outlineTone: 1 });
  cel(sp, S.rect(x - 0.4 * k, my - 0.6 * k, 6 * k, 2 * k).and(inner), R, { base: 2, outlineTone: 1 });
};

const jogDrawstring = (ctx, { sp, top, k }) => {
  const { S, P } = ctx;
  for (const d of [-1.4, 1.4]) sp.fill(S.taper([[D.fx(P, d), top + 2 * k], [D.fx(P, d) + 0.4 * k, top + 7 * k]], [0.8 * k, 0.8 * k]), "#f4f1ea");
};

const bow = (ctx, { sp, x, y, k }) => {
  const { S } = ctx;
  sp.fill(S.ellipse(x - 1.2 * k, y - 1.6 * k, 1.2 * k, 0.8 * k).or(S.ellipse(x + 1.2 * k, y - 1.6 * k, 1.2 * k, 0.8 * k)), "#c46f78");
};

const twoLayer = (shirt, outer) => (ctx) => {
  drawTop(ctx, shirt);
  drawTop(ctx, { ...outer, slot: "outer" });
};

export const TOPS = {
  girl: [
    { id: "campus-jacket", name: "Campus Jacket", draw: (c) => drawTop(c, { color: "#524b4d", fit: 2.4, loose: 0.9, hem: 3.5, neck: "none", open: { inner: "#f6f1e7", neck: "crew", gap: 2.6, lapel: 10, hem: -8.2, details: D.necklace }, details: weltPockets }) },
    { id: "daisy-tee", name: "Daisy Tee", draw: (c) => drawTop(c, { color: "#fbf8f1", fit: 1.2, sleeve: "short", details: (x, i) => D.chestPrint(x, i, "daisy") }) },
    { id: "candy-hoodie", name: "Candy Hoodie", draw: (c) => drawTop(c, { color: "#efc0cb", fit: 2, loose: 0.7, hem: 2.5, neck: "none", hemBand: true, cuff: true, details: (x, i) => { D.hood(x, i); D.kangarooPocket(x, i); D.drawstrings(x, i, "#fff8f6"); } }) },
    { id: "cream-cardigan", name: "Cream Cardigan", draw: (c) => drawTop(c, { color: "#ece0c4", fit: 1.8, loose: 0.6, hem: 3, cuff: true, hemBand: true, neck: "none", open: { inner: "#f7f3ea", neck: "crew", gap: 2, stripes: { color: "#41598a", every: 3.2, h: 1.2 } }, details: (x, i) => { D.knitRibs(x, i); D.buttons(x, { ...i, inner: i.inner.grow(2) }, { d: -3.4, n: 4, color: "#b98f62" }); } }) },
    { id: "sailor-blouse", name: "Sailor Blouse", draw: (c) => drawTop(c, { color: "#fbfaf6", fit: 1.6, loose: 0.3, hem: 2, sleeve: "short", cuff: "#2f4468", cuffLen: 1.8, neck: "v", details: (x, i) => D.sailorCollar(x, i) }) },
    { id: "breton-tee", name: "Breton Stripes", draw: (c) => drawTop(c, { color: "#f6f2ea", fit: 1.2, neck: "wide", stripes: { color: "#2e3f66", every: 3.2, h: 1.3 } }) },
    { id: "denim-jacket", name: "Denim Jacket", draw: (c) => drawTop(c, { color: "#6f8fb8", fit: 2, loose: 0.6, hem: 1, cuff: true, hemBand: true, hemBandH: 2.4, neck: "none", open: { inner: "#f8f5ee", neck: "crew", gap: 2.2, lapel: 6, lapelColor: "#7d9cc3" }, details: (x, i) => { D.chestPockets(x, i, { button: "#c9a25e" }); D.stitching(x, i); } }) },
    { id: "school-blazer", name: "School Blazer", draw: (c) => drawTop(c, { color: "#2f3c5c", fit: 1.8, loose: 0.5, hem: 4, neck: "none", open: { inner: "#fbfaf6", neck: "none", gap: 2.2, lapel: 11, details: (x, i) => { D.shirtCollar(x, i); D.ribbonBow(x, i); } }, details: (x, i) => { D.buttons(x, i, { d: -4.4, n: 2, y0: x.P.waistY - 2 * i.k, y1: x.P.waistY + 4 * i.k, color: "#d8b25a" }); weltPockets(x, i); } }) },
    { id: "sage-sweater", name: "Sage Sweater", draw: (c) => drawTop(c, { color: "#a9bf9c", fit: 2, loose: 0.8, hem: 2.5, cuff: true, hemBand: true, rib: "#98ae8b", details: D.knitRibs }) },
    { id: "varsity-jacket", name: "Varsity Jacket", draw: (c) => drawTop(c, { color: "#7d2f3e", sleeveColor: "#efe5d0", fit: 2, loose: 0.7, hem: 2, cuff: "#7d2f3e", hemBand: "#7d2f3e", rib: "#7d2f3e", details: (x, i) => { D.letterPatch(x, i, "B", "#efe5d0", "#c9a25e"); D.buttons(x, i, { d: 0.4, n: 4, color: "#efe5d0" }); }, sleeveDetails: D.sleeveStripes(["#efe5d0"]) }) },
  ],
  boy: [
    { id: "sage-hoodie", name: "Sage Hoodie", draw: (c) => drawTop(c, { color: "#8fa58a", fit: 2, loose: 0.8, hem: 2.5, neck: "none", hemBand: true, cuff: true, details: (x, i) => { D.hood(x, i); D.kangarooPocket(x, i); D.drawstrings(x, i); } }) },
    { id: "classic-tee", name: "Classic Tee", draw: (c) => drawTop(c, { color: "#f7f5ef", fit: 1.4, sleeve: "short", details: (x, i) => D.chestPrint(x, i, "star", "#e0a63a") }) },
    { id: "varsity-jacket", name: "Varsity Jacket", draw: (c) => drawTop(c, { color: "#2c3a5e", sleeveColor: "#efe5d0", fit: 2.2, loose: 0.8, hem: 2, cuff: "#2c3a5e", hemBand: "#2c3a5e", rib: "#2c3a5e", details: (x, i) => { D.letterPatch(x, i, "M", "#efe5d0", "#c84a3e"); D.buttons(x, i, { d: 0.4, n: 4, color: "#efe5d0" }); }, sleeveDetails: D.sleeveStripes(["#c84a3e", "#efe5d0"]) }) },
    { id: "denim-jacket", name: "Denim Jacket", draw: (c) => drawTop(c, { color: "#5f7fa8", fit: 2.2, loose: 0.7, hem: 1, cuff: true, hemBand: true, hemBandH: 2.4, neck: "none", open: { inner: "#bfc3c7", neck: "crew", gap: 2.2, lapel: 6, lapelColor: "#6d8db5" }, details: (x, i) => { D.chestPockets(x, i, { button: "#c9a25e" }); D.stitching(x, i); } }) },
    { id: "school-blazer", name: "School Blazer", draw: (c) => drawTop(c, { color: "#373c48", fit: 2, loose: 0.6, hem: 4, neck: "none", open: { inner: "#fbfaf6", neck: "none", gap: 2.2, lapel: 11, details: (x, i) => { D.shirtCollar(x, i); D.necktie(x, i, "#2c3a5e", "#c9a25e"); } }, details: (x, i) => { D.buttons(x, i, { d: -4.4, n: 2, y0: x.P.waistY - 2 * i.k, y1: x.P.waistY + 4 * i.k, color: "#d8b25a" }); weltPockets(x, i); } }) },
    { id: "flannel-shirt", name: "Flannel Shirt", draw: (c) => drawTop(c, { color: "#b8443e", fit: 2, loose: 0.7, hem: 2, cuff: true, neck: "none", plaid: { color: "#5b2a2e", every: 6, w: 1.6, thin: "#e8c9a0" }, open: { inner: "#f6f3ec", neck: "crew", gap: 2.4, lapel: 4 } }) },
    { id: "polo-shirt", name: "Polo Shirt", draw: (c) => drawTop(c, { color: "#6f9fc8", fit: 1.4, sleeve: "short", cuff: "#5f8fb8", cuffLen: 1.4, neck: "none", details: (x, i) => D.poloPlacket(x, i, "#7aaad3") }) },
    { id: "sweater-vest", name: "Sweater Vest", draw: twoLayer({ color: "#f8f6f0", fit: 1.4, cuff: true, neck: "none", details: D.shirtCollar }, { color: "#cbb48c", fit: 2, loose: 0.5, hem: 2, sleeve: "tank", neck: "v", hemBand: true, rib: "#b89f76", details: (x, i) => D.argyle(x, i, "#a8875e", "#7a5a3a") }) },
    { id: "striped-tee", name: "Striped Tee", draw: (c) => drawTop(c, { color: "#f4f1ea", fit: 1.4, sleeve: "short", stripes: { color: "#4f8a5b", every: 4, h: 1.6 } }) },
    { id: "bomber-jacket", name: "Bomber Jacket", draw: (c) => drawTop(c, { color: "#6b7350", fit: 2.4, loose: 0.6, hem: 1.5, cuff: "#3f4433", hemBand: "#3f4433", rib: "#3f4433", details: D.zipper }) },
  ],
};

export const BOTTOMS = {
  girl: [
    { id: "wide-trousers", name: "Wide Trousers", draw: (c) => drawBottom(c, { type: "pants", color: "#575053", fit: 1.8, wide: 3.4, cuff: { h: 3.4 }, belt: { color: "#3b2b25", buckle: "#cfc9bd" } }) },
    { id: "blue-jeans", name: "Blue Jeans", draw: (c) => drawBottom(c, { type: "pants", color: "#5876a3", fit: 1.2, wide: 0.6, crease: false, cuff: { h: 2.6, color: "#7896c1" } }) },
    { id: "pleated-skirt", name: "Pleated Skirt", draw: (c) => drawBottom(c, { type: "skirt", color: "#2f3c5c", skirt: { len: 12, flare: 6, pleats: 3 } }) },
    { id: "tartan-skirt", name: "Tartan Skirt", draw: (c) => drawBottom(c, { type: "skirt", color: "#a8343c", plaid: { color: "#2a2f4a", every: 6 }, skirt: { len: 11, flare: 6, pleats: 3 } }) },
    { id: "denim-shorts", name: "Denim Shorts", draw: (c) => drawBottom(c, { type: "shorts", color: "#6f8fbf", length: 0.36, fit: 1.6, wide: 1, crease: false, cuff: { h: 2.4, color: "#9db5d6" } }) },
    { id: "cargo-pants", name: "Cargo Pants", draw: (c) => drawBottom(c, { type: "pants", color: "#b0a07a", fit: 2, wide: 1.6, legDetails: cargoPocket }) },
    { id: "midi-skirt", name: "Midi Skirt", draw: (c) => drawBottom(c, { type: "skirt", color: "#d8c6a6", skirt: { len: 30, flare: 8, pleats: 2, pleatGap: 6 } }) },
    { id: "joggers", name: "Cosy Joggers", draw: (c) => drawBottom(c, { type: "pants", color: "#a9a8ad", fit: 2, wide: 0.6, crease: false, cuff: { h: 3, color: "#9a999f" }, details: jogDrawstring }) },
    { id: "culottes", name: "Culottes", draw: (c) => drawBottom(c, { type: "pants", color: "#7d8556", fit: 2.4, wide: 5, length: 0.78 }) },
    { id: "tennis-skirt", name: "Tennis Skirt", draw: (c) => drawBottom(c, { type: "skirt", color: "#f7f5f0", skirt: { len: 8, flare: 7, pleats: 4, pleatGap: 3 } }) },
  ],
  boy: [
    { id: "blue-jeans", name: "Blue Jeans", draw: (c) => drawBottom(c, { type: "pants", color: "#516f9c", fit: 1.4, wide: 0.6, crease: false, cuff: { h: 2.6, color: "#7190bd" } }) },
    { id: "school-trousers", name: "School Trousers", draw: (c) => drawBottom(c, { type: "pants", color: "#2e3036", fit: 1.4, wide: 0.6, belt: { color: "#1f1a18", buckle: "#c8c3b5" } }) },
    { id: "khaki-chinos", name: "Khaki Chinos", draw: (c) => drawBottom(c, { type: "pants", color: "#c8b48a", fit: 1.4, wide: 0.6, cuff: { h: 2.4 } }) },
    { id: "cargo-pants", name: "Cargo Pants", draw: (c) => drawBottom(c, { type: "pants", color: "#6b7350", fit: 2, wide: 1.6, legDetails: cargoPocket }) },
    { id: "denim-shorts", name: "Denim Shorts", draw: (c) => drawBottom(c, { type: "shorts", color: "#5f7fa8", length: 0.42, fit: 1.8, crease: false, cuff: { h: 2.2, color: "#86a2c6" } }) },
    { id: "track-pants", name: "Track Pants", draw: (c) => drawBottom(c, { type: "pants", color: "#2c3a5e", fit: 1.8, wide: 0.8, crease: false, stripe: "#f2efe8", cuff: { h: 2.6 } }) },
    { id: "grey-joggers", name: "Grey Joggers", draw: (c) => drawBottom(c, { type: "pants", color: "#9c9ba2", fit: 2, crease: false, cuff: { h: 3 }, details: jogDrawstring }) },
    { id: "plaid-trousers", name: "Plaid Trousers", draw: (c) => drawBottom(c, { type: "pants", color: "#8a6a4a", fit: 1.4, plaid: { color: "#5b4330", every: 7, w: 1.4 } }) },
    { id: "cargo-shorts", name: "Cargo Shorts", draw: (c) => drawBottom(c, { type: "shorts", color: "#b7a77f", length: 0.5, fit: 2.2, wide: 1, legDetails: cargoPocket }) },
    { id: "wide-pants", name: "Wide Pants", draw: (c) => drawBottom(c, { type: "pants", color: "#4a4446", fit: 2, wide: 3.4, cuff: { h: 3.4 } }) },
  ],
};

export const SHOES = {
  girl: [
    { id: "chunky-sneakers", name: "Chunky Sneakers", draw: (c) => drawShoes(c, { upper: "#f2ede4", sole: "#e4ddd0", chunky: 1.8, lace: "#e8e1d5", toeCap: "#ece6db" }) },
    { id: "canvas-sneakers", name: "Canvas Sneakers", draw: (c) => drawShoes(c, { upper: "#f6f3ec", sole: "#efe9de", toeCap: "#ffffff", lace: "#ffffff", accent: "#c8443e" }) },
    { id: "mary-janes", name: "Mary Janes", draw: (c) => drawShoes(c, { upper: "#2c2627", sole: "#1f1a1a", chunky: 0.4, low: true, strap: "#2c2627", socks: "#f6f3ec", sockH: 5 }) },
    { id: "penny-loafers", name: "Penny Loafers", draw: (c) => drawShoes(c, { upper: "#7a4a32", sole: "#3a2a22", chunky: 0.5, low: true, strap: "#6a3e2a", socks: "#f6f3ec", sockH: 4 }) },
    { id: "ankle-boots", name: "Ankle Boots", draw: (c) => drawShoes(c, { upper: "#b98a5a", sole: "#5a4030", high: 5, chunky: 1 }) },
    { id: "rain-boots", name: "Rain Boots", draw: (c) => drawShoes(c, { upper: "#f2c53d", sole: "#e3b02c", high: 8, gloss: true, chunky: 0.8 }) },
    { id: "running-shoes", name: "Running Shoes", draw: (c) => drawShoes(c, { upper: "#f3b4c4", sole: "#fbf8f2", lace: "#ffffff", accent: "#ffffff", chunky: 1.4 }) },
    { id: "ballet-flats", name: "Ballet Flats", draw: (c) => drawShoes(c, { upper: "#e9b8b4", sole: "#c99894", low: true, chunky: 0.3, details: (x, i) => bow(x, { ...i, x: i.r(9.4, 0.4)[0], y: i.r(9.4, 0.4)[1] }), frontDetails: (x, i) => bow(x, { ...i, y: i.y + i.k }) }) },
    { id: "high-tops", name: "High-tops", draw: (c) => drawShoes(c, { upper: "#b9a8d8", sole: "#f6f3ec", high: 4, lace: "#ffffff", toeCap: "#f6f3ec" }) },
    { id: "strappy-sandals", name: "Strappy Sandals", draw: (c) => drawShoes(c, { upper: "#8a5a3c", sole: "#c8a07a", sandal: true, chunky: 0.6 }) },
  ],
  boy: [
    { id: "white-sneakers", name: "White Sneakers", draw: (c) => drawShoes(c, { upper: "#f4f1ea", sole: "#e6dfd2", lace: "#ffffff", accent: "#2f3f63", toeCap: "#ebe6dc" }) },
    { id: "red-high-tops", name: "Red High-tops", draw: (c) => drawShoes(c, { upper: "#c8443e", sole: "#f4f1ea", high: 4, lace: "#ffffff", toeCap: "#f4f1ea" }) },
    { id: "blue-runners", name: "Blue Runners", draw: (c) => drawShoes(c, { upper: "#4f78b8", sole: "#f4f1ea", accent: "#f4f1ea", lace: "#ffffff", chunky: 1.4 }) },
    { id: "brown-boots", name: "Brown Boots", draw: (c) => drawShoes(c, { upper: "#6b4a34", sole: "#3a2a22", high: 5, lace: "#d8c09a", chunky: 1.2 }) },
    { id: "black-loafers", name: "Black Loafers", draw: (c) => drawShoes(c, { upper: "#2a2626", sole: "#1a1616", low: true, chunky: 0.5, strap: "#3a3434", socks: "#3a3a44", sockH: 4 }) },
    { id: "checker-slip-ons", name: "Checker Slip-ons", draw: (c) => drawShoes(c, { upper: "#f4f1ea", checker: "#2a2626", sole: "#f4f1ea", low: true, chunky: 0.8 }) },
    { id: "court-shoes", name: "Court Shoes", draw: (c) => drawShoes(c, { upper: "#f6f3ec", sole: "#ece6db", accent: "#e8823a", lace: "#ffffff", high: 2 }) },
    { id: "sport-sandals", name: "Sport Sandals", draw: (c) => drawShoes(c, { upper: "#2e3036", sole: "#5a5c62", sandal: true, chunky: 0.8 }) },
    { id: "navy-canvas", name: "Navy Canvas", draw: (c) => drawShoes(c, { upper: "#2f3f63", sole: "#f4f1ea", toeCap: "#f4f1ea", lace: "#ffffff" }) },
    { id: "hiking-boots", name: "Hiking Boots", draw: (c) => drawShoes(c, { upper: "#b08a5a", sole: "#4a3a2e", high: 5, lace: "#c8443e", chunky: 1.6, toeCap: "#8a6a44" }) },
  ],
};

export { rampOf };
