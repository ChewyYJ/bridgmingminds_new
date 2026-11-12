export interface GardenPosition {
  x: number;
  y: number;
}
export const GARDEN_VIEWBOX: { width: number; height: number };
export const GARDEN_BOUNDARY: [number, number][];
export const DEFAULT_POSITIONS: GardenPosition[];
export const PLANT_SPACING: number;
export function isPlantablePosition(position: GardenPosition): boolean;
export function hasPlantSpace(
  plots: { id: string; plantType: string | null; position?: GardenPosition }[],
  position: GardenPosition,
  excludeId?: string,
): boolean;
