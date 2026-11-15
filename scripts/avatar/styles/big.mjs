// "Big" style: HD pixel character (~232 px tall, about 5 heads) in 3/4 view,
// facing right, for Debate Street and the outfit preview. Mirror to face left.
import { Shapes, Sprite, cel } from "../lib/canvas.mjs";
import { R, WHITE, MOUTH } from "../lib/palettes.mjs";
import { ik, rot } from "../lib/rig.mjs";

export const W = 176;
export const H = 264;
export const K = 1.83; // design units (96x144 grid) -> pixels
// Fixed logical ground anchor; animation content moves inside this canvas.
export const FOOT_PIVOT = [88, 247];

export const SLOTS = [
  "fxBack", "hairBack", "accBack", "propBack", "armFar", "sleeveFar", "accHandFar", "legFar", "shoeFar", "pantFar",
  "legNear", "shoeNear", "pantNear", "torso", "bottom", "top", "outer", "accMid", "armNear",
  "sleeveNear", "accHand", "accFront", "propMid", "head", "face", "hairShade", "accFace", "hairFront", "hat", "accHead",
  "foreFar", "foreSleeveFar", "foreNear", "foreSleeveNear", "accHandFore", "propFront", "fx",
];

export const ANIMATIONS = {
  idle: { frames: 8, fps: 4, loopFrom: 0 },
  walk: { frames: 8, fps: 10, loopFrom: 0 },
  greet: { frames: 8, fps: 8, loopFrom: 0 },
  speak: { frames: 8, fps: 8, loopFrom: 0 },
  celebrate: { frames: 8, fps: 9, loopFrom: 0 },
  eat: { frames: 8, fps: 6, loopFrom: 0 },
  cheer: { frames: 8, fps: 9, loopFrom: 0 },
  victory: { frames: 8, fps: 9, loopFrom: 0 },
};

/** Head landmarks relative to the skull centre (used by hair, hats, accessories). */
export const HEAD = {
  view: "side",
  top: -18.6,
  chin: 20.4,
  left: -17,
  right: 17.2,
  faceX: 3.5,
  hairline: -9,
  brow: -6,
  ear: [-14, 3.6],
  eyes: { near: [-5, 3], far: [8, 3] },
  mouth: [6, 15],
  vol: 4,
  levels: { ear: 6, chin: 20, shoulder: 34, chest: 52, waist: 72 },
  hatLine: -10,
};

const THIGH = 55;
const SHIN = 55.5;
const UPPER = 30;
const FORE = 25.5;
const ANKLE_Y = 238.4;

const WALK_LEG = [
  { dx: 25, dy: -2.6, foot: -16 },
  { dx: 15, dy: 0, foot: 0 },
  { dx: 2.2, dy: 0, foot: 0 },
  { dx: -10.6, dy: -0.4, foot: 9 },
  { dx: -23, dy: -4.8, foot: 36 },
  { dx: -17.6, dy: -12.4, foot: 42 },
  { dx: -4.4, dy: -16.4, foot: 20 },
  { dx: 12.4, dy: -8.4, foot: -8 },
];
const WALK_BOB = [2, 4, 0, -2, 2, 4, 0, -2];
const WALK_ARM = [-15, -9, 0, 9, 15, 9, 0, -9];
const IDLE_BOB = [0, 0, 1, 1, 2, 2, 1, 1];

function footGeom(ankle, angle) {
  const r = (p) => rot([ankle[0] + p[0], ankle[1] + p[1]], ankle, angle);
  return { ankle, angle, heel: r([-5, 6]), toe: r([18, 7]), top: r([6, 0.4]) };
}

export function pose(anim, f, gender) {
  if (!ANIMATIONS[anim] || !Number.isInteger(f) || f < 0 || f >= 8)
    throw new RangeError(`Unknown big animation frame ${anim}:${f}`);
  const action = anim === "cheer" || anim === "victory" ? "celebrate" : anim;
  const boy = gender === "boy";
  let up = 0;
  let hipDy = 0;
  let face = "open";
  let mouth = "smile";
  let ankles = { near: [77.6, ANKLE_Y], far: [99.6, ANKLE_Y] };
  let feet = { near: 0, far: 0 };
  let hands = { near: [69.4, 137], far: [108, 137.4] };
  let sway = 0;
  const hip = { near: [80, 127], far: [96.8, 127] };
  if (action === "idle") {
    up = IDLE_BOB[f];
    face = f === 5 ? "blink" : "open";
    ankles = { near: [77.6, ANKLE_Y], far: [99.6, ANKLE_Y] };
    feet = { near: 0, far: 0 };
    hands = { near: [69.4, 137 + up], far: [108, 137.4 + up] };
  } else if (action === "walk") {
    const b = WALK_BOB[f];
    up = b;
    hipDy = b;
    sway = [-2, -3, -2, 0, -2, -3, -2, 0][f];
    const n = WALK_LEG[f];
    const r = WALK_LEG[(f + 4) % 8];
    // Rotating a planted toe down must raise its ankle, otherwise thick soles
    // pass through the ground and can clip the canvas during toe-off.
    const toeLift = (step) => Math.max(0, Math.sin(step.foot * Math.PI / 180) * 18);
    ankles = { near: [hip.near[0] + n.dx, ANKLE_Y + n.dy - toeLift(n)], far: [hip.far[0] + r.dx, ANKLE_Y + r.dy - toeLift(r)] };
    feet = { near: n.foot, far: r.foot };
    const an = WALK_ARM[f];
    const af = WALK_ARM[(f + 4) % 8];
    hands = {
      near: [69 + an, 139.6 + b - Math.abs(an) * 0.5],
      far: [106.6 + af, 139.6 + b - Math.abs(af) * 0.5],
    };
  } else if (action === "greet") {
    up = [0, 0, 1, 1, 0, 0, 1, 0][f];
    hands.near = [[52, 51], [47, 45], [53, 42], [60, 46], [53, 43], [47, 46], [53, 50], [57, 53]][f];
    hands.far = [108, 137 + up];
    face = f === 6 ? "blink" : "open";
  } else if (action === "speak") {
    up = [0, 1, 1, 0, -1, 0, 1, 0][f];
    hands.near = [[58, 111], [52, 106], [48, 103], [52, 105], [57, 110], [61, 113], [58, 111], [56, 109]][f];
    hands.far = [109, 135 + up];
    mouth = ["smile", "open", "o", "open", "smile", "o", "open", "smile"][f];
  } else if (action === "celebrate") {
    up = [2, -2, -6, -8, -5, -1, 1, 0][f];
    hipDy = up;
    const lift = Math.min(0, up);
    ankles = { near: [76, ANKLE_Y + lift], far: [101, ANKLE_Y + lift] };
    hands = {
      near: [[54, 53], [49, 45], [50, 42], [54, 44], [50, 45], [48, 49], [52, 53], [55, 54]][f],
      far: [[126, 53], [130, 46], [127, 42], [124, 44], [128, 45], [131, 49], [127, 53], [124, 54]][f],
    };
    for (const hand of Object.values(hands)) hand[1] += up;
    face = "happy";
    mouth = "open";
  } else if (action === "eat") {
    up = [0, 0, -1, -1, 0, 1, 1, 0][f];
    hands.near = [[102, 101], [100, 89], [94, 73], [94, 72], [98, 86], [102, 100], [103, 103], [102, 102]][f];
    hands.far = [112, 118 + up];
    mouth = ["smile", "o", "o", "o", "chew", "chew", "smile", "smile"][f];
    face = f > 3 && f < 7 ? "happy" : "open";
  }
  const cx = 88;
  const cy = 41 + up;
  const shoulders = { near: [boy ? 73.4 : 74.8, 83 + up], far: [boy ? 104 : 102.6, 83 + up] };
  const hips = { near: [hip.near[0], hip.near[1] + hipDy], far: [hip.far[0], hip.far[1] + hipDy] };
  const arm = (side) => {
    const s = shoulders[side];
    const outward = side === "near" ? -1 : 1;
    const { joint, end } = ik(s, hands[side], UPPER, FORE, (a, b) =>
      side === "near" && (action === "eat" || action === "speak")
        ? (a[1] > b[1] ? a : b)
        : (a[0] * outward > b[0] * outward ? a : b));
    const dir = Math.atan2(end[1] - joint[1], end[0] - joint[0]);
    const raised = hands[side][1] < s[1] - 5 || (action === "eat" && side === "near");
    return {
      shoulder: s,
      elbow: joint,
      wrist: end,
      dir,
      hand: [end[0] + Math.cos(dir) * 5, end[1] + Math.sin(dir) * 5],
      far: side === "far",
      raised,
      shape: action === "greet" && side === "near" ? "open" : "mitt",
      side,
      widths: [14, 11.6, 9.4],
      slots: side === "far"
        ? { arm: "armFar", sleeve: "sleeveFar", fore: "foreFar", foreSleeve: "foreSleeveFar", hand: raised ? "accHandFore" : "accHandFar" }
        : { arm: "armNear", sleeve: "sleeveNear", fore: "foreNear", foreSleeve: "foreSleeveNear", hand: raised ? "accHandFore" : "accHand" },
    };
  };
  const leg = (side) => {
    const h = hips[side];
    const { joint, end } = ik(h, ankles[side], THIGH, SHIN, (a, b) => (a[0] > b[0] ? a : b));
    return {
      hip: h,
      knee: joint,
      ankle: end,
      foot: footGeom(end, feet[side]),
      far: side === "far",
      side,
      widths: [21, 15.6, 15, 9.8],
      slots: side === "far" ? { leg: "legFar", shoe: "shoeFar", pant: "pantFar" } : { leg: "legNear", shoe: "shoeNear", pant: "pantNear" },
    };
  };
  const t = up;
  const hY = hipDy;
  const box = boy
    ? {
        neckL: [80.4, 72 + t], neckR: [98, 72 + t], shL: [64, 79.4 + t], shR: [111.8, 79.4 + t],
        chestL: [65.4, 92 + t], chestR: [111.2, 92 + t], waistL: [69, 110 + hY], waistR: [107.6, 110 + hY],
        hipL: [69.4, 127 + hY], hipR: [107.8, 127 + hY],
      }
    : {
        neckL: [81, 72.6 + t], neckR: [97.4, 72.6 + t], shL: [66.6, 80 + t], shR: [108.8, 80 + t],
        chestL: [67.4, 92 + t], chestR: [108.6, 92 + t], waistL: [72.6, 108 + hY], waistR: [104.4, 108 + hY],
        hipL: [68.4, 127 + hY], hipR: [108.6, 127 + hY],
      };
  const b = box;
  const torso = [
    b.neckL, [(b.neckL[0] + b.neckR[0]) / 2, b.neckL[1] - 0.6], b.neckR, [b.shR[0], b.shR[1], 1], b.chestR, b.waistR,
    [b.hipR[0], b.hipR[1] + 6, 1], [b.hipL[0], b.hipL[1] + 6, 1], b.waistL, b.chestL, [b.shL[0], b.shL[1], 1],
  ];
  return {
    style: "big",
    view: "side",
    k: K,
    box,
    anim,
    action,
    f,
    gender,
    up,
    hipDy,
    sway,
    face,
    mouth,
    footPivot: FOOT_PIVOT,
    head: { cx, cy },
    neck: { x0: cx - 2.4, x1: cx + 9.6, top: cy + 14, base: 74 + up },
    frontX: 94,
    shoulderY: 78 + up,
    chestY: 92 + up,
    waistY: 110 + hipDy,
    hipY: 125 + hipDy,
    crotchY: 136 + hipDy,
    torso,
    shoulders,
    hips,
    arms: { far: arm("far"), near: arm("near") },
    legs: { far: leg("far"), near: leg("near") },
  };
}

// ---------------------------------------------------------------- body ----
export function armPath(a) {
  return [a.shoulder, a.elbow, a.wrist];
}

export function armMask(S, a, grow = 0) {
  const [w0, w1, w2] = a.widths;
  return S.limb(armPath(a), [w0 + grow, w1 + grow, w2 + grow]);
}

/** Hand in local arm space: u along the forearm, v across (+v = toward the front). */
export function handLocal(a, pts) {
  const c = Math.cos(a.dir);
  const s = Math.sin(a.dir);
  const [wx, wy] = a.wrist;
  return pts.map(([u, v]) => [wx + u * c + v * s, wy + u * s - v * c]);
}

export function handMask(S, a) {
  const palm = S.blob(handLocal(a, [[-1.3, -4], [3.2, -4.8], [7.7, -4.2], [10.9, -2.4], [11.7, 0.3], [10.7, 3], [7.2, 4.5], [2.7, 4.3], [-1.1, 3.7]]));
  const thumb = S.blob(handLocal(a, [[1.6, 3.6], [4.8, 6.2], [8, 6.5], [9.3, 5.1], [6.9, 3.5]]));
  let fingers = S.empty();
  if (a.shape === "open")
    for (const [v, length] of [[-3.5, 16], [-1.2, 18], [1.2, 17], [3.4, 14.5]])
      fingers = fingers.or(S.limb(handLocal(a, [[7, v], [length, v * 1.2]]), [2.8, 2.3]));
  const fullPalm = palm.or(fingers);
  return { palm: fullPalm, thumb, all: fullPalm.or(thumb) };
}

/** Raised forearms must sit above face/hair, independently of upper sleeves. */
export function splitFore(sp, fore, a) {
  const distance = (x, y, p, q) => {
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy || 1)));
    return (x - p[0] - t * dx) ** 2 + (y - p[1] - t * dy) ** 2;
  };
  for (let y = 0; y < sp.h; y++)
    for (let x = 0; x < sp.w; x++) {
      const color = sp.get(x, y);
      if (color !== null && distance(x + 0.5, y + 0.5, a.elbow, a.wrist) <= distance(x + 0.5, y + 0.5, a.shoulder, a.elbow)) {
        fore.set(x, y, color);
        sp.set(x, y, null);
      }
    }
}

export function legPath(l) {
  const { hip, knee, ankle } = l;
  const calf = [knee[0] + (ankle[0] - knee[0]) * 0.3 - 1.2, knee[1] + (ankle[1] - knee[1]) * 0.3];
  return [hip, knee, calf, ankle];
}

export function legMask(S, l, grow = 0) {
  const [a, b, c, d] = l.widths;
  return S.limb(legPath(l), [a + grow, b + grow, c + grow, d + grow]);
}

export function footMask(S, l, grow = 0) {
  const { heel, toe, top, ankle } = l.foot;
  return S.limb([heel, toe], [9 + grow, 7 + grow]).or(S.limb([ankle, top], [10 + grow, 9 + grow]));
}

export const HEAD_OUTLINE = [
  [0, -18.6], [6, -18], [11.4, -15.2], [15.4, -10], [17.2, -3.6], [17, 2.4], [16.4, 7.4], [15, 12],
  [12.2, 16], [8.4, 19], [5.2, 20.4], [2, 20], [-2.4, 18.2], [-7, 14.4], [-11, 9.6], [-14.8, 4.2],
  [-17, -2.4], [-17, -8.4], [-14.6, -13.6], [-9.4, -17.4], [-4, -18.8],
];

export function headMask(S, P) {
  const { cx, cy } = P.head;
  return S.blob(HEAD_OUTLINE.map(([x, y]) => [cx + x, cy + y]));
}

const far2 = (m) => ({
  base: 3,
  regions: [
    { mask: m.minus(m.shift(-5, -2)), tone: 2 },
    { mask: m.minus(m.shift(-2, 0)), tone: 1 },
  ],
});

function drawArm(S, L, a) {
  const sp = L(a.slots.arm);
  const m = armMask(S, a);
  cel(sp, m, R.skin, a.far ? far2(m) : { shadow: 3.6, rim: 1.6 });
  const h = handMask(S, a);
  cel(sp, h.palm, R.skin, a.far ? far2(h.palm) : { shadow: 2.6, rim: 1.2 });
  cel(sp, h.thumb, R.skin, a.far ? far2(h.thumb) : { shadow: 1.6 });
  for (const [p, q] of [handLocal(a, [[6.4, -1.2], [10.6, -0.8]]), handLocal(a, [[6.4, 1.4], [10, 2]])])
    for (let i = 0; i <= 6; i++) {
      const x = Math.floor(p[0] + ((q[0] - p[0]) * i) / 6);
      const y = Math.floor(p[1] + ((q[1] - p[1]) * i) / 6);
      if (h.palm.shrink(1).has(x, y)) sp.set(x, y, R.skin[a.far ? 1 : 2]);
    }
  if (a.raised) splitFore(sp, L(a.slots.fore), a);
}

function drawLeg(S, L, l) {
  const m = legMask(S, l).or(footMask(S, l));
  cel(L(l.slots.leg), m, R.skin, l.far ? far2(m) : { shadow: 4, rim: 2 });
}

export function drawBody(ctx) {
  const { S, L, P } = ctx;
  drawArm(S, L, P.arms.far);
  drawLeg(S, L, P.legs.far);
  drawLeg(S, L, P.legs.near);
  const torso = L("torso");
  const tm = S.blob(P.torso);
  const { cx, cy } = P.head;
  const n = P.neck;
  const neck = S.blob([[n.x0, n.top], [n.x1, n.top], [n.x1 + 0.6, n.base + 2], [n.x0 - 0.6, n.base + 2]]);
  cel(torso, tm, R.skin, { shadow: 5, rim: 2, join: neck });
  cel(torso, neck, R.skin, {
    join: tm,
    regions: [{ mask: S.blob([[n.x0, n.top], [n.x1 + 1, n.top], [n.x1, n.top + 9], [n.x0 + 4, n.top + 6]]), tone: 2 }],
    shadow: 3,
  });
  drawArm(S, L, P.arms.near);
  const head = L("head");
  const hm = headMask(S, P);
  const jawShade = S.blob([[16.2, 8], [14, 13.6], [9.4, 18.6], [4, 21.4], [12, 21.6], [19, 12]].map(([x, y]) => [cx + x, cy + y]));
  cel(head, hm, R.skin, { regions: [{ mask: jawShade, tone: 2 }] });
  const ear = S.oval(cx - 14, cy + 3.6, 3.2, 4.8, -12);
  cel(head, ear, R.skin, { join: hm, regions: [{ mask: S.oval(cx - 13.6, cy + 4.2, 1.2, 2.6, -12), tone: 2 }] });
  drawFace(L("face"), S, P);
}

// ---------------------------------------------------------------- face ----
const EYE = { L: "eye.0", P: "eye.1", D: "eye.2", I: "eye.3", J: "eye.4", S: WHITE, s: "#fff3e6", l: "skin.0" };
// Simple tall oval eyes like the mock (near eye 6 wide, far eye 5 wide).
export const EYES = {
  open: {
    near: [".LLLL.", "LLPPPL", ".PSSPP", ".PSSPD", ".PPPPD", ".DPPDI", ".DIsJI", "..IJI.", "......"],
    far: ["LLLL.", "PPPLL", "SSPP.", "SSPD.", "PPPD.", "DPDI.", "IsJI.", ".JI..", "....."],
  },
  blink: {
    near: ["......", "......", "......", "......", "L....L", ".LLLL.", "......", "......", "......"],
    far: [".....", ".....", ".....", ".....", "L...L", ".LLL.", ".....", ".....", "....."],
  },
  happy: {
    near: ["......", "......", "......", "..LL..", ".L..L.", "L....L", "......", "......", "......"],
    far: [".....", ".....", ".....", "..L..", ".L.L.", "L...L", ".....", ".....", "....."],
  },
};

export const FACE = { near: [-8, -1], far: [6, -1], mouth: [4, 14] };

export function drawFace(sprite, S, P, expression = P.face) {
  const { cx, cy } = P.head;
  const eyes = EYES[expression] ?? EYES.open;
  sprite.stamp(cx + FACE.near[0], cy + FACE.near[1], eyes.near, EYE);
  sprite.stamp(cx + FACE.far[0], cy + FACE.far[1], eyes.far, EYE);
  if (P.gender === "girl" && expression === "open") {
    sprite.set(cx + FACE.near[0] - 1, cy + FACE.near[1], "eye.0");
    sprite.set(cx + FACE.far[0] + 5, cy + FACE.far[1] + 1, "eye.0");
  }
  sprite.fill(S.ellipse(cx - 4.4, cy + 10.6, 3.4, 1.4), "skin.6");
  sprite.fill(S.ellipse(cx + 13.6, cy + 10.4, 1.9, 1.3), "skin.6");
  for (const [x, y] of [[11, 7], [11, 8], [12, 9]]) sprite.set(cx + x, cy + y, "skin.2");
  sprite.set(cx + 11, cy + 10, "skin.1");
  const [mx, my] = FACE.mouth;
  if (P.mouth === "open" || P.mouth === "o") {
    const mask = S.ellipse(cx + mx + 1.5, cy + my + 1.2, P.mouth === "o" ? 1.8 : 3.2, P.mouth === "o" ? 2.4 : 2.8);
    sprite.fill(mask, "#6e2a2c").fill(mask.edge(), MOUTH);
    if (P.mouth === "open") sprite.fill(S.rect(cx + mx, cy + my, 3, 1).and(mask), WHITE);
  } else {
    const dots = P.mouth === "chew" ? [[0, 1], [1, 0], [2, 1], [3, 0], [4, 1]] : [[0, 0], [1, 1], [2, 1], [3, 0]];
    for (const [x, y] of dots) sprite.set(cx + mx + x, cy + my + y, MOUTH);
  }
}

/** Props are separate layers, never baked into body or wardrobe items. */
export function drawProps(ctx) {
  const { S, L, P } = ctx;
  if (P.action === "eat") {
    const x = 108, y = 111 + P.up;
    const bowl = L("propMid");
    const mask = S.blob([[x - 18, y], [x + 18, y], [x + 15, y + 10], [x + 7, y + 17], [x - 7, y + 17], [x - 15, y + 10]]);
    cel(bowl, mask, ["#574c40", "#987e65", "#c2a78b", "#dfceb4", "#f0e2cb", "#fff2dc"], { shadow: 3, rim: 1 });
    bowl.fill(S.ellipse(x, y, 18, 4.4), "#665140");
    bowl.fill(S.ellipse(x, y, 15.5, 2.7), "#e2bd74");
    bowl.fill(S.limb([[x - 8, y - 1], [x - 3, y + 1], [x + 1, y - 1], [x + 7, y + 1]], [1.3, 1.3, 1.3, 1.3]), "#f7df9c");
    bowl.fill(S.ellipse(x + 7, y - 1, 3.6, 1.8), "#739060");
    const hand = P.arms.near.hand;
    const feeding = P.f === 2 || P.f === 3;
    const tip = feeding ? [P.head.cx + 7, P.head.cy + 17] : P.f === 1 || P.f === 4 ? [102, 84 + P.up] : [112, y - 2];
    const spoon = L("propFront");
    spoon.fill(S.limb([hand, tip], [2.4, 2]), "#79614a");
    spoon.fill(S.ellipse(tip[0], tip[1], 3, 1.8), "#bea27c");
    spoon.fill(S.ellipse(tip[0], tip[1] - 0.5, 1.8, 0.9), "#ead294");
  }
  if (P.action === "celebrate") {
    const fx = L("fx");
    for (const [i, x, y] of [[0, 39, 51], [1, 140, 66], [2, 122, 23]]) {
      const radius = [2, 3, 4, 3, 2, 1, 2, 3][(P.f + i * 2) % 8];
      fx.fill(S.limb([[x - radius, y], [x + radius, y]], [1.5, 1.5]).or(S.limb([[x, y - radius], [x, y + radius]], [1.5, 1.5])), "#d8b668");
    }
  }
}

export function makeContext(anim, f, gender) {
  const P = pose(anim, f, gender);
  const S = new Shapes(W, H);
  const layers = {};
  const L = (slot) => {
    if (!SLOTS.includes(slot)) throw new Error(`Unknown big slot ${slot}`);
    return (layers[slot] ??= new Sprite(W, H));
  };
  return { S, L, P, layers, style: "big", W, H, SLOTS, HEAD, body: { armPath, legPath, armMask, legMask, handMask, headMask, splitFore } };
}
