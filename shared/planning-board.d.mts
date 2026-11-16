export type PlanPort =
  "top-left" | "top-right" | "bottom-right" | "bottom-left";
export interface PlanNode {
  id: string;
  text: string;
  shape: "box" | "circle";
  x: number;
  y: number;
}
export interface PlanStroke {
  id: string;
  points: { x: number; y: number }[];
}
export interface PlanningBoard {
  version: 1;
  mode: "notepad" | "mindmap" | "draw";
  notepad: string;
  nodes: PlanNode[];
  links: {
    id: string;
    from: string;
    to: string;
    fromPort?: PlanPort;
    toPort?: PlanPort;
  }[];
  strokes: PlanStroke[];
}
export const MAX_PLAN_NODES: number;
export const MAX_PLAN_POINTS: number;
export const MAX_PLAN_STROKES: number;
export function createPlanningBoard(notepad?: string): PlanningBoard;
export function planningBoardNotes(board: PlanningBoard): string;
