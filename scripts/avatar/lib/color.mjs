// Colour helpers: OKLCH ramps with gently hue-shifted shadows (cooler) and
// lights (warmer). Neutrals keep warm, low-chroma greys like the mock art.

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function rgbToHex([r, g, b]) {
  const c = (v) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

const toLinear = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToOklch(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

export function oklchToHex({ L, C, H }) {
  for (let c = C; c >= 0; c -= 0.004) {
    const a = c * Math.cos((H * Math.PI) / 180);
    const b = c * Math.sin((H * Math.PI) / 180);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    if (rgb.every((v) => v >= -0.0005 && v <= 1.0005))
      return rgbToHex(rgb.map((v) => fromLinear(Math.max(0, Math.min(1, v)))));
  }
  const g = fromLinear(Math.max(0, Math.min(1, L ** 3)));
  return rgbToHex([g, g, g]);
}

function shiftHue(h, target, amount) {
  const d = ((target - h + 540) % 360) - 180;
  const step = Math.sign(d) * Math.min(Math.abs(d), amount);
  return (h + step + 360) % 360;
}

const cache = new Map();

/** Six tones: 0 outline, 1 deep shadow, 2 shadow, 3 base, 4 light, 5 highlight. */
export function ramp(base, opts = {}) {
  const key = base + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const { L, C, H } = hexToOklch(base);
  const grey = C < 0.03;
  const depth = opts.depth ?? 1;
  const hue = grey ? 55 : H;
  const tone = (dl, dc, target, deg) =>
    oklchToHex({
      L: Math.max(0.13, Math.min(0.985, L + dl)),
      C: grey ? Math.max(0, C * 0.6 + (dl < 0 ? 0.008 : 0.004)) : Math.max(0, C * dc),
      H: grey ? hue : shiftHue(H, target, deg),
    });
  const cool = opts.cool ?? 300;
  const warm = opts.warm ?? 70;
  const outlineL = Math.max(0.2, Math.min(L - 0.42, 0.33));
  const out = [
    oklchToHex({ L: outlineL, C: grey ? 0.012 : Math.min(C * 0.7, 0.06), H: grey ? 30 : shiftHue(H, cool, 14) }),
    tone(-0.2 * depth, 1.02, cool, 10),
    tone(-0.105 * depth, 1.04, cool, 6),
    base,
    tone(0.06, 0.92, warm, 5),
    tone(0.12, 0.75, warm, 9),
  ];
  cache.set(key, out);
  return out;
}

export function mix(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca.map((v, i) => v + (cb[i] - v) * t));
}
