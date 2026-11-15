import type { ThoughtMap } from "../src/types";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function layoutThoughtMap(
  map: ThoughtMap,
  availableWidth?: number,
): {
  centre: Box;
  positions: (Box & { id: string; parent: string | null })[];
  width: number;
  height: number;
} | null;
