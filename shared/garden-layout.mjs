// The same normalized meadow shape drives the illustration and server validation.
export const GARDEN_VIEWBOX = { width: 1000, height: 760 };
export const GARDEN_BOUNDARY = [
  [0.13, 0.29],
  [0.155, 0.235],
  [0.22, 0.19],
  [0.31, 0.17],
  [0.405, 0.17],
  [0.52, 0.19],
  [0.62, 0.22],
  [0.715, 0.27],
  [0.8, 0.345],
  [0.845, 0.425],
  [0.865, 0.515],
  [0.845, 0.61],
  [0.79, 0.7],
  [0.7, 0.77],
  [0.6, 0.81],
  [0.48, 0.82],
  [0.36, 0.8],
  [0.26, 0.765],
  [0.205, 0.72],
  [0.185, 0.67],
  [0.2, 0.62],
  [0.26, 0.58],
  [0.35, 0.535],
  [0.43, 0.49],
  [0.47, 0.455],
  [0.465, 0.415],
  [0.42, 0.39],
  [0.34, 0.39],
  [0.26, 0.405],
  [0.18, 0.39],
  [0.13, 0.365],
  [0.11, 0.33],
];
export const DEFAULT_POSITIONS = [
  { x: 0.23, y: 0.28 },
  { x: 0.38, y: 0.27 },
  { x: 0.53, y: 0.3 },
  { x: 0.675, y: 0.34 },
  { x: 0.75, y: 0.46 },
  { x: 0.61, y: 0.455 },
  { x: 0.72, y: 0.59 },
  { x: 0.53, y: 0.61 },
  { x: 0.4, y: 0.65 },
  { x: 0.29, y: 0.695 },
  { x: 0.49, y: 0.745 },
  { x: 0.65, y: 0.73 },
];
export const PLANT_SPACING = 0.075;
export function isPlantablePosition(position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y))
    return false;
  const { x, y } = position;
  let inside = false;
  for (
    let i = 0, j = GARDEN_BOUNDARY.length - 1;
    i < GARDEN_BOUNDARY.length;
    j = i++
  ) {
    const [ax, ay] = GARDEN_BOUNDARY[i],
      [bx, by] = GARDEN_BOUNDARY[j];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
      inside = !inside;
    const length = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = Math.max(
      0,
      Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / length),
    );
    if (Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) < 0.022)
      return false;
  }
  return inside;
}
export function hasPlantSpace(plots, position, excludeId) {
  return plots.every(
    (plot, index) =>
      !plot.plantType ||
      plot.id === excludeId ||
      Math.hypot(
        (plot.position || DEFAULT_POSITIONS[index % DEFAULT_POSITIONS.length])
          .x - position.x,
        (plot.position || DEFAULT_POSITIONS[index % DEFAULT_POSITIONS.length])
          .y - position.y,
      ) >= PLANT_SPACING,
  );
}
