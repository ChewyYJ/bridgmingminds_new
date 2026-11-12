export type ThoughtGuideMode = "spin_speak" | "debate" | "read_reflect";
export interface GuidingQuestion {
  question: string;
  placeholder: string;
}
export function getThoughtGuide(
  mode: ThoughtGuideMode,
  evaluation?: { guiding_questions?: unknown } | null,
): [GuidingQuestion, GuidingQuestion, GuidingQuestion];
