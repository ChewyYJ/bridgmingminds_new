// Chibi style: big-head, front-view HD character for emotes (idle, cheer, eat,
// victory). Same pixel density as the big style.
import { Shapes, Sprite, cel } from "../lib/canvas.mjs";
import { R, WHITE, MOUTH } from "../lib/palettes.mjs";
import { ik } from "../lib/rig.mjs";

export const W = 192;
export const H = 216;
export const K = 2;
export const FOOT_PIVOT = [96, 202];

export const SLOTS = [
  "fxBack", "hairBack", "accBack", "propBack", "legL", "legR", "shoeL", "shoeR", "pantL", "pantR",
  "torso", "bottom", "top", "outer", "accMid", "armL", "sleeveL", "armR", "sleeveR", "accHand", "propMid",
  "head", "face", "hairShade", "accFace", "hairFront", "hat", "accHead",
  "foreL", "foreSleeveL", "foreR", "foreSleeveR", "accHandFore", "propFront", "fx",
];

export const ANIMATIONS = {
  idle: { frames: 8, fps: 4, loopFrom: 0 },
  walk: { frames: 8, fps: 9, loopFrom: 0 },
  greet: { frames: 8, fps: 8, loopFrom: 0 },
  speak: { frames: 8, fps: 8, loopFrom: 0 },
  celebrate: { frames: 8, fps: 9, loopFrom: 0 },
  cheer: { frames: 8, fps: 10, loopFrom: 0 },
  eat: { frames: 8, fps: 6, loopFrom: 0 },
  victory: { frames: 8, fps: 8, loopFrom: 0 },
};

/** Head landmarks relative to the skull centre (front view). */
export const HEAD = {
  view: "front",
  top: -35,
  chin: 37.6,
  left: -38.4,
  right: 38.4,
  faceX: 0,
  hairline: -16,
  brow: -4.6,
  ear: [37.4, 12],
  eyes: { L: [-16, 12], R: [16, 12] },
  mouth: [0, 26.4],
  vol: 7,
  levels: { ear: 16, chin: 37, shoulder: 46, chest: 58, waist: 72 },
  hatLine: -18,
};

const CX = 96;
const CY = 94;
const UPPER = 17;
const FORE = 15;
const THIGH = 12;
const SHIN = 12;
const ANKLE_Y = 191.6;

export const POSES = {
  idle: [...Array(8)].map((_, f) => ({
    up: [0, 0, 1, 1, 2, 2, 1, 1][f],
    hands: [[73, 168], [119, 168]],
    shape: ["mitt", "mitt"],
    eyes: f === 5 ? "blink" : "open",
    mouth: "smile",
  })),
  walk: [...Array(8)].map((_, f) => ({
    up: [0, 1, 0, -1, 0, 1, 0, -1][f],
    hands: [
      [[72, 166], [69, 163], [67, 160], [70, 163], [74, 168], [76, 170], [77, 172], [75, 169]][f],
      [[118, 168], [116, 170], [115, 172], [117, 169], [120, 166], [123, 163], [125, 160], [122, 163]][f],
    ],
    steps: [[0, 0, -2, -4, -3, -1, 0, 0][f], [-3, -1, 0, 0, 0, 0, -2, -4][f]],
    shape: ["mitt", "mitt"],
    eyes: f === 6 ? "blink" : "open",
    mouth: "smile",
  })),
  greet: [...Array(8)].map((_, f) => ({
    up: [0, 0, 1, 1, 0, 0, 1, 0][f],
    hands: [[[57, 115], [52, 113], [57, 110], [63, 112], [57, 110], [52, 113], [57, 116], [61, 118]][f], [119, 168]],
    shape: ["open", "mitt"],
    eyes: f === 6 ? "happy" : "open",
    mouth: "smile",
  })),
  speak: [...Array(8)].map((_, f) => ({
    up: [0, 1, 1, 0, -1, 0, 1, 0][f],
    hands: [[[67, 158], [61, 151], [59, 146], [62, 148], [66, 154], [69, 158], [67, 156], [65, 153]][f], [119, 168]],
    shape: ["open", "mitt"],
    eyes: f === 5 ? "blink" : "open",
    mouth: ["smile", "open", "o", "open", "smile", "o", "open", "smile"][f],
  })),
  cheer: [...Array(8)].map((_, f) => {
    const dy = [0, -4, -8, -4, 0, -4, -8, -4][f];
    return {
      dy,
      squash: dy === 0 ? 2 : 0,
      air: dy < -2,
      hands: [
        [[60, 104], [56, 96], [58, 92], [62, 100], [60, 104], [56, 96], [58, 92], [62, 100]][f],
        [[132, 100], [136, 92], [134, 96], [130, 104], [132, 100], [136, 92], [134, 96], [130, 104]][f],
      ],
      shape: ["open", "open"],
      eyes: "happy",
      mouth: "open",
    };
  }),
  eat: [...Array(8)].map((_, f) => ({
    up: [0, 0, -1, 0, 1, 0, 1, 0][f],
    hands: [[[100, 156], [94, 146], [91, 133], [91, 131], [96, 146], [100, 154], [100, 156], [98, 152]][f], [113, 166]],
    shape: ["chop", "hold"],
    eyes: f < 2 ? "down" : "happy",
    mouth: ["smile", "smile", "o", "slurp", "chew", "chew2", "chew", "smile"][f],
  })),
  victory: [...Array(8)].map((_, f) => {
    const dy = [4, -10, -18, -10, 3, 0, -3, 0][f];
    return {
      dy,
      squash: dy > 0 ? dy : 0,
      air: dy < -2,
      hands: [
        [[70, 168], [66, 120], [63, 98], [66, 106], [70, 128], [67, 122], [65, 116], [67, 122]][f],
        [[122, 168], [126, 120], [129, 98], [126, 106], [122, 128], [125, 122], [127, 116], [125, 122]][f],
      ],
      shape: f === 0 ? ["mitt", "mitt"] : ["fist", "fist"],
      eyes: "happy",
      mouth: f === 0 ? "grin" : "open",
    };
  }),
};
// Keep the source-era emotes available while the runtime uses celebrate.
POSES.celebrate = POSES.cheer;

export function pose(anim, f, gender) {
  if (!POSES[anim] || !Number.isInteger(f) || f < 0 || f >= 8)
    throw new RangeError(`Unknown chibi animation frame ${anim}:${f}`);
  const boy = gender === "boy";
  const K0 = POSES[anim][f];
  const dy = K0.dy ?? 0;
  const up = K0.up ?? 0;
  const squash = K0.squash ?? 0;
  const cx = CX;
  const cy = CY + Math.round(dy + up + squash * 0.5);
  const t = Math.round(dy + up * 0.5 + squash);
  const hY = Math.round(dy + squash);
  const shoulders = { L: [boy ? 79 : 80, 139 + t], R: [boy ? 113 : 112, 139 + t] };
  const hips = { L: [87.5, 168 + hY], R: [104.5, 168 + hY] };
  const arm = (side, i) => {
    const s = shoulders[side];
    const target = [K0.hands[i][0], K0.hands[i][1] + t];
    const outward = side === "L" ? -1 : 1;
    const { joint, end } = ik(s, target, UPPER, FORE, (a, b) =>
      side === "L" && (anim === "eat" || anim === "speak")
        ? (a[1] > b[1] ? a : b)
        : ((a[0] - cx) * outward > (b[0] - cx) * outward ? a : b));
    const dir = Math.atan2(end[1] - joint[1], end[0] - joint[0]);
    const raised = target[1] < s[1] - 6 || (K0.shape[i] === "chop" && target[1] < 140 + t);
    return {
      shoulder: s,
      elbow: joint,
      wrist: end,
      dir,
      hand: [end[0] + Math.cos(dir) * 5.6, end[1] + Math.sin(dir) * 5.6],
      shape: K0.shape[i],
      side,
      far: false,
      raised,
      widths: [15, 13.4, 12.2],
      slots: {
        arm: side === "L" ? "armL" : "armR",
        sleeve: side === "L" ? "sleeveL" : "sleeveR",
        fore: side === "L" ? "foreL" : "foreR",
        foreSleeve: side === "L" ? "foreSleeveL" : "foreSleeveR",
        hand: raised ? "accHandFore" : "accHand",
      },
    };
  };
  const leg = (side) => {
    const h = hips[side];
    const outward = side === "L" ? -1 : 1;
    const lift = K0.steps?.[side === "L" ? 0 : 1] ?? 0;
    const ankle = K0.air
      ? [h[0] + outward * 2, h[1] + THIGH + SHIN - 1]
      : [h[0] + outward * (2 + squash * 0.2), ANKLE_Y + lift];
    // Nearly straight, separated knees avoid the old deep bow-legged pose.
    // A short stylised bend follows each lifted foot; both feet retain the
    // common ground baseline in neutral frames instead of crossing at centre.
    const bend = Math.min(3, 0.6 + Math.max(0, -lift) * 0.35 + squash * 0.25);
    const joint = [(h[0] + ankle[0]) / 2 + outward * bend, (h[1] + ankle[1]) / 2];
    const end = ankle;
    return {
      hip: h,
      knee: joint,
      ankle: end,
      foot: { ankle: end, front: true, out: outward, angle: 0 },
      side,
      far: false,
      widths: [20.6, 16.4, 15.4, 12.6],
      slots: side === "L" ? { leg: "legL", shoe: "shoeL", pant: "pantL" } : { leg: "legR", shoe: "shoeR", pant: "pantR" },
    };
  };
  const box = boy
    ? {
        neckL: [87.4, 129 + t], neckR: [104.6, 129 + t], shL: [73.6, 134.6 + t], shR: [118.4, 134.6 + t],
        chestL: [74.4, 143 + t], chestR: [117.6, 143 + t], waistL: [75.6, 156 + hY], waistR: [116.4, 156 + hY],
        hipL: [74.6, 167 + hY], hipR: [117.4, 167 + hY],
      }
    : {
        neckL: [88, 129 + t], neckR: [104, 129 + t], shL: [75, 135 + t], shR: [117, 135 + t],
        chestL: [75.4, 143 + t], chestR: [116.6, 143 + t], waistL: [77, 155 + hY], waistR: [115, 155 + hY],
        hipL: [74.6, 167 + hY], hipR: [117.4, 167 + hY],
      };
  const b = box;
  const torso = [
    b.neckL, [cx, b.neckL[1] - 1], b.neckR, [b.shR[0], b.shR[1], 1], b.chestR, b.waistR,
    [b.hipR[0], b.hipR[1] + 5, 1], [b.hipL[0], b.hipL[1] + 5, 1], b.waistL, b.chestL, [b.shL[0], b.shL[1], 1],
  ];
  return {
    style: "chibi",
    view: "front",
    k: K,
    box,
    anim,
    action: anim === "cheer" || anim === "victory" ? "celebrate" : anim,
    f,
    gender,
    key: K0,
    up,
    sway: 0,
    face: K0.eyes,
    mouth: K0.mouth,
    footPivot: FOOT_PIVOT,
    head: { cx, cy },
    neck: { x0: cx - 7, x1: cx + 7, top: cy + 28, base: 130 + t },
    frontX: cx,
    shoulderY: 133 + t,
    chestY: 143 + t,
    waistY: 156 + hY,
    hipY: 165 + hY,
    crotchY: 174 + hY,
    torso,
    shoulders,
    hips,
    arms: { L: arm("L", 0), R: arm("R", 1) },
    legs: { L: leg("L"), R: leg("R") },
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

export function legPath(l) {
  return [l.hip, l.knee, [(l.knee[0] + l.ankle[0]) / 2, (l.knee[1] + l.ankle[1]) / 2], l.ankle];
}

export function legMask(S, l, grow = 0) {
  const [a, b, c, d] = l.widths;
  return S.limb(legPath(l), [a + grow, b + grow, c + grow, d + grow]);
}

/** Local hand frame: u along the forearm, v across (positive toward the thumb side). */
export function handLocal(a, u, v) {
  const c = Math.cos(a.dir);
  const s = Math.sin(a.dir);
  const side = a.side === "L" ? 1 : -1;
  return [a.wrist[0] + u * c - v * s * side, a.wrist[1] + u * s + v * c * side];
}

export function handShapes(S, a) {
  const L = (pts) => pts.map(([u, v]) => handLocal(a, u, v));
  const shape = a.shape ?? "mitt";
  if (shape === "fist") {
    const fist = S.blob(L([[-1, -6], [5, -7.6], [10.6, -6], [12.4, -1], [11.4, 5], [6, 7.6], [0, 6.4], [-1.6, 0]]));
    const thumb = S.blob(L([[3, 4.4], [7.6, 5.2], [10.4, 3.4], [8, 1.8], [4, 2]]));
    return { main: fist, extra: thumb, lines: [L([[8.6, -4.6], [11.2, -2.4]]), L([[9.6, -1.4], [11.8, 0.6]])] };
  }
  if (shape === "open") {
    const palm = S.blob(L([[-1, -5.6], [5.6, -6.6], [9, -5.4], [9.6, 5], [5, 6.6], [-1, 5.4]]));
    let fingers = S.empty();
    for (const [v, len] of [[-4.6, 15], [-1.4, 16.6], [1.8, 16], [4.8, 14]]) fingers = fingers.or(S.limb(L([[8, v], [len, v * 1.25]]), [3.4, 3]));
    return { main: palm.or(fingers), extra: S.limb(L([[3, 5.4], [8.4, 10.4]]), [3.6, 3]), lines: [] };
  }
  const mitt = S.blob(L([[-1, -6], [5, -7.2], [10.4, -5.6], [13, -1.4], [12.4, 4], [8, 6.8], [2, 6.4], [-1.4, 3]]));
  const thumb = S.blob(L([[3, 4.6], [7, 8.6], [10.6, 8.4], [10.4, 5.6], [6, 4]]));
  return { main: mitt, extra: thumb, lines: [L([[9.6, -2.6], [12.4, -1.6]]), L([[9.4, 1], [12, 2.2]])] };
}

/** Separate bent forearms by their actual segment, including eating gestures. */
export function splitFore(sp, fore, a) {
  const distance = (x, y, p, q) => {
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy || 1)));
    return (x - p[0] - t * dx) ** 2 + (y - p[1] - t * dy) ** 2;
  };
  for (let y = 0; y < sp.h; y++)
    for (let x = 0; x < sp.w; x++) {
      const c = sp.get(x, y);
      if (c !== null && distance(x + 0.5, y + 0.5, a.elbow, a.wrist) <= distance(x + 0.5, y + 0.5, a.shoulder, a.elbow)) {
        fore.set(x, y, c);
        sp.set(x, y, null);
      }
    }
}

function drawArm(ctx, a) {
  const { S, L } = ctx;
  const sp = L(a.slots.arm);
  const m = armMask(S, a);
  cel(sp, m, R.skin, { shadow: 4, rim: 2 });
  const h = handShapes(S, a);
  cel(sp, h.main, R.skin, { shadow: 3, rim: 1.4 });
  cel(sp, h.extra, R.skin, { shadow: 1.6 });
  for (const [p, q] of h.lines)
    for (let i = 0; i <= 6; i++) {
      const x = Math.floor(p[0] + ((q[0] - p[0]) * i) / 6);
      const y = Math.floor(p[1] + ((q[1] - p[1]) * i) / 6);
      if (h.main.shrink(1).has(x, y)) sp.set(x, y, R.skin[2]);
    }
  if (a.raised) splitFore(sp, L(a.slots.fore), a);
}

export const HEAD_OUTLINE = [
  [0, -35], [17, -32], [30, -23], [37, -10], [38.4, 3], [36.6, 15], [31.4, 25], [22.6, 32.4], [11.6, 36.4],
  [0, 37.6], [-11.6, 36.4], [-22.6, 32.4], [-31.4, 25], [-36.6, 15], [-38.4, 3], [-37, -10], [-30, -23], [-17, -32],
];

export function headMask(S, P) {
  const { cx, cy } = P.head;
  return S.blob(HEAD_OUTLINE.map(([x, y]) => [cx + x, cy + y]));
}

export function drawBody(ctx) {
  const { S, L, P } = ctx;
  for (const key of ["L", "R"]) {
    const l = P.legs[key];
    const m = legMask(S, l).or(S.ellipse(l.ankle[0] + l.foot.out * 1.2, l.ankle[1] + 5, 8, 5.4));
    cel(L(l.slots.leg), m, R.skin, { shadow: 4, rim: 2 });
  }
  const torso = L("torso");
  const n = P.neck;
  const neck = S.rect(n.x0, n.top, n.x1 - n.x0, n.base - n.top + 4);
  const tm = S.blob(P.torso);
  cel(torso, tm, R.skin, { shadow: 5, rim: 2, join: neck });
  cel(torso, neck, R.skin, { join: tm, regions: [{ mask: S.rect(n.x0, n.top, 20, 8), tone: 2 }] });
  for (const key of ["L", "R"]) drawArm(ctx, P.arms[key]);
  const { cx, cy } = P.head;
  const head = L("head");
  const hm = headMask(S, P);
  cel(head, hm, R.skin, { regions: [{ mask: hm.minus(hm.shift(-3, -3)).and(S.rect(cx, cy, 60, 60)), tone: 2 }] });
  for (const side of [-1, 1]) {
    const ear = S.oval(cx + side * 37.4, cy + 12, 4.2, 6.6, side * 8);
    cel(head, ear, R.skin, { join: hm, regions: [{ mask: S.oval(cx + side * 37, cy + 13, 1.6, 3.4, side * 8), tone: 2 }] });
  }
  drawFace(ctx, L("face"), P);
}

// ---------------------------------------------------------------- face ----
export const FACE = { eyeX: 16, eyeY: 12, mouthY: 26.4 };

function eye(ctx, sp, ex, ey, side, kind) {
  const { S } = ctx;
  const boy = ctx.P.gender === "boy";
  const m = (pts) => pts.map(([x, y]) => [ex + x * side, ey + y]);
  if (kind === "happy") {
    sp.fill(S.taper(m([[-7.6, 3.4], [-4.4, -3.4], [0, -5.4], [4.4, -3.4], [7.6, 3.4]]), [2.4, 3.4, 3.6, 3.4, 2.4]), "eye.0");
    return;
  }
  if (kind === "blink") {
    sp.fill(S.taper(m([[-8, 0.6], [-4, 3.8], [0, 4.8], [4, 3.8], [8, 0.6]]), [2, 3, 3.2, 3, 2]), "eye.0");
    sp.fill(S.taper(m([[-7, 2.4], [-10, 1.4]]), [2, 0]), "eye.0");
    return;
  }
  const down = kind === "down";
  const top = down ? -5.6 : -9;
  const white = S.blob(m([[-7.4, top + 4], [-3.4, top + 0.6], [3.4, top + 0.4], [7.2, top + 3.6], [7.6, 3], [4.8, 8.8], [0, 10], [-4.8, 8.8], [-7.6, 3]]));
  sp.fill(white, "#fbf6f1");
  const iris = S.ellipse(ex + 0.4 * side, ey + 1.4 + (down ? 2 : 0), 5.8, down ? 6.4 : 8.2).and(white.grow(1));
  iris.forEach((x, y) => {
    const v = (y + 0.5 - (ey + 1.4)) / 8.2;
    sp.set(x, y, v < -0.45 ? "eye.1" : v < -0.05 ? "eye.2" : v < 0.5 ? "eye.3" : "eye.4");
  });
  sp.fill(S.ellipse(ex + 0.4 * side, ey + 0.4 + (down ? 2 : 0), 2.6, down ? 3 : 4), "eye.1");
  iris.edge().forEach((x, y) => {
    if (y > ey - 2) sp.set(x, y, "eye.2");
  });
  sp.fill(S.taper(m([[-8.6, top + 6.4], [-6, top + 1.6], [0, top - 0.6], [6, top + 0.6], [8.4, top + 4.4]]), boy ? [1.6, 2.6, 2.8, 2.4, 1.4] : [2.2, 3.8, 4, 3.2, 1.8]), "eye.0");
  if (!boy) sp.fill(S.taper(m([[-7.4, top + 3.2], [-11, top + 1.6]]), [2.6, 0]), "eye.0");
  sp.fill(S.taper(m([[-4.6, 9.4], [0, 10.6], [4.4, 9.6]]), [1, 1.4, 1]), "skin.0");
  if (!down) {
    sp.fill(S.ellipse(ex - 2 + (side < 0 ? 0.6 : 0), ey - 2.8, 2.2, 2.6), WHITE);
    sp.fill(S.ellipse(ex + 2.6, ey + 4.6, 1, 1.1), WHITE);
  } else sp.fill(S.ellipse(ex - 1.6, ey + 0.4, 1.6, 1.6), WHITE);
}

function mouth(ctx, sp, mx, my, kind) {
  const { S } = ctx;
  const T = (pts, w) => S.taper(pts.map(([x, y]) => [mx + x, my + y]), w);
  if (kind === "smile") {
    sp.fill(T([[-4, -0.8], [-1.6, 1.4], [0, 1.8], [1.6, 1.4], [4, -0.8]], [1.4, 1.8, 2, 1.8, 1.4]), MOUTH);
    return;
  }
  if (kind === "chew" || kind === "chew2") {
    const d = kind === "chew" ? 0 : 0.8;
    sp.fill(T([[-4.4, d], [-2.2, 1.8], [0, 0.4 - d], [2.2, 1.8], [4.4, d]], [1.4, 1.8, 1.6, 1.8, 1.4]), MOUTH);
    return;
  }
  if (kind === "o" || kind === "slurp") {
    const r = kind === "o" ? [3.2, 3.6] : [2.2, 2.4];
    const o = S.ellipse(mx, my + 1.4, r[0], r[1]);
    sp.fill(o, "#6e2a2c").fill(o.edge(), MOUTH);
    if (kind === "o") sp.fill(S.ellipse(mx, my + 3.2, 1.8, 1).and(o.shrink(1)), "#e07a7c");
    return;
  }
  const big = kind === "grin" ? 1.15 : 1;
  const shape = S.blob([[-6.4, -1.6], [6.4, -1.6], [5.4, 2.6], [2.8, 6], [0, 6.8], [-2.8, 6], [-5.4, 2.6]].map(([x, y]) => [mx + x * big, my + y * big]));
  sp.fill(shape, "#6e2a2c");
  sp.fill(S.ellipse(mx, my + 4.6 * big, 3.8 * big, 2.4).and(shape), "#e07a7c");
  sp.fill(S.rect(mx - 4.6 * big, my - 1.2, 9.2 * big, 1.4).and(shape), "#fbf3ee");
  sp.fill(shape.edge(), MOUTH);
}

export function drawFace(ctx, sp, P, eyes = P.face, mouthKind = P.mouth) {
  const { S } = ctx;
  const { cx, cy } = P.head;
  const ey = cy + FACE.eyeY;
  eye(ctx, sp, cx - FACE.eyeX, ey, 1, eyes);
  eye(ctx, sp, cx + FACE.eyeX, ey, -1, eyes);
  for (const side of [-1, 1]) {
    sp.fill(S.ellipse(cx + side * 25.6, cy + 22, 6.6, 2.8), "skin.6");
    sp.set(Math.floor(cx + side * 25.6 - 3), Math.floor(cy + 21), "#ffffff55");
    sp.set(Math.floor(cx + side * 25.6 - 2), Math.floor(cy + 21), "#ffffff55");
  }
  sp.set(cx, cy + 20, "skin.2");
  sp.set(cx + 1, cy + 21, "skin.2");
  mouth(ctx, sp, cx, cy + FACE.mouthY, mouthKind);
}

/** Food and celebratory accents remain independent from skin and clothes. */
export function drawProps(ctx) {
  const { S, L, P } = ctx;
  if (P.action === "eat") {
    const x = 106, y = 163 + (P.key.up ?? 0) * 0.5;
    const bowl = L("propMid");
    const mask = S.blob([[x - 21, y], [x + 21, y], [x + 18, y + 12], [x + 9, y + 20], [x - 9, y + 20], [x - 18, y + 12]]);
    cel(bowl, mask, ["#574c40", "#987e65", "#c2a78b", "#dfceb4", "#f0e2cb", "#fff2dc"], { shadow: 3, rim: 2 });
    bowl.fill(S.ellipse(x, y, 21, 5), "#665140");
    bowl.fill(S.ellipse(x, y, 18, 3.2), "#dfba74");
    bowl.fill(S.limb([[x - 12, y], [x - 7, y - 2], [x - 2, y + 1], [x + 3, y - 1], [x + 9, y + 1]], [1.6, 1.6, 1.6, 1.6, 1.6]), "#f7df9c");
    bowl.fill(S.ellipse(x + 9, y - 1, 4, 2), "#739060");
    bowl.fill(S.ellipse(x - 8, y - 1, 3, 1.8), "#c87e57");
    const hand = P.arms.L.hand;
    const feeding = P.f === 2 || P.f === 3;
    const tip = feeding ? [P.head.cx, P.head.cy + FACE.mouthY + 2] : P.f === 1 || P.f === 4 ? [101, 144] : [107, y - 3];
    const sticks = L("propFront");
    for (const offset of [-1.3, 1.3])
      sticks.fill(S.limb([[hand[0] - 4, hand[1] + offset], [tip[0], tip[1] + offset]], [1.6, 1.4]), "#94714e");
    if (feeding)
      sticks.fill(S.limb([[tip[0] - 1, tip[1] + 1], [tip[0] + 1, tip[1] + 7], [tip[0] - 1, tip[1] + 11]], [1.3, 1.3, 1]), "#e4c781");
    const steam = L("fx");
    for (const dx of [-10, 10]) {
      const rise = (P.f + (dx < 0 ? 0 : 3)) % 8;
      steam.fill(S.limb([[x + dx, y - 8 - rise], [x + dx - 2, y - 11 - rise], [x + dx, y - 15 - rise]], [1.2, 1.2, 1]), "#c9c1b599");
    }
  }
  if (P.action === "celebrate") {
    const fx = L("fx");
    for (const [i, x, y] of [[0, 34, 85], [1, 158, 73], [2, 147, 45]]) {
      const radius = [2, 3, 4, 3, 2, 1, 2, 3][(P.f + i * 2) % 8];
      fx.fill(S.limb([[x - radius, y], [x + radius, y]], [1.6, 1.6]).or(S.limb([[x, y - radius], [x, y + radius]], [1.6, 1.6])), "#d8b668");
    }
  }
}

export function makeContext(anim, f, gender) {
  const P = pose(anim, f, gender);
  const S = new Shapes(W, H);
  const layers = {};
  const L = (slot) => {
    if (!SLOTS.includes(slot)) throw new Error(`Unknown chibi slot ${slot}`);
    return (layers[slot] ??= new Sprite(W, H));
  };
  return { S, L, P, layers, style: "chibi", W, H, SLOTS, HEAD, body: { armPath, legPath, armMask, legMask, headMask, splitFore } };
}
