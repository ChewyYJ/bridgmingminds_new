import React from "react";
import type { BrainstormBoard } from "../types";
import {
  createPlanningBoard,
  planningBoardNotes,
} from "../../shared/planning-board.mjs";
import { IdeasBoard } from "./IdeasBoard";

export function createDailyBoard(): BrainstormBoard {
  const startedAt = new Date().toISOString();
  return {
    version: "daily-whiteboard-v1",
    startedAt,
    expiresAt: new Date(Date.parse(startedAt) + 60000).toISOString(),
    strokes: [],
    notes: [{ id: "ideas", text: "", x: 0, y: 0 }],
    connectors: [],
    snapshot: { version: 1, savedAt: startedAt, elementCount: 1 },
  };
}

// Keep the existing draft format so older typed notes can still be resumed.
export function dailyBoardText(board: BrainstormBoard | null): string {
  if (board?.planningBoard) return planningBoardNotes(board.planningBoard);
  return (
    board?.notes
      .map((note) => note.text)
      .filter(Boolean)
      .join("\n") || ""
  );
}

export function DailyBoard({
  board,
  onChange,
  onDone,
  onInteractionChange,
}: {
  board: BrainstormBoard;
  onChange: (board: BrainstormBoard) => void;
  onDone: () => void;
  onInteractionChange?: (active: boolean) => void;
}) {
  return (
    <IdeasBoard
      board={board.planningBoard || createPlanningBoard(dailyBoardText(board))}
      onInteractionChange={onInteractionChange}
      onDone={onDone}
      onChange={(planningBoard) =>
        onChange({
          ...board,
          planningBoard,
          notes: [
            {
              id: "ideas",
              text: planningBoardNotes(planningBoard),
              x: 0,
              y: 0,
            },
          ],
          strokes: [],
          connectors: [],
          snapshot: {
            version: 1,
            savedAt: new Date().toISOString(),
            elementCount: 1,
          },
        })
      }
    />
  );
}
