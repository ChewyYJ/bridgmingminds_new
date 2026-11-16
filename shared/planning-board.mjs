export const MAX_PLAN_NODES = 12;
export const MAX_PLAN_POINTS = 1200;
export const MAX_PLAN_STROKES = 48;
export function createPlanningBoard(notepad = "") {
  return {
    version: 1,
    mode: "notepad",
    notepad,
    nodes: [],
    links: [],
    strokes: [],
  };
}
export function planningBoardNotes(board) {
  return [board.notepad.trim(), ...board.nodes.map((node) => node.text.trim())]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);
}
