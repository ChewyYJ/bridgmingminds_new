import { z } from "zod";
import {
  MAX_PLAN_NODES,
  MAX_PLAN_POINTS,
  MAX_PLAN_STROKES,
} from "../shared/planning-board.mjs";
const port = z.enum(["top-left", "top-right", "bottom-right", "bottom-left"]);
const id = z.string().min(1).max(80);
export const planningBoardSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["notepad", "mindmap", "draw"]),
    notepad: z.string().max(2000),
    nodes: z
      .array(
        z
          .object({
            id,
            text: z.string().max(120),
            shape: z.enum(["box", "circle"]),
            x: z.number().finite().min(0).max(1),
            y: z.number().finite().min(0).max(1),
          })
          .strict(),
      )
      .max(MAX_PLAN_NODES),
    links: z
      .array(
        z
          .object({
            id,
            from: id,
            to: id,
            fromPort: port.optional(),
            toPort: port.optional(),
          })
          .strict(),
      )
      .max(36),
    strokes: z
      .array(
        z
          .object({
            id,
            points: z
              .array(
                z
                  .object({
                    x: z.number().int().min(0).max(320),
                    y: z.number().int().min(0).max(300),
                  })
                  .strict(),
              )
              .min(2)
              .max(320),
          })
          .strict(),
      )
      .max(MAX_PLAN_STROKES),
  })
  .strict()
  .superRefine((board, ctx) => {
    const ids = new Set(board.nodes.map((node) => node.id));
    const pairs = new Set(
      board.links.map((link) => [link.from, link.to].sort().join("|")),
    );
    if (
      ids.size !== board.nodes.length ||
      pairs.size !== board.links.length ||
      board.links.some(
        (link) =>
          link.from === link.to || !ids.has(link.from) || !ids.has(link.to),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Mind map links must connect distinct, existing ideas.",
      });
    if (
      board.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0) >
      MAX_PLAN_POINTS
    )
      ctx.addIssue({
        code: "custom",
        message: "The drawing is full. Remove a stroke to continue.",
      });
  });
