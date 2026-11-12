export const CARE_DURATION_MS: number;
export const THIRSTY_AFTER_MS: number;
export type PlantCareStatus = "empty" | "healthy" | "thirsty" | "dead";
export interface PlantCareInput {
  carePolicy?: "non_punitive_v1";
  plantType?: string | null;
  waterDueAt?: string;
}
export function careRemainingMs(
  plot: PlantCareInput | null | undefined,
  now?: number | Date,
): number;
export function plantCareStatus(
  plot: PlantCareInput | null | undefined,
  now?: number | Date,
): PlantCareStatus;
