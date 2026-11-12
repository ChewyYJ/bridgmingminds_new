import type { ThoughtMap } from "../src/types";
export function layoutThoughtMap(map: ThoughtMap): {
  rootId: string;
  positions: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    central: boolean;
  }[];
  width: number;
  height: number;
} | null;
