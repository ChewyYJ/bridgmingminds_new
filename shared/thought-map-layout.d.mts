import type { ThoughtMap } from "../src/types";
export function layoutThoughtMap(map: ThoughtMap): {
  positions: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
  width: number;
  height: number;
} | null;
