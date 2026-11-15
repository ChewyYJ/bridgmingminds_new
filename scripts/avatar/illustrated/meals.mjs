import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { decodePng, trim, largestComponent, affine, crop } from './raster.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const foods = new Map();
export const MEAL_ACTIONS = { eat: 'ramen', eatOnigiri: 'onigiri', eatBento: 'bento' };
const LIFT = {
  ramen: [0, 0.18, 0.65, 1, 0.92, 0.5, 0.12, 0],
  onigiri: [0, 0.3, 0.78, 1, 1, 0.7, 0.25, 0],
  bento: [0, 0.05, 0.55, 1, 0.95, 0.5, 0.1, 0],
};
function foodImage(id) {
  if (!foods.has(id)) foods.set(id, trim(largestComponent(decodePng(resolve(ROOT, `assets/avatar/food-v1/${id === 'ramen' ? 'ramen-held' : id}.png`)))));
  return foods.get(id);
}
function pointOnHand(rect, angle, u, v, anchor = [0.88, 0.88]) {
  const r = angle * Math.PI / 180, dx = (u - anchor[0]) * rect[2], dy = (v - anchor[1]) * rect[3];
  return [rect[0] + rect[2] * anchor[0] + Math.cos(r) * dx - Math.sin(r) * dy,
    rect[1] + rect[3] * anchor[1] + Math.sin(r) * dx + Math.cos(r) * dy];
}

/** One shared meal layout drives the sleeves, bare arms, hands, food and bite. */
export function getMealLayout(animation = 'eat', frame = 0) {
  const food = MEAL_ACTIONS[animation];
  if (!food) return null;
  const f = ((frame % 8) + 8) % 8, lift = LIFT[food][f];
  if (food === 'onigiri') {
    const foodRect = [123 + lift * 9, 194 - lift * 44, 43, 43];
    return { food, frame: f, lift, foodRect,
      nearWrist: [foodRect[0] + 3, foodRect[1] + 42 + lift * 8],
      farWrist: [foodRect[0] + 40, foodRect[1] + 42 + lift * 14],
      feeding: f >= 2 && f <= 5 };
  }
  const nearWrist = [119, 237 - lift * 2];
  const farWrist = [178 + lift * 8, 226 - lift * 48];
  const handRect = [farWrist[0] - 43 * 0.88, farWrist[1] - 35 * 0.88, 43, 35];
  const handAngle = (food === 'bento' ? -8 : 0) + lift * (food === 'bento' ? 53 : 45);
  return { food, frame: f, lift, nearWrist, farWrist, handRect, handAngle,
    foodRect: food === 'ramen' ? [111, 192 - lift * 2, 83, 59] : [107, 202 - lift, 91, 47],
    bitePoint: pointOnHand(handRect, handAngle, 0.07, 0.88), feeding: f >= 2 && f <= 5 };
}

/** Two-bone inverse kinematics, calibrated independently to skin and garment art. */
export function solveMealArm(rect, near, layout, garment = false) {
  const root = garment ? [near ? 0.32 : 0.76, 0.18] : [near ? 0.29 : 0.74, 0.04];
  const joint = garment ? [near ? 0.2 : 0.83, 0.6] : [near ? 0.18 : 0.82, 0.55];
  const end = garment ? [near ? 0.13 : 0.9, 0.97] : [near ? 0.12 : 0.9, 0.87];
  const v1 = [(joint[0] - root[0]) * rect[2], (joint[1] - root[1]) * rect[3]];
  const v2 = [(end[0] - joint[0]) * rect[2], (end[1] - joint[1]) * rect[3]];
  const a = Math.atan2(v1[1], v1[0]), b = Math.atan2(v2[1], v2[0]);
  const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2), target = layout[near ? 'nearWrist' : 'farWrist'];
  const dx = target[0] - rect[0] - root[0] * rect[2], dy = target[1] - rect[1] - root[1] * rect[3];
  const distance = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(l1 + l2 - 0.01, Math.hypot(dx, dy)));
  const elbow = (near || layout.food === 'onigiri' ? -1 : 1) * Math.acos(Math.max(-1, Math.min(1, (distance ** 2 - l1 ** 2 - l2 ** 2) / (2 * l1 * l2))));
  const shoulder = Math.atan2(dy, dx) - Math.atan2(l2 * Math.sin(elbow), l1 + l2 * Math.cos(elbow));
  return { angle: (shoulder - a) * 180 / Math.PI, bend: (elbow - (b - a)) * 180 / Math.PI };
}

function line(image, x0, y0, x1, y1, color, width = 2) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= steps; i++) image.fillRect(Math.round(x0 + (x1 - x0) * i / steps), Math.round(y0 + (y1 - y0) * i / steps), width, width, color);
}

export function renderMealProps(target, animation, frame) {
  const meal = getMealLayout(animation, frame);
  if (!meal) return;
  const [x, y, width, height] = meal.foodRect;
  const source = foodImage(meal.food);
  affine(target, source, { x, y, width, height });
  if (meal.food === 'ramen' && meal.feeding) {
    const [tx, ty] = meal.bitePoint;
    // A lifted noodle bundle shortens as it reaches the mouth.
    const bottom = meal.frame === 4 ? ty + 13 : 215;
    for (let strand = 0; strand < 3; strand++) {
      let previous = [tx + strand * 2, ty + 2];
      for (let j = 1; j <= 9; j++) {
        const t = j / 9, next = [tx + strand * 2 + Math.sin(t * Math.PI * 2) * 2, ty + 2 + (bottom - ty - 2) * t];
        line(target, ...previous, ...next, [239, 207, 133, 255], 2); previous = next;
      }
    }
  }
  if (meal.food === 'bento' && meal.feeding) {
    const bite = crop(source, Math.round(source.w * 0.62), Math.round(source.h * 0.20), Math.round(source.w * 0.08), Math.round(source.h * 0.08));
    affine(target, bite, { x: meal.bitePoint[0] - 3, y: meal.bitePoint[1] - 4, width: 8, height: 7 });
  }
}
